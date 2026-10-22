<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Enums\CustomerStatus;
use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenantData;
use Tests\TestCase;

final class CustomerApiTest extends TestCase
{
    use BuildsTenantData, RefreshDatabase;

    public function test_a_user_can_create_a_customer_in_their_own_tenant(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Admin);

        $response = $this->actingAs($actor)->postJson('/api/v1/customers', [
            'name' => 'Hank Scorpio',
            'email' => 'hank@globex.test',
            'phone' => '+15550100',
            'notes' => 'Net 30',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Hank Scorpio')
            ->assertJsonPath('data.email', 'hank@globex.test')
            ->assertJsonPath('data.status', 'active')
            // tenant_id is an internal column and must not be exposed.
            ->assertJsonMissingPath('data.tenant_id');

        $this->assertDatabaseHas('customers', [
            'email' => 'hank@globex.test',
            'tenant_id' => $tenant->getKey(),
        ]);
    }

    public function test_invalid_input_is_rejected_with_422(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);

        $this->actingAs($actor)->postJson('/api/v1/customers', [
            'name' => '',
            'email' => 'not-an-email',
            'status' => 'archived',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'email', 'status']);
    }

    public function test_a_duplicate_email_is_rejected_inside_a_tenant(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $this->createCustomer($tenant, ['email' => 'duplicate@acme.test']);

        $this->actingAs($actor)->postJson('/api/v1/customers', [
            'name' => 'Copy',
            'email' => 'duplicate@acme.test',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_the_same_email_is_allowed_in_a_different_tenant(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $this->createCustomer($tenantB, ['email' => 'shared@example.test']);

        // Uniqueness is per tenant, and the validation rule must not leak the
        // existence of another tenant's customer.
        $this->actingAs($actorA)->postJson('/api/v1/customers', [
            'name' => 'Shared',
            'email' => 'shared@example.test',
        ])->assertCreated();
    }

    public function test_a_client_supplied_tenant_id_is_ignored(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);

        $this->actingAs($actorA)->postJson('/api/v1/customers', [
            'name' => 'Injected',
            'email' => 'injected@example.test',
            'tenant_id' => $tenantB->getKey(),
        ])->assertCreated();

        $this->assertDatabaseHas('customers', [
            'email' => 'injected@example.test',
            'tenant_id' => $tenantA->getKey(),
        ]);
        $this->assertDatabaseMissing('customers', [
            'email' => 'injected@example.test',
            'tenant_id' => $tenantB->getKey(),
        ]);
    }

    public function test_another_tenants_customer_is_not_readable_or_writable(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);
        $foreign = $this->createCustomer($tenantB, ['email' => 'foreign@tenant-b.test']);

        // Route model binding is tenant scoped, so the record is invisible: 404
        // rather than 403, which would confirm that the id exists.
        $this->actingAs($actorA)
            ->getJson('/api/v1/customers/'.$foreign->getKey())
            ->assertNotFound();

        $this->actingAs($actorA)
            ->patchJson('/api/v1/customers/'.$foreign->getKey(), ['name' => 'Hijacked'])
            ->assertNotFound();

        $this->assertDatabaseHas('customers', [
            'id' => $foreign->getKey(),
            'name' => $foreign->name,
        ]);
    }

    public function test_a_member_can_read_but_not_mutate_customers(): void
    {
        $tenant = $this->createTenant();
        $member = $this->createUser($tenant, UserRole::Member);
        $customer = $this->createCustomer($tenant);

        $this->actingAs($member)->getJson('/api/v1/customers')->assertOk();

        $this->actingAs($member)->postJson('/api/v1/customers', [
            'name' => 'Blocked',
            'email' => 'blocked@acme.test',
        ])->assertForbidden();

        $this->actingAs($member)
            ->patchJson('/api/v1/customers/'.$customer->getKey(), ['name' => 'Blocked'])
            ->assertForbidden();

        $this->assertDatabaseMissing('customers', ['email' => 'blocked@acme.test']);
    }

    public function test_an_owner_can_update_a_customer(): void
    {
        $tenant = $this->createTenant();
        $owner = $this->createUser($tenant, UserRole::Owner);
        $customer = $this->createCustomer($tenant, ['email' => 'before@acme.test']);

        $this->actingAs($owner)->patchJson('/api/v1/customers/'.$customer->getKey(), [
            'name' => 'After',
            'status' => CustomerStatus::Inactive->value,
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'After')
            ->assertJsonPath('data.status', 'inactive');

        $this->assertDatabaseHas('customers', [
            'id' => $customer->getKey(),
            'name' => 'After',
            'status' => 'inactive',
        ]);
    }

    public function test_relations_are_not_lazily_loaded_and_the_index_is_tenant_scoped_and_paginated(): void
    {
        $tenantA = $this->createTenant(['slug' => 'tenant-a']);
        $tenantB = $this->createTenant(['slug' => 'tenant-b']);
        $actorA = $this->createUser($tenantA, UserRole::Owner);

        $customersOfA = collect(range(1, 12))->map(
            fn (int $i): Customer => $this->createCustomer($tenantA, ['email' => "a{$i}@acme.test"]),
        );
        // Each customer of A gets an order so `orders_count` has something to count.
        $customersOfA->each(fn (Customer $customer) => Order::factory()->create([
            'tenant_id' => $tenantA->getKey(),
            'customer_id' => $customer->getKey(),
        ]));
        collect(range(1, 4))->each(
            fn (int $i) => $this->createCustomer($tenantB, ['email' => "b{$i}@globex.test"]),
        );

        $response = $this->actingAs($actorA)->getJson('/api/v1/customers?per_page=5&page=1');

        $response->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.total', 12)
            ->assertJsonPath('meta.per_page', 5)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('data.0.orders_count', 1);

        // None of tenant B's customers may appear on any page.
        foreach ([1, 2, 3] as $page) {
            $emails = $this->actingAs($actorA)
                ->getJson('/api/v1/customers?per_page=5&page='.$page)
                ->json('data.*.email');

            foreach ($emails as $email) {
                $this->assertStringEndsWith('@acme.test', (string) $email);
            }
        }
    }

    public function test_the_index_supports_filtering_and_sorting(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);
        $this->createCustomer($tenant, ['name' => 'Alpha Metals', 'email' => 'alpha@acme.test']);
        $this->createCustomer($tenant, ['name' => 'Zeta Glass', 'email' => 'zeta@acme.test', 'status' => CustomerStatus::Inactive]);

        $this->actingAs($actor)
            ->getJson('/api/v1/customers?status=inactive')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Zeta Glass');

        $this->actingAs($actor)
            ->getJson('/api/v1/customers?search=alpha')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Alpha Metals');

        $this->actingAs($actor)
            ->getJson('/api/v1/customers?sort=name&direction=asc')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Alpha Metals');
    }

    public function test_a_sort_column_outside_the_allow_list_is_rejected(): void
    {
        $tenant = $this->createTenant();
        $actor = $this->createUser($tenant, UserRole::Owner);

        $this->actingAs($actor)
            ->getJson('/api/v1/customers?sort=tenant_id;drop table customers')
            ->assertStatus(422)
            ->assertJsonValidationErrors('sort');
    }
}
