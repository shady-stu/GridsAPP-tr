<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

final class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Customer::class) ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:255', $this->uniqueEmail()],
            'phone' => ['nullable', 'string', 'max:40'],
            'status' => ['sometimes', Rule::enum(CustomerStatus::class)],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * tenant_id is taken from the authenticated user, never from the request, so
     * a client cannot test for the existence of an email in another tenant.
     */
    private function uniqueEmail(): Unique
    {
        return Rule::unique('customers', 'email')
            ->where('tenant_id', $this->user()->tenant_id);
    }
}
