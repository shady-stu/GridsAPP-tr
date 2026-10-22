<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\OperationalEventType;
use App\Enums\ReservationStatus;
use App\Exceptions\StockReservationConflictException;
use App\Models\Product;
use App\Models\StockReservation;
use App\Services\OperationalEventLogger;
use Illuminate\Support\Facades\DB;

/**
 * ReleaseStockReservation - gives a hold back to available stock.
 *
 * Transaction boundary: the product's reserved counter and the reservation
 * state change together. Both rows are locked (`FOR UPDATE`) before they are
 * touched so the counter cannot be lost to a concurrent reservation.
 *
 * Releasing is not idempotent on purpose: a second release is reported as a
 * 409 conflict so a caller with a stale view of inventory finds out.
 */
final class ReleaseStockReservation
{
    public function __construct(private readonly OperationalEventLogger $events) {}

    public function handle(StockReservation $reservation): StockReservation
    {
        return DB::transaction(function () use ($reservation): StockReservation {
            /** @var StockReservation $locked */
            $locked = StockReservation::query()
                ->whereKey($reservation->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if (! $locked->isActive()) {
                throw new StockReservationConflictException($locked);
            }

            /** @var Product $product */
            $product = Product::query()
                ->whereKey($locked->product_id)
                ->lockForUpdate()
                ->firstOrFail();

            $product->forceFill([
                'stock_reserved' => max(0, $product->stock_reserved - $locked->quantity),
            ])->save();

            $locked->forceFill(['status' => ReservationStatus::Released])->save();

            $this->events->record(
                type: OperationalEventType::StockReservationReleased,
                subject: $locked,
                payload: [
                    'reservation_id' => (int) $locked->getKey(),
                    'product_id' => (int) $locked->product_id,
                    'quantity' => (int) $locked->quantity,
                    'released' => true,
                ],
            );

            return $locked;
        });
    }
}
