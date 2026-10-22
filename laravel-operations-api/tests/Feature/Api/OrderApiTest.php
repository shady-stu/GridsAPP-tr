<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ReservationStatus;
use App\Enums\UserRole;
use App\Jobs\SendOrderConfirmation;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\BuildsTenantData;
use Tests\TestCase;

final class OrderApiTest extends TestCase
{
    use BuildsTenantData, RefreshDatabase;

    public function test_an_order_is_priced_from_trusted_database_prices(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $widget = $this->createProduct($tenant, ['price' => '19.99', 'stock_on_hand' => 10]);

        $response = $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [
                [
                    'product_id' => $widget->getKey(),
                    'quantity' => 3,
                    // None of these are part of the contract: they are ignored,
                    // never trusted.
                    'unit_price' => '0.01',
                    'line_total' => '0.03',
                ],
            ],
            'total' => '0.03',
            'tenant_id' => $tenant->getKey() + 999,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.subtotal', '59.97')
            ->assertJsonPath('data.tax_total', '0.00')
            ->assertJsonPath('data.total', '59.97')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.currency', 'USD')
            ->assertJsonPath('data.items.0.unit_price', '19.99')
            ->assertJsonPath('data.items.0.quantity', 3)
            ->assertJsonPath('data.items.0.line_total', '59.97');

        // The human readable order number is derived from the auto increment id.
        $this->assertMatchesRegularExpression('/^ORD-\d{8}$/', (string) $response->json('data.number'));
    }

    public function test_creating_an_order_holds_stock_and_writes_items_and_reservations(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $widget = $this->createProduct($tenant, ['price' => '10.00', 'stock_on_hand' => 10]);

        $orderId = (int) $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $widget->getKey(), 'quantity' => 3]],
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('products', [
            'id' => $widget->getKey(),
            'stock_on_hand' => 10,
            'stock_reserved' => 3,
        ]);

        $this->assertDatabaseHas('order_items', [
            'order_id' => $orderId,
            'product_id' => $widget->getKey(),
            'product_sku' => $widget->sku,
            'quantity' => 3,
            'line_total' => '30.00',
        ]);

        $this->assertDatabaseHas('stock_reservations', [
            'order_id' => $orderId,
            'product_id' => $widget->getKey(),
            'quantity' => 3,
            'status' => ReservationStatus::Held->value,
            // A hold attached to an order does not expire.
            'expires_at' => null,
        ]);
    }

    public function test_duplicate_product_lines_consume_stock_cumulatively(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $widget = $this->createProduct($tenant, ['price' => '10.00', 'stock_on_hand' => 10]);

        $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [
                ['product_id' => $widget->getKey(), 'quantity' => 4],
                ['product_id' => $widget->getKey(), 'quantity' => 3],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.subtotal', '70.00')
            ->assertJsonCount(2, 'data.items');

        $this->assertDatabaseHas('products', ['id' => $widget->getKey(), 'stock_reserved' => 7]);
    }

    public function test_a_member_can_place_an_order_but_cannot_change_its_status(): void
    {
        $tenant = $this->createTenant();
        $member = $this->createUser($tenant, UserRole::Member);
        $customer = $this->createCustomer($tenant);
        $widget = $this->createProduct($tenant, ['stock_on_hand' => 5]);

        $orderId = (int) $this->actingAs($member)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $widget->getKey(), 'quantity' => 1]],
        ])->assertCreated()->json('data.id');

        $this->actingAs($member)
            ->patchJson('/api/v1/orders/'.$orderId, ['status' => OrderStatus::Confirmed->value])
            ->assertForbidden();

        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => OrderStatus::Pending->value]);
    }

    public function test_an_order_for_another_tenants_customer_is_rejected(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $foreignCustomer = $this->createCustomer($tenantB);
        $widget = $this->createProduct($tenantA, ['stock_on_hand' => 5]);

        $this->actingAs($actorA)->postJson('/api/v1/orders', [
            'customer_id' => $foreignCustomer->getKey(),
            'items' => [['product_id' => $widget->getKey(), 'quantity' => 1]],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');

        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('products', ['id' => $widget->getKey(), 'stock_reserved' => 0]);
    }

    public function test_an_order_for_an_inactive_customer_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant, ['status' => CustomerStatus::Inactive]);
        $widget = $this->createProduct($tenant, ['stock_on_hand' => 5]);

        $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $widget->getKey(), 'quantity' => 1]],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_an_order_containing_a_foreign_product_is_rejected(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $customer = $this->createCustomer($tenantA);
        $foreignProduct = $this->createProduct($tenantB, ['stock_on_hand' => 100]);

        $this->actingAs($actorA)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $foreignProduct->getKey(), 'quantity' => 1]],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items');

        $this->assertDatabaseCount('orders', 0);
        // The foreign product was never touched.
        $this->assertDatabaseHas('products', ['id' => $foreignProduct->getKey(), 'stock_reserved' => 0]);
    }

    public function test_an_order_containing_an_inactive_product_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $product = $this->createProduct($tenant, ['is_active' => false, 'stock_on_hand' => 100]);

        $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $product->getKey(), 'quantity' => 1]],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items');

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_insufficient_stock_rolls_back_the_entire_order(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $scarce = $this->createProduct($tenant, ['price' => '10.00', 'stock_on_hand' => 5]);
        $plenty = $this->createProduct($tenant, ['price' => '20.00', 'stock_on_hand' => 100]);

        $response = $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [
                ['product_id' => $plenty->getKey(), 'quantity' => 2],
                // More than the 5 units on hand: the whole order must fail.
                ['product_id' => $scarce->getKey(), 'quantity' => 6],
            ],
        ]);

        $response->assertStatus(409)
            ->assertJsonPath('details.product_id', $scarce->getKey())
            ->assertJsonPath('details.requested', 6)
            ->assertJsonPath('details.available', 5);

        // No partial order: no order row, no items, no reservations at all, and
        // the first product's hold was rolled back with the rest.
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        $this->assertDatabaseCount('stock_reservations', 0);
        $this->assertDatabaseHas('products', ['id' => $plenty->getKey(), 'stock_reserved' => 0]);
        $this->assertDatabaseHas('products', ['id' => $scarce->getKey(), 'stock_reserved' => 0]);
    }

    public function test_a_currency_mismatch_across_lines_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $usd = $this->createProduct($tenant, ['currency' => 'USD', 'stock_on_hand' => 10]);
        $eur = $this->createProduct($tenant, ['currency' => 'EUR', 'stock_on_hand' => 10]);

        $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [
                ['product_id' => $usd->getKey(), 'quantity' => 1],
                ['product_id' => $eur->getKey(), 'quantity' => 1],
            ],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('currency');

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_an_empty_item_list_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);

        $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items');
    }

    public function test_a_notification_is_queued_only_after_the_order_commits(): void
    {
        Queue::fake();

        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $widget = $this->createProduct($tenant, ['stock_on_hand' => 5]);

        $orderId = (int) $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $widget->getKey(), 'quantity' => 1]],
        ])->assertCreated()->json('data.id');

        Queue::assertPushed(
            SendOrderConfirmation::class,
            fn (SendOrderConfirmation $job): bool => $job->orderId === $orderId,
        );

        // The listener is synchronous, so the "queued" audit event exists while
        // the actual send is still deferred to the worker.
        $this->assertDatabaseHas('operational_events', [
            'type' => 'order.notification_queued',
            'subject_id' => $orderId,
        ]);
        $this->assertDatabaseMissing('operational_events', [
            'type' => 'order.notification_sent',
        ]);
    }

    public function test_a_rolled_back_order_never_queues_a_notification(): void
    {
        Queue::fake();

        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $widget = $this->createProduct($tenant, ['stock_on_hand' => 1]);

        $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $widget->getKey(), 'quantity' => 5]],
        ])->assertStatus(409);

        // Rolled back orders must leave no trace: no job, no audit event, no row.
        Queue::assertNothingPushed();
        $this->assertDatabaseMissing('operational_events', ['type' => 'order.notification_queued']);
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_an_order_can_be_confirmed_and_then_fulfilled_which_commits_stock(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $order = $this->placeOrder($tenant, $owner, stockOnHand: 10, quantity: 3, price: '10.00');
        $product = Product::query()->forTenant($tenant)->where('id', $order->items()->first()?->product_id)->firstOrFail();

        // Confirming keeps the hold: the goods have not left the warehouse yet.
        $this->actingAs($owner)
            ->patchJson('/api/v1/orders/'.$order->getKey(), ['status' => OrderStatus::Confirmed->value])
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');

        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 10,
            'stock_reserved' => 3,
        ]);

        // Fulfilling commits the hold: on hand and reserved both drop.
        $this->actingAs($owner)
            ->patchJson('/api/v1/orders/'.$order->getKey(), ['status' => OrderStatus::Fulfilled->value])
            ->assertOk()
            ->assertJsonPath('data.status', 'fulfilled');

        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 7,
            'stock_reserved' => 0,
        ]);
        $this->assertDatabaseHas('stock_reservations', [
            'order_id' => $order->getKey(),
            'status' => ReservationStatus::Committed->value,
        ]);
    }

    public function test_cancelling_an_order_returns_the_stock_to_available(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $order = $this->placeOrder($tenant, $owner, stockOnHand: 10, quantity: 4, price: '10.00');
        $product = Product::query()->forTenant($tenant)->where('id', $order->items()->first()?->product_id)->firstOrFail();

        $this->actingAs($owner)
            ->patchJson('/api/v1/orders/'.$order->getKey(), [
                'status' => OrderStatus::Cancelled->value,
                'notes' => 'Customer changed their mind.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.notes', 'Customer changed their mind.');

        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 10,
            'stock_reserved' => 0,
        ]);
        $this->assertDatabaseHas('stock_reservations', [
            'order_id' => $order->getKey(),
            'status' => ReservationStatus::Released->value,
        ]);
    }

    public function test_an_illegal_transition_is_rejected_with_409(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $order = $this->placeOrder($tenant, $owner, stockOnHand: 10, quantity: 1);

        // pending -> fulfilled skips the confirmed step and is not allowed.
        $this->actingAs($owner)
            ->patchJson('/api/v1/orders/'.$order->getKey(), ['status' => OrderStatus::Fulfilled->value])
            ->assertStatus(409)
            ->assertJsonPath('details.from', 'pending')
            ->assertJsonPath('details.to', 'fulfilled');

        $this->assertDatabaseHas('orders', ['id' => $order->getKey(), 'status' => 'pending']);
    }

    public function test_a_terminal_order_cannot_be_reopened(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $order = $this->placeOrder($tenant, $owner, stockOnHand: 10, quantity: 1);

        $this->actingAs($owner)
            ->patchJson('/api/v1/orders/'.$order->getKey(), ['status' => OrderStatus::Cancelled->value])
            ->assertOk();

        $this->actingAs($owner)
            ->patchJson('/api/v1/orders/'.$order->getKey(), ['status' => OrderStatus::Confirmed->value])
            ->assertStatus(409);

        $this->assertDatabaseHas('orders', ['id' => $order->getKey(), 'status' => 'cancelled']);
    }

    public function test_the_index_is_tenant_scoped_and_eager_loads_its_relations(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);

        $customerA = $this->createCustomer($tenantA, ['name' => 'Acme Buyer']);
        $this->placeOrder($tenantA, $actorA, customer: $customerA, stockOnHand: 10, quantity: 2);

        // An order that belongs to tenant B must never show up for tenant A.
        $customerB = $this->createCustomer($tenantB);
        $this->placeOrder($tenantB, $this->createUser($tenantB, UserRole::Owner), customer: $customerB, stockOnHand: 10, quantity: 1);

        $this->actingAs($actorA)
            ->getJson('/api/v1/orders')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.customer.name', 'Acme Buyer')
            ->assertJsonPath('data.0.items_count', 1)
            ->assertJsonCount(1, 'data.0.items')
            // The collection endpoint must not include the heavier relations.
            ->assertJsonMissingPath('data.0.reservations');
    }

    public function test_orders_can_be_filtered_by_status_and_customer(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant);
        $other = $this->createCustomer($tenant);

        $pending = $this->placeOrder($tenant, $owner, customer: $customer, stockOnHand: 10, quantity: 1);
        $this->placeOrder($tenant, $owner, customer: $other, stockOnHand: 10, quantity: 1, status: OrderStatus::Confirmed);

        $this->actingAs($owner)
            ->getJson('/api/v1/orders?status=confirmed')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', 'confirmed');

        $this->actingAs($owner)
            ->getJson('/api/v1/orders?customer_id='.$customer->getKey())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $pending->getKey());
    }

    /**
     * Creates an order through the API so the test exercises the real lifecycle
     * (totals, holds and order number) rather than a factory shortcut.
     */
    private function placeOrder(
        Tenant $tenant,
        User $actor,
        ?Customer $customer = null,
        int $stockOnHand = 10,
        int $quantity = 1,
        string $price = '10.00',
        OrderStatus $status = OrderStatus::Pending,
    ): Order {
        $customer ??= $this->createCustomer($tenant);
        $product = $this->createProduct($tenant, ['price' => $price, 'stock_on_hand' => $stockOnHand]);

        $response = $this->actingAs($actor)->postJson('/api/v1/orders', [
            'customer_id' => $customer->getKey(),
            'items' => [['product_id' => $product->getKey(), 'quantity' => $quantity]],
        ])->assertCreated();

        $orderId = (int) $response->json('data.id');

        if ($status !== OrderStatus::Pending) {
            $order = Order::query()->forTenant($tenant)->whereKey($orderId)->firstOrFail();
            $order->forceFill(['status' => $status])->save();
        }

        return Order::query()->forTenant($tenant)->whereKey($orderId)->firstOrFail();
    }
}
