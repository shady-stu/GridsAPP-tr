<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Order
 */
final class OrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'status' => $this->status->value,
            'currency' => $this->currency,
            'subtotal' => (string) $this->subtotal,
            'tax_total' => (string) $this->tax_total,
            'total' => (string) $this->total,
            'notes' => $this->notes,
            'placed_at' => $this->placed_at?->toISOString(),
            'items_count' => $this->whenCounted('items'),
            // Only present when the controller eager loaded it, which keeps the
            // collection endpoint free of one query per order.
            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'items' => OrderItemResource::collection($this->whenLoaded('items')),
            'reservations' => StockReservationResource::collection($this->whenLoaded('reservations')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
