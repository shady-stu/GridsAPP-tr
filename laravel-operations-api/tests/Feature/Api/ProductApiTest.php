<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Enums\UserRole;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenantData;
use Tests\TestCase;

final class ProductApiTest extends TestCase
{
    use BuildsTenantData, RefreshDatabase;

    public function test_an_admin_can_create_a_product_in_their_own_tenant(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Admin);

        $response = $this->actingAs($actor)->postJson('/api/v1/products', [
            'sku' => 'WIDGET-100',
            'name' => 'Steel Widget 100',
            'description' => 'A sturdy widget.',
            'price' => '19.99',
            'stock_on_hand' => 250,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.sku', 'WIDGET-100')
            ->assertJsonPath('data.price', '19.99')
            ->assertJsonPath('data.currency', 'USD')
            ->assertJsonPath('data.stock_on_hand', 250)
            ->assertJsonPath('data.stock_reserved', 0)
            ->assertJsonPath('data.stock_available', 250)
            ->assertJsonPath('data.is_active', true)
            // tenant_id is an internal column and must not be exposed.
            ->assertJsonMissingPath('data.tenant_id');

        $this->assertDatabaseHas('products', [
            'sku' => 'WIDGET-100',
            'tenant_id' => $tenant->getKey(),
        ]);
    }

    public function test_a_member_cannot_create_a_product(): void
    {
        $tenant = $this->createTenant();
        $member = $this->createUser($tenant, UserRole::Member);

        $this->actingAs($member)->postJson('/api/v1/products', [
            'sku' => 'NOPE-1',
            'name' => 'Blocked',
            'price' => '1.00',
        ])->assertForbidden();

        $this->assertDatabaseMissing('products', ['sku' => 'NOPE-1']);
    }

    public function test_invalid_input_is_rejected_with_422(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);

        $this->actingAs($actor)->postJson('/api/v1/products', [
            'sku' => '',
            'name' => '',
            // More than two decimal places is not a valid money value.
            'price' => '1.234',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['sku', 'name', 'price']);
    }

    public function test_a_duplicate_sku_is_rejected_inside_a_tenant(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $this->createProduct($tenant, ['sku' => 'DUP-1']);

        $this->actingAs($actor)->postJson('/api/v1/products', [
            'sku' => 'DUP-1',
            'name' => 'Copy',
            'price' => '5.00',
        ])->assertStatus(422)->assertJsonValidationErrors('sku');
    }

    public function test_the_same_sku_is_allowed_in_a_different_tenant(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $this->createProduct($tenantB, ['sku' => 'SHARED-1']);

        // Uniqueness is per tenant and the rule must not leak the existence of
        // another tenant's product.
        $this->actingAs($actorA)->postJson('/api/v1/products', [
            'sku' => 'SHARED-1',
            'name' => 'Mine',
            'price' => '5.00',
        ])->assertCreated();
    }

    public function test_a_client_supplied_tenant_id_and_reserved_stock_are_ignored(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);

        $this->actingAs($actorA)->postJson('/api/v1/products', [
            'sku' => 'INJECT-1',
            'name' => 'Injected',
            'price' => '5.00',
            'tenant_id' => $tenantB->getKey(),
            // stock_reserved is not part of the request contract at all.
            'stock_reserved' => 999,
        ])
            ->assertCreated()
            ->assertJsonPath('data.stock_reserved', 0);

        $this->assertDatabaseHas('products', [
            'sku' => 'INJECT-1',
            'tenant_id' => $tenantA->getKey(),
            'stock_reserved' => 0,
        ]);
        $this->assertDatabaseMissing('products', [
            'sku' => 'INJECT-1',
            'tenant_id' => $tenantB->getKey(),
        ]);
    }

    public function test_another_tenants_product_is_not_readable_or_writable(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $foreign = $this->createProduct($tenantB, ['name' => 'Foreign']);

        $this->actingAs($actorA)
            ->getJson('/api/v1/products/'.$foreign->getKey())
            ->assertNotFound();

        $this->actingAs($actorA)
            ->patchJson('/api/v1/products/'.$foreign->getKey(), ['name' => 'Hijacked'])
            ->assertNotFound();

        $this->assertDatabaseHas('products', [
            'id' => $foreign->getKey(),
            'name' => 'Foreign',
        ]);
    }

    public function test_the_index_is_tenant_scoped_paginated_and_sorted(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);

        collect(range(1, 7))->each(fn (int $i): Product => $this->createProduct($tenantA, [
            'sku' => "A-{$i}",
            'name' => "Alpha {$i}",
        ]));
        collect(range(1, 3))->each(fn (int $i): Product => $this->createProduct($tenantB, [
            'sku' => "B-{$i}",
            'name' => "Bravo {$i}",
        ]));

        $this->actingAs($actorA)
            ->getJson('/api/v1/products?per_page=5&page=1')
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.total', 7)
            ->assertJsonPath('meta.per_page', 5);

        // Ascending by name: "Alpha 1" sorts before "Alpha 2", and no product of
        // tenant B can ever appear.
        $names = $this->actingAs($actorA)
            ->getJson('/api/v1/products?sort=name&direction=asc&per_page=100')
            ->json('data.*.name');

        $this->assertSame(7, count($names));
        $this->assertStringStartsWith('Alpha 1', (string) $names[0]);
    }

    public function test_the_index_supports_search_is_active_and_price_filters(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);

        $this->createProduct($tenant, ['sku' => 'A-1', 'name' => 'Alpha Bolt', 'price' => '10.00']);
        $this->createProduct($tenant, ['sku' => 'B-1', 'name' => 'Beta Widget', 'price' => '50.00', 'is_active' => false]);
        $this->createProduct($tenant, ['sku' => 'Z-1', 'name' => 'Zeta Pump', 'price' => '100.00']);

        $this->actingAs($actor)
            ->getJson('/api/v1/products?search=alpha')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Alpha Bolt');

        $this->actingAs($actor)
            ->getJson('/api/v1/products?min_price=40&max_price=60')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Beta Widget');

        $this->actingAs($actor)
            ->getJson('/api/v1/products?is_active=0')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_active', false);
    }

    public function test_on_hand_stock_cannot_drop_below_the_reserved_quantity(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10, 'stock_reserved' => 5]);

        // 3 < 5 reserved: the API rejects it with a readable 422 instead of
        // letting the products_stock_invariants CHECK constraint blow up.
        $this->actingAs($actor)
            ->patchJson('/api/v1/products/'.$product->getKey(), ['stock_on_hand' => 3])
            ->assertStatus(422)
            ->assertJsonValidationErrors('stock_on_hand');

        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 10,
        ]);
    }

    public function test_an_empty_patch_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $product = $this->createProduct($tenant);

        $this->actingAs($actor)
            ->patchJson('/api/v1/products/'.$product->getKey(), [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_a_sort_column_outside_the_allow_list_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);

        $this->actingAs($actor)
            ->getJson('/api/v1/products?sort=tenant_id;drop table products')
            ->assertStatus(422)
            ->assertJsonValidationErrors('sort');
    }
}
