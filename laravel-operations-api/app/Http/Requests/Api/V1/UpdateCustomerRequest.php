<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;
use Illuminate\Validation\Validator;

final class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('customer')) ?? false;
    }

    /**
     * PATCH semantics: every field is optional, but whatever is supplied must be
     * valid. An empty body is rejected by the `required_without_all` guard below.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'min:1', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email:rfc', 'max:255', $this->uniqueEmail()],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'status' => ['sometimes', Rule::enum(CustomerStatus::class)],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Provide at least one field to update.',
        ];
    }

    private function uniqueEmail(): Unique
    {
        $customer = $this->route('customer');

        return Rule::unique('customers', 'email')
            ->where('tenant_id', $this->user()->tenant_id)
            ->ignore($customer instanceof Customer ? $customer->getKey() : null);
    }

    /**
     * @return array<string, mixed>
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->all() === []) {
                $validator->errors()->add('name', 'Provide at least one field to update.');
            }
        });
    }
}
