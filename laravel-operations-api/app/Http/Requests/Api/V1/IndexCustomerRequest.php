<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use Illuminate\Validation\Rule;

final class IndexCustomerRequest extends ListRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Customer::class) ?? false;
    }

    /**
     * @return array<int, string>
     */
    protected function sortableColumns(): array
    {
        return ['created_at', 'updated_at', 'name', 'email', 'status'];
    }

    /**
     * @return array<string, mixed>
     */
    protected function filters(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(CustomerStatus::class)],
            'search' => ['sometimes', 'string', 'max:100'],
        ];
    }
}
