<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\Order;
use Illuminate\Foundation\Http\FormRequest;

final class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Order::class) ?? false;
    }

    /**
     * Note what is absent on purpose: there is no tenant_id, no unit_price, no
     * line_total, no subtotal and no total. Prices and totals are always derived
     * from the products table by the CreateOrder action, so a tampered payload
     * cannot influence what an order costs.
     *
     * Duplicate product lines are allowed and consume stock cumulatively.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'customer_id' => ['required', 'integer', 'min:1'],
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:10000'],
            'currency' => ['sometimes', 'string', 'size:3', 'alpha'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
