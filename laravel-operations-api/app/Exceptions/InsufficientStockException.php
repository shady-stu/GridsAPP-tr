<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Models\Product;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Thrown when a reservation would take stock_reserved above stock_on_hand.
 * Rendered as HTTP 409 Conflict: the request was valid but the inventory state
 * does not allow it.
 */
final class InsufficientStockException extends RuntimeException
{
    public function __construct(
        public readonly Product $product,
        public readonly int $requested,
        public readonly int $available,
    ) {
        parent::__construct(sprintf(
            'Insufficient stock for product %s: requested %d, available %d.',
            (string) $product->getKey(),
            $requested,
            $available,
        ));
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => 'The requested quantity exceeds the available stock.',
            'errors' => [
                'quantity' => [$this->getMessage()],
            ],
            'details' => [
                'product_id' => (int) $this->product->getKey(),
                'requested' => $this->requested,
                'available' => $this->available,
            ],
        ], 409);
    }
}
