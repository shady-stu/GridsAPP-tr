<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\OrderStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('order')) ?? false;
    }

    /**
     * Only the state machine input is accepted here. Whether the requested
     * transition is actually legal is a business rule and lives in the
     * UpdateOrderStatus action, which answers with 409 when the lifecycle says no.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(OrderStatus::class)],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'status.required' => 'A target status is required (pending, confirmed, fulfilled or cancelled).',
        ];
    }
}
