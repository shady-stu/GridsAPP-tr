<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\StockReservation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin StockReservation
 */
final class StockReservationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product_id' => $this->product_id,
            'order_id' => $this->order_id,
            'quantity' => (int) $this->quantity,
            'status' => $this->status->value,
            'idempotency_key' => $this->idempotency_key,
            'expires_at' => $this->expires_at?->toISOString(),
            'product' => new ProductResource($this->whenLoaded('product')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
