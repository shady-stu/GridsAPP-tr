<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\OperationalEventType;
use App\Enums\ReservationStatus;
use App\Exceptions\InsufficientStockException;
use App\Models\Order;
use App\Models\Product;
use App\Models\StockReservation;
use App\Services\OperationalEventLogger;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * ReserveStock - holds inventory for a product.
 *
 * Concurrency strategy
 * --------------------
 * 1. The product row is read with `SELECT ... FOR UPDATE`, so two concurrent
 *    reservations for the same product serialize on that row instead of both
 *    reading the same available quantity.
 * 2. Availability is re-checked *after* the lock is held and before the
 *    write, so the check is always based on committed-and-locked state.
 * 3. The `products_stock_invariants` CHECK constraint
 *    (stock_reserved <= stock_on_hand) is the last line of defence: even if
 *    application code were bypassed the database refuses the oversell.
 * 4. The stock update, the reservation row and the operational event are
 *    written inside one transaction, so a failure cannot leave stock held with
 *    no reservation record (or vice versa).
 *
 * Replay safety
 * -------------
 * A client may pass an `idempotency_key`. The reservation table has a unique
 * (tenant_id, idempotency_key) index, so a retried HTTP request returns the
 * original reservation instead of reserving the same inventory twice. Losing
 * the race on that key is handled explicitly by re-reading the winner.
 */
final class ReserveStock
{
    public function __construct(private readonly OperationalEventLogger $events) {}

    public function handle(
        Product $product,
        int $quantity,
        ?string $idempotencyKey = null,
        ?Order $order = null,
    ): StockReservation {
        if ($quantity < 1) {
            throw new InvalidArgumentException('A reservation must request at least one unit.');
        }

        try {
            return DB::transaction(function () use ($product, $quantity, $idempotencyKey, $order): StockReservation {
                if ($idempotencyKey !== null) {
                    $existing = $this->findByKey($product, $idempotencyKey);

                    if ($existing !== null) {
                        return $existing;
                    }
                }

                /** @var Product $locked */
                $locked = Product::query()
                    ->whereKey($product->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();

                $available = max(0, $locked->stock_on_hand - $locked->stock_reserved);

                if ($quantity > $available) {
                    throw new InsufficientStockException($locked, $quantity, $available);
                }

                $locked->forceFill(['stock_reserved' => $locked->stock_reserved + $quantity])->save();

                $reservation = new StockReservation;
                // tenant_id is set from the locked row (never from the client) so
                // the reservation is written in the same transaction as the hold.
                $reservation->forceFill([
                    'tenant_id' => $locked->tenant_id,
                    'product_id' => $locked->getKey(),
                    'order_id' => $order?->getKey(),
                    'quantity' => $quantity,
                    'status' => ReservationStatus::Held,
                    'idempotency_key' => $idempotencyKey,
                    // A hold attached to an order lives as long as the order;
                    // a standalone hold expires so it cannot freeze inventory.
                    'expires_at' => $order === null
                        ? now()->addMinutes((int) config('orders.reservation_ttl_minutes'))
                        : null,
                ]);
                $reservation->save();

                $this->events->record(
                    type: OperationalEventType::StockReserved,
                    subject: $reservation,
                    payload: [
                        'product_id' => (int) $locked->getKey(),
                        'order_id' => $order?->getKey(),
                        'quantity' => $quantity,
                        'available_after' => max(0, $locked->stock_on_hand - $locked->stock_reserved),
                    ],
                );

                return $reservation;
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Another request won the race on the replay key. Its reservation is
            // the canonical result of this logical operation.
            if ($idempotencyKey === null) {
                throw $exception;
            }

            $existing = $this->findByKey($product, $idempotencyKey);

            if ($existing === null) {
                throw $exception;
            }

            return $existing;
        }
    }

    private function findByKey(Product $product, string $idempotencyKey): ?StockReservation
    {
        // Scoped by the product's tenant on purpose: without a request context
        // there is no global tenant scope to rely on.
        return StockReservation::query()
            ->where('tenant_id', $product->tenant_id)
            ->where('idempotency_key', $idempotencyKey)
            ->lockForUpdate()
            ->first();
    }
}
