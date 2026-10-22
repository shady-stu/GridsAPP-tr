<?php

declare(strict_types=1);

namespace Tests\Concerns;

use App\Enums\OrderStatus;
use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\StockReservation;
use App\Models\Tenant;
use App\Models\User;

/**
 * Builds coherent tenant data for tests.
 *
 * Factories default to their own tenant so a bare `Customer::factory()` stays
 * valid; the helpers here are what wire a record to a *specific* tenant, which
 * is what tenant isolation tests need.
 */
trait BuildsTenantData
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createTenant(array $attributes = []): Tenant
    {
        return Tenant::factory()->create($attributes);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createUser(Tenant $tenant, UserRole $role = UserRole::Owner, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'tenant_id' => $tenant->getKey(),
            'role' => $role,
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createCustomer(Tenant $tenant, array $attributes = []): Customer
    {
        return Customer::factory()->create(array_merge([
            'tenant_id' => $tenant->getKey(),
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createProduct(Tenant $tenant, array $attributes = []): Product
    {
        return Product::factory()->create(array_merge([
            'tenant_id' => $tenant->getKey(),
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createOrder(Tenant $tenant, Customer $customer, array $attributes = []): Order
    {
        return Order::factory()->create(array_merge([
            'tenant_id' => $tenant->getKey(),
            'customer_id' => $customer->getKey(),
            'status' => OrderStatus::Pending,
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createReservation(Tenant $tenant, Product $product, array $attributes = []): StockReservation
    {
        return StockReservation::factory()->create(array_merge([
            'tenant_id' => $tenant->getKey(),
            'product_id' => $product->getKey(),
        ], $attributes));
    }
}
