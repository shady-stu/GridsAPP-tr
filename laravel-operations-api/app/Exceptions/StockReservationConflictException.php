<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Models\StockReservation;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Release is only meaningful for a reservation that is still holding stock.
 * Releasing twice is a client error (409), never a silent no-op, so the caller
 * learns that its view of the inventory is stale.
 */
final class StockReservationConflictException extends RuntimeException
{
    public function __construct(public readonly StockReservation $reservation)
    {
        parent::__construct(sprintf(
            'Reservation [%s] is already %s and can no longer be released.',
            (string) $reservation->getKey(),
            (string) $reservation->status->value,
        ));
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'errors' => [
                'status' => [$this->getMessage()],
            ],
        ], 409);
    }
}
