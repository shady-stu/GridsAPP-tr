<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\CreateCustomer;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexCustomerRequest;
use App\Http\Requests\Api\V1\StoreCustomerRequest;
use App\Http\Requests\Api\V1\UpdateCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Route -> middleware -> form request -> thin controller -> action -> model ->
 * resource. Nothing here decides business rules; it only wires the layers.
 */
final class CustomerController extends Controller
{
    public function index(IndexCustomerRequest $request): AnonymousResourceCollection
    {
        $customers = Customer::query()
            // withCount issues a single aggregate query for the whole page
            // instead of one count per customer.
            ->withCount('orders')
            ->when(
                $request->validated('status'),
                fn (Builder $query, string $status): Builder => $query->where('status', $status),
            )
            ->when(
                $request->validated('search'),
                fn (Builder $query, string $term): Builder => $query->search($term),
            )
            // sortColumn() is restricted to an allow-list by the form request.
            ->orderBy($request->sortColumn(), $request->direction())
            ->paginate($request->perPage())
            ->withQueryString();

        return CustomerResource::collection($customers);
    }

    public function show(Customer $customer): CustomerResource
    {
        return new CustomerResource($customer->loadCount('orders'));
    }

    public function store(StoreCustomerRequest $request, CreateCustomer $action): JsonResponse
    {
        $customer = $action->handle($request->user(), $request->validated());

        return (new CustomerResource($customer))->response()->setStatusCode(201);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): CustomerResource
    {
        $customer->fill($request->validated())->save();

        return new CustomerResource($customer);
    }
}
