<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Shared contract for collection endpoints: pagination is always capped and the
 * sort column must be an allow-listed, concrete column name, so an order-by
 * clause can never be injected through the query string.
 */
abstract class ListRequest extends FormRequest
{
    public const DEFAULT_PER_PAGE = 15;

    public const MAX_PER_PAGE = 100;

    /**
     * Columns a client is allowed to sort by.
     *
     * @return array<int, string>
     */
    abstract protected function sortableColumns(): array;

    /**
     * Resource specific filter rules.
     *
     * @return array<string, mixed>
     */
    abstract protected function filters(): array;

    /**
     * @return array<string, mixed>
     */
    final public function rules(): array
    {
        return array_merge([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'sort' => ['sometimes', 'string', Rule::in($this->sortableColumns())],
            'direction' => ['sometimes', 'string', Rule::in(['asc', 'desc'])],
        ], $this->filters());
    }

    public function perPage(): int
    {
        $perPage = $this->validated('per_page');

        return $perPage === null ? self::DEFAULT_PER_PAGE : (int) $perPage;
    }

    public function sortColumn(): string
    {
        return (string) ($this->validated('sort') ?? 'created_at');
    }

    public function direction(): string
    {
        return (string) ($this->validated('direction') ?? 'desc');
    }
}
