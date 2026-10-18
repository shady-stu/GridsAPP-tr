<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin OrderItem
 */
final class OrderItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product_id' => $this->product_id,
            'product_sku' => $this->product_sku,
            'product_name' => $this->product_name,
            'unit_price' => (string) $this->unit_price,
            'quantity' => (int) $this->quantity,
            'line_total' => (string) $this->line_total,
        ];
    }
}
