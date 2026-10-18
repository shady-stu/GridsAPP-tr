<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Enums\OrderStatus;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Raised when a caller asks for an order state change the lifecycle does not
 * allow (for example fulfilled -> pending). 409 Conflict, not 422: the payload
 * was well formed, the resource simply is not in a state that permits it.
 */
final class InvalidOrderTransitionException extends RuntimeException
{
    public function __construct(
        public readonly OrderStatus $from,
        public readonly OrderStatus $to,
    ) {
        parent::__construct(sprintf(
            'Cannot move an order from [%s] to [%s].',
            $from->value,
            $to->value,
        ));
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'errors' => [
                'status' => [$this->getMessage()],
            ],
            'details' => [
                'from' => $this->from->value,
                'to' => $this->to->value,
                'allowed' => array_map(
                    static fn (OrderStatus $status): string => $status->value,
                    $this->from->allowedTransitions(),
                ),
            ],
        ], 409);
    }
}
