<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\BuildsTenantData;
use Tests\Concerns\CountsQueries;
use Tests\TestCase;

/**
 * Guards the shape of the collection endpoints.
 *
 * The order index eager loads `customer` and `items` and uses withCount, so the
 * number of SQL statements must not depend on how many rows are on the page.
 * A regression here (an accidental N+1) would not break correctness - the same
 * JSON would come back - so it is asserted explicitly, at two dataset sizes.
 */
final class OrderQueryPerformanceTest extends TestCase
{
    use BuildsTenantData, CountsQueries, RefreshDatabase;

    /**
     * The exact query budget of each collection endpoint, so the eager loading
     * contract is spelled out rather than merely bounded.
     *
     * Orders index: 1 pagination count + 1 page query + 1 customers + 1 items.
     * Customers index: 1 pagination count + 1 page query (withCount is a
     * aggregate subquery, not a query per row).
     */
    private const ORDER_INDEX_QUERIES = 4;

    private const CUSTOMER_INDEX_QUERIES = 2;

    public function test_the_order_index_query_count_is_constant_as_the_dataset_grows(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $product = $this->createProduct($tenant, ['price' => '10.00', 'stock_on_hand' => 1000]);

        $this->seedOrders($tenant, $customer, $product, 3);

        // Warm up: the first request of a test can resolve one-off bindings that
        // would otherwise be counted only on the small dataset.
        $this->getOrderIndex($actor)->assertOk();

        $small = $this->countQueries(fn () => $this->getOrderIndex($actor)->assertOk());
        $repeated = $this->countQueries(fn () => $this->getOrderIndex($actor)->assertOk());

        // Same dataset, same request: the measurement itself must be stable.
        $this->assertSame($small, $repeated);

        $this->seedOrders($tenant, $customer, $product, 12);

        $large = $this->countQueries(fn () => $this->getOrderIndex($actor)->assertOk());

        $this->assertSame(
            $repeated,
            $large,
            'The orders index must run a constant number of queries regardless of how many orders exist.',
        );
        $this->assertSame(self::ORDER_INDEX_QUERIES, $large);
    }

    public function test_the_order_index_returns_every_order_from_every_page(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $product = $this->createProduct($tenant, ['price' => '10.00', 'stock_on_hand' => 1000]);

        // Two pages of relations were already loaded for one page's worth of
        // rows in the old shape: assert the payload is actually complete.
        $this->seedOrders($tenant, $customer, $product, 6);

        $this->getOrderIndex($actor)
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.total', 6)
            ->assertJsonPath('data.0.items_count', 1)
            ->assertJsonCount(1, 'data.0.items')
            ->assertJsonPath('data.0.customer.id', $customer->getKey());
    }

    public function test_the_customer_index_query_count_is_constant_as_the_dataset_grows(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);

        $this->seedCustomersWithOrders($tenant, 3);

        $this->getCustomerIndex($actor)->assertOk();

        $small = $this->countQueries(fn () => $this->getCustomerIndex($actor)->assertOk());
        $repeated = $this->countQueries(fn () => $this->getCustomerIndex($actor)->assertOk());

        $this->assertSame($small, $repeated);

        $this->seedCustomersWithOrders($tenant, 12);

        $large = $this->countQueries(fn () => $this->getCustomerIndex($actor)->assertOk());

        $this->assertSame(
            $repeated,
            $large,
            'The customers index must run a single aggregate query for its withCount, not one per row.',
        );
        $this->assertSame(self::CUSTOMER_INDEX_QUERIES, $large);
    }

    private function getOrderIndex(User $actor): TestResponse
    {
        return $this->actingAs($actor)->getJson('/api/v1/orders?per_page=5');
    }

    private function getCustomerIndex(User $actor): TestResponse
    {
        return $this->actingAs($actor)->getJson('/api/v1/customers?per_page=5');
    }

    private function seedOrders(Tenant $tenant, Customer $customer, Product $product, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $order = Order::factory()->create([
                'tenant_id' => $tenant->getKey(),
                'customer_id' => $customer->getKey(),
                'status' => OrderStatus::Pending,
            ]);

            OrderItem::factory()->create([
                'tenant_id' => $tenant->getKey(),
                'order_id' => $order->getKey(),
                'product_id' => $product->getKey(),
            ]);
        }
    }

    private function seedCustomersWithOrders(Tenant $tenant, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $customer = $this->createCustomer($tenant);

            Order::factory()->create([
                'tenant_id' => $tenant->getKey(),
                'customer_id' => $customer->getKey(),
            ]);
        }
    }
}
