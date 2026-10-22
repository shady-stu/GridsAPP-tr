<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\Product;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;
use Illuminate\Validation\Validator;

final class UpdateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('product')) ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'sku' => ['sometimes', 'required', 'string', 'min:1', 'max:64', $this->uniqueSku()],
            'name' => ['sometimes', 'required', 'string', 'min:1', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'price' => ['sometimes', 'required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
            'currency' => ['sometimes', 'string', 'size:3', 'alpha'],
            'stock_on_hand' => ['sometimes', 'integer', 'min:0', 'max:100000000', $this->cannotDropBelowReserved()],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    private function uniqueSku(): Unique
    {
        $product = $this->route('product');

        return Rule::unique('products', 'sku')
            ->where('tenant_id', $this->user()->tenant_id)
            ->ignore($product instanceof Product ? $product->getKey() : null);
    }

    /**
     * Mirrors the `products_stock_invariants` CHECK constraint
     * (stock_reserved <= stock_on_hand) so the client gets a 422 with a readable
     * message instead of a database error.
     */
    private function cannotDropBelowReserved(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            $product = $this->route('product');

            if ($product instanceof Product && (int) $value < (int) $product->stock_reserved) {
                $fail(sprintf(
                    'On-hand stock cannot be lower than the %d unit(s) currently reserved.',
                    $product->stock_reserved,
                ));
            }
        };
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->all() === []) {
                $validator->errors()->add('name', 'Provide at least one field to update.');
            }
        });
    }
}
