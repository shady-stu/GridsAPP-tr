<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\OrderStatus;
use App\Models\Order;
use Illuminate\Validation\Rule;

final class IndexOrderRequest extends ListRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Order::class) ?? false;
    }

    /**
     * @return array<int, string>
     */
    protected function sortableColumns(): array
    {
        return ['created_at', 'updated_at', 'total', 'status', 'placed_at'];
    }

    /**
     * @return array<string, mixed>
     */
    protected function filters(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(OrderStatus::class)],
            'customer_id' => ['sometimes', 'integer', 'min:1'],
            'placed_from' => ['sometimes', 'date'],
            'placed_until' => ['sometimes', 'date', 'after_or_equal:placed_from'],
        ];
    }
}
