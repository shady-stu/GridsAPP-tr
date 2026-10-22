<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\Product;

final class IndexProductRequest extends ListRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Product::class) ?? false;
    }

    /**
     * @return array<int, string>
     */
    protected function sortableColumns(): array
    {
        return ['created_at', 'updated_at', 'name', 'sku', 'price', 'stock_on_hand'];
    }

    /**
     * @return array<string, mixed>
     */
    protected function filters(): array
    {
        return [
            'is_active' => ['sometimes', 'boolean'],
            'search' => ['sometimes', 'string', 'max:100'],
            'min_price' => ['sometimes', 'numeric', 'min:0'],
            'max_price' => ['sometimes', 'numeric', 'min:0', 'gte:min_price'],
        ];
    }
}
