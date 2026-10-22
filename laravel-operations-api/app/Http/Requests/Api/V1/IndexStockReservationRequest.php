<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\ReservationStatus;
use App\Models\StockReservation;
use Illuminate\Validation\Rule;

final class IndexStockReservationRequest extends ListRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', StockReservation::class) ?? false;
    }

    /**
     * @return array<int, string>
     */
    protected function sortableColumns(): array
    {
        return ['created_at', 'updated_at', 'quantity', 'status', 'expires_at'];
    }

    /**
     * @return array<string, mixed>
     */
    protected function filters(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(ReservationStatus::class)],
            'product_id' => ['sometimes', 'integer', 'min:1'],
            'order_id' => ['sometimes', 'integer', 'min:1'],
        ];
    }
}
