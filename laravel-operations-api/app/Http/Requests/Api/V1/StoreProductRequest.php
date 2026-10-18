<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

final class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Product::class) ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'sku' => ['required', 'string', 'min:1', 'max:64', $this->uniqueSku()],
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            // Money is validated as a 2 decimal fixed scale number.
            'price' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
            'currency' => ['sometimes', 'string', 'size:3', 'alpha'],
            // stock_reserved is intentionally absent: it is only ever changed by
            // the stock reservation actions while holding a row lock.
            'stock_on_hand' => ['sometimes', 'integer', 'min:0', 'max:100000000'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    private function uniqueSku(): Unique
    {
        return Rule::unique('products', 'sku')
            ->where('tenant_id', $this->user()->tenant_id);
    }
}
