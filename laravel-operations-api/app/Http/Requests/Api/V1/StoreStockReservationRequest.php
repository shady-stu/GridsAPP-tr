<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\StockReservation;
use Illuminate\Foundation\Http\FormRequest;

final class StoreStockReservationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', StockReservation::class) ?? false;
    }

    /**
     * Accepting the replay key from a header as well as the body means a client
     * can make a reservation idempotent without changing its payload shape.
     */
    protected function prepareForValidation(): void
    {
        if (! $this->filled('idempotency_key') && $this->hasHeader('Idempotency-Key')) {
            $this->merge(['idempotency_key' => (string) $this->header('Idempotency-Key')]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'order_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            // Constrained charset keeps replay keys predictable in URLs/logs.
            'idempotency_key' => [
                'sometimes',
                'nullable',
                'string',
                'max:120',
                'regex:/^[A-Za-z0-9._:-]+$/',
            ],
        ];
    }
}
