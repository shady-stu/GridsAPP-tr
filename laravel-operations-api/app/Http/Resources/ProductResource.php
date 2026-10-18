<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Money is serialised as a fixed scale string ("19.99") rather than a float so
 * no precision is lost between PostgreSQL and the client.
 *
 * @mixin Product
 */
final class ProductResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'description' => $this->description,
            'price' => (string) $this->price,
            'currency' => $this->currency,
            'stock_on_hand' => (int) $this->stock_on_hand,
            'stock_reserved' => (int) $this->stock_reserved,
            'stock_available' => $this->availableStock(),
            'is_active' => (bool) $this->is_active,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
