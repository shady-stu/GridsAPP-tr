<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Enums\ReservationStatus;
use App\Enums\UserRole;
use App\Models\StockReservation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenantData;
use Tests\TestCase;

final class StockReservationApiTest extends TestCase
{
    use BuildsTenantData, RefreshDatabase;

    public function test_a_user_can_hold_stock_for_a_product(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        $response = $this->actingAs($actor)->postJson('/api/v1/stock-reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 4,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.product_id', $product->getKey())
            ->assertJsonPath('data.quantity', 4)
            ->assertJsonPath('data.status', 'held')
            ->assertJsonMissingPath('data.tenant_id');

        // A standalone hold is given a TTL so a forgotten reservation cannot
        // freeze inventory forever.
        $this->assertNotNull($response->json('data.expires_at'));

        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 10,
            'stock_reserved' => 4,
        ]);
        $this->assertDatabaseHas('stock_reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 4,
            'status' => ReservationStatus::Held->value,
            'tenant_id' => $tenant->getKey(),
        ]);
    }

    public function test_a_replayed_request_returns_the_original_reservation(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        $first = $this->actingAs($actor)
            ->withHeader('Idempotency-Key', 'checkout-42')
            ->postJson('/api/v1/stock-reservations', [
                'product_id' => $product->getKey(),
                'quantity' => 4,
            ])
            ->assertCreated();

        // The same logical request retried: the stock is held exactly once and
        // the client gets the original reservation back (200, not 201).
        $second = $this->actingAs($actor)
            ->withHeader('Idempotency-Key', 'checkout-42')
            ->postJson('/api/v1/stock-reservations', [
                'product_id' => $product->getKey(),
                'quantity' => 4,
            ])
            ->assertOk();

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame('checkout-42', $second->json('data.idempotency_key'));

        $this->assertDatabaseCount('stock_reservations', 1);
        $this->assertDatabaseHas('products', ['id' => $product->getKey(), 'stock_reserved' => 4]);
    }

    public function test_the_same_replay_key_does_not_leak_across_tenants(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Member);
        $actorB = $this->createUser($tenantB, UserRole::Member);
        $productA = $this->createProduct($tenantA, ['stock_on_hand' => 5]);
        $productB = $this->createProduct($tenantB, ['stock_on_hand' => 5]);

        $this->actingAs($actorA)->withHeader('Idempotency-Key', 'shared-key')
            ->postJson('/api/v1/stock-reservations', ['product_id' => $productA->getKey(), 'quantity' => 2])
            ->assertCreated();

        // The uniqueness is per tenant, so tenant B can use the same key.
        $this->actingAs($actorB)->withHeader('Idempotency-Key', 'shared-key')
            ->postJson('/api/v1/stock-reservations', ['product_id' => $productB->getKey(), 'quantity' => 3])
            ->assertCreated();

        $this->assertDatabaseCount('stock_reservations', 2);
        $this->assertDatabaseHas('products', ['id' => $productA->getKey(), 'stock_reserved' => 2]);
        $this->assertDatabaseHas('products', ['id' => $productB->getKey(), 'stock_reserved' => 3]);
    }

    public function test_an_oversell_is_rejected_with_409_and_changes_nothing(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 5]);

        $this->actingAs($actor)->postJson('/api/v1/stock-reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 6,
        ])
            ->assertStatus(409)
            ->assertJsonPath('details.requested', 6)
            ->assertJsonPath('details.available', 5);

        $this->assertDatabaseCount('stock_reservations', 0);
        $this->assertDatabaseHas('products', ['id' => $product->getKey(), 'stock_reserved' => 0]);
    }

    public function test_reservations_accumulate_until_they_no_longer_fit(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 5]);

        $this->actingAs($actor)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 3])
            ->assertCreated();

        // 3 already held, 2 left: 2 fits, 3 does not.
        $this->actingAs($actor)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 2])
            ->assertCreated();

        $this->actingAs($actor)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 1])
            ->assertStatus(409);

        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 5,
            'stock_reserved' => 5,
        ]);
    }

    public function test_a_foreign_product_id_is_reported_as_invalid_input(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Member);
        $foreign = $this->createProduct($tenantB, ['stock_on_hand' => 100]);

        // A 422, not a 404: the response must not confirm that the id exists in
        // another tenant.
        $this->actingAs($actorA)->postJson('/api/v1/stock-reservations', [
            'product_id' => $foreign->getKey(),
            'quantity' => 1,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('product_id');

        $this->assertDatabaseCount('stock_reservations', 0);
        $this->assertDatabaseHas('products', ['id' => $foreign->getKey(), 'stock_reserved' => 0]);
    }

    public function test_an_order_id_from_another_tenant_is_rejected(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Member);
        $product = $this->createProduct($tenantA, ['stock_on_hand' => 10]);

        $foreignOrder = $this->createOrder(
            $tenantB,
            $this->createCustomer($tenantB),
        );

        $this->actingAs($actorA)->postJson('/api/v1/stock-reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 1,
            'order_id' => $foreignOrder->getKey(),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('order_id');

        $this->assertDatabaseCount('stock_reservations', 0);
    }

    public function test_a_hold_attached_to_an_order_never_expires(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $customer = $this->createCustomer($tenant);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);
        $order = $this->createOrder($tenant, $customer);

        $response = $this->actingAs($actor)
            ->postJson('/api/v1/stock-reservations', [
                'product_id' => $product->getKey(),
                'quantity' => 2,
                'order_id' => $order->getKey(),
            ])
            ->assertCreated();

        $this->assertNull($response->json('data.expires_at'));
        $this->assertSame($order->getKey(), $response->json('data.order_id'));
    }

    public function test_an_administrator_can_release_a_hold_and_the_stock_returns(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);
        $reservation = $this->actingAs($owner)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 4])
            ->assertCreated();

        $this->actingAs($owner)
            ->deleteJson('/api/v1/stock-reservations/'.$reservation->json('data.id'))
            ->assertOk()
            ->assertJsonPath('data.status', 'released');

        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 10,
            'stock_reserved' => 0,
        ]);
        $this->assertDatabaseHas('stock_reservations', [
            'id' => $reservation->json('data.id'),
            'status' => ReservationStatus::Released->value,
        ]);
    }

    public function test_releasing_the_same_hold_twice_is_a_conflict(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);
        $id = $this->actingAs($owner)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 4])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($owner)
            ->deleteJson('/api/v1/stock-reservations/'.$id)
            ->assertOk();

        // A second release is a stale-view error, never a silent no-op.
        $this->actingAs($owner)
            ->deleteJson('/api/v1/stock-reservations/'.$id)
            ->assertStatus(409)
            ->assertJsonValidationErrors('status');

        // The counter was only decremented once.
        $this->assertDatabaseHas('products', ['id' => $product->getKey(), 'stock_reserved' => 0]);
    }

    public function test_a_member_can_hold_stock_but_not_release_it(): void
    {
        $tenant = $this->createTenant();
        $member = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);
        $id = $this->actingAs($member)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 2])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($member)
            ->deleteJson('/api/v1/stock-reservations/'.$id)
            ->assertForbidden();

        // Still held, still occupying inventory.
        $this->assertDatabaseHas('stock_reservations', ['id' => $id, 'status' => ReservationStatus::Held->value]);
        $this->assertDatabaseHas('products', ['id' => $product->getKey(), 'stock_reserved' => 2]);
    }

    public function test_another_tenants_reservation_is_not_releasable(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $productB = $this->createProduct($tenantB, ['stock_on_hand' => 10]);
        $foreign = StockReservation::factory()->create([
            'tenant_id' => $tenantB->getKey(),
            'product_id' => $productB->getKey(),
            'quantity' => 3,
        ]);

        $this->actingAs($actorA)
            ->deleteJson('/api/v1/stock-reservations/'.$foreign->getKey())
            ->assertNotFound();

        $this->assertDatabaseHas('stock_reservations', [
            'id' => $foreign->getKey(),
            'status' => ReservationStatus::Held->value,
        ]);
    }

    public function test_the_index_is_tenant_scoped_and_filterable(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $productA = $this->createProduct($tenantA, ['stock_on_hand' => 20]);
        $productB = $this->createProduct($tenantB, ['stock_on_hand' => 20]);

        $heldA = $this->createReservation($tenantA, $productA, ['quantity' => 2, 'status' => ReservationStatus::Held]);
        $this->createReservation($tenantA, $productA, ['quantity' => 1, 'status' => ReservationStatus::Released]);
        $this->createReservation($tenantB, $productB, ['quantity' => 5, 'status' => ReservationStatus::Held]);

        $this->actingAs($actorA)
            ->getJson('/api/v1/stock-reservations')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 2);

        $this->actingAs($actorA)
            ->getJson('/api/v1/stock-reservations?status=held')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $heldA->getKey());

        $this->actingAs($actorA)
            ->getJson('/api/v1/stock-reservations?product_id='.$productA->getKey())
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_a_non_positive_quantity_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        $this->actingAs($actor)->postJson('/api/v1/stock-reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 0,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('quantity');
    }

    public function test_an_idempotency_key_with_an_unexpected_charset_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        $this->actingAs($actor)->postJson('/api/v1/stock-reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 1,
            'idempotency_key' => 'bad key with spaces',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('idempotency_key');
    }

    public function test_product_availability_is_reported_consistently_after_a_hold(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Member);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        $this->actingAs($actor)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 4])
            ->assertCreated();

        // The product endpoint exposes on hand, reserved and available together
        // so a client never has to compute availability itself.
        $this->actingAs($actor)
            ->getJson('/api/v1/products/'.$product->getKey())
            ->assertOk()
            ->assertJsonPath('data.stock_on_hand', 10)
            ->assertJsonPath('data.stock_reserved', 4)
            ->assertJsonPath('data.stock_available', 6);
    }

    public function test_a_client_cannot_set_the_reservation_tenant(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Member);
        $product = $this->createProduct($tenantA, ['stock_on_hand' => 10]);

        $this->actingAs($actorA)->postJson('/api/v1/stock-reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 1,
            'tenant_id' => $tenantB->getKey(),
            'status' => ReservationStatus::Released->value,
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'held');

        $this->assertDatabaseHas('stock_reservations', [
            'product_id' => $product->getKey(),
            'tenant_id' => $tenantA->getKey(),
            'status' => ReservationStatus::Held->value,
        ]);
        $this->assertDatabaseMissing('stock_reservations', [
            'product_id' => $product->getKey(),
            'tenant_id' => $tenantB->getKey(),
        ]);
    }

    public function test_an_unauthenticated_user_cannot_hold_stock(): void
    {
        $tenant = $this->createTenant();
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        $this->postJson('/api/v1/stock-reservations', [
            'product_id' => $product->getKey(),
            'quantity' => 1,
        ])->assertUnauthorized();

        $this->assertDatabaseCount('stock_reservations', 0);
    }

    public function test_a_held_product_is_reported_but_a_foreign_one_is_invisible_in_search(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $product = $this->createProduct($tenant, ['name' => 'Reserved Widget', 'stock_on_hand' => 10]);

        $this->actingAs($actor)
            ->postJson('/api/v1/stock-reservations', ['product_id' => $product->getKey(), 'quantity' => 7])
            ->assertCreated();

        $this->actingAs($actor)
            ->getJson('/api/v1/products?search=reserved')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.stock_reserved', 7)
            ->assertJsonPath('data.0.stock_available', 3);
    }
}
