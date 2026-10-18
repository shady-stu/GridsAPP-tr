<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\OperationalEventType;
use App\Enums\OrderStatus;
use App\Enums\ReservationStatus;
use App\Exceptions\InvalidOrderTransitionException;
use App\Models\Order;
use App\Models\Product;
use App\Models\StockReservation;
use App\Services\OperationalEventLogger;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * UpdateOrderStatus - moves an order along its lifecycle and settles the
 * inventory that the order is holding.
 *
 * Inventory effects
 * -----------------
 *  - confirmed: holds stay `held` (goods are still in the warehouse).
 *  - fulfilled: holds become `committed` and both stock_on_hand and
 *    stock_reserved decrease by the reserved quantity, because the goods left.
 *  - cancelled: holds become `released` and stock_reserved decreases, returning
 *    the quantity to available stock.
 *
 * Transaction boundary: the order row is locked first, then every product it
 * touches, in product id order (deadlock avoidance), and all writes commit
 * together with the audit event.
 */
final class UpdateOrderStatus
{
    public function __construct(private readonly OperationalEventLogger $events) {}

    public function handle(Order $order, OrderStatus $target, ?string $notes = null): Order
    {
        return DB::transaction(function () use ($order, $target, $notes): Order {
            /** @var Order $locked */
            $locked = Order::query()
                ->whereKey($order->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            $current = $locked->status;

            if (! $current instanceof OrderStatus || ! $current->canTransitionTo($target)) {
                throw new InvalidOrderTransitionException(
                    $current instanceof OrderStatus ? $current : OrderStatus::Pending,
                    $target,
                );
            }

            match ($target) {
                OrderStatus::Cancelled => $this->releaseHolds($locked),
                OrderStatus::Fulfilled => $this->commitHolds($locked),
                default => null,
            };

            $locked->forceFill([
                'status' => $target,
                'notes' => $notes ?? $locked->notes,
            ])->save();

            $this->events->record(
                type: OperationalEventType::OrderStatusChanged,
                subject: $locked,
                payload: [
                    'order_id' => (int) $locked->getKey(),
                    'from' => $current->value,
                    'to' => $target->value,
                ],
            );

            return $locked;
        });
    }

    /**
     * @return Collection<int, StockReservation>
     */
    private function activeHolds(Order $order): Collection
    {
        return StockReservation::query()
            ->where('order_id', $order->getKey())
            ->active()
            ->orderBy('product_id')
            ->lockForUpdate()
            ->get();
    }

    private function releaseHolds(Order $order): void
    {
        foreach ($this->activeHolds($order) as $reservation) {
            $product = $this->lockProduct((int) $reservation->product_id);

            $product->forceFill([
                'stock_reserved' => max(0, $product->stock_reserved - $reservation->quantity),
            ])->save();

            $reservation->forceFill(['status' => ReservationStatus::Released])->save();
        }
    }

    private function commitHolds(Order $order): void
    {
        foreach ($this->activeHolds($order) as $reservation) {
            $product = $this->lockProduct((int) $reservation->product_id);

            // Both counters move in a single UPDATE. Decrementing stock_on_hand
            // alone would momentarily violate the
            // `stock_reserved <= stock_on_hand` CHECK constraint.
            $product->forceFill([
                'stock_on_hand' => max(0, $product->stock_on_hand - $reservation->quantity),
                'stock_reserved' => max(0, $product->stock_reserved - $reservation->quantity),
            ])->save();

            $reservation->forceFill(['status' => ReservationStatus::Committed])->save();
        }
    }

    private function lockProduct(int $productId): Product
    {
        /** @var Product $product */
        $product = Product::query()->whereKey($productId)->lockForUpdate()->firstOrFail();

        return $product;
    }
}
