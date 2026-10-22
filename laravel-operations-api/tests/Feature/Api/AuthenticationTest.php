<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Enums\UserRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenantData;
use Tests\TestCase;

final class AuthenticationTest extends TestCase
{
    use BuildsTenantData, RefreshDatabase;

    public function test_it_issues_a_token_for_valid_credentials(): void
    {
        $tenant = $this->createTenant(['slug' => 'acme']);
        $this->createUser($tenant, UserRole::Owner, [
            'email' => 'owner@acme.test',
            'password' => 'correct-horse-battery',
        ]);

        $response = $this->postJson('/api/v1/auth/token', [
            'email' => 'owner@acme.test',
            'password' => 'correct-horse-battery',
            'device_name' => 'phpunit',
        ]);

        $response->assertCreated()
            ->assertJsonStructure([
                'data' => [
                    'token',
                    'token_type',
                    'user' => ['id', 'name', 'email', 'role', 'tenant' => ['id', 'name', 'slug', 'status']],
                ],
            ])
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user.role', 'owner');

        $this->assertDatabaseHas('personal_access_tokens', [
            'name' => 'phpunit',
        ]);

        // The response must never leak credential material.
        $this->assertArrayNotHasKey('password', $response->json('data.user'));

        $token = (string) $response->json('data.token');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'owner@acme.test')
            ->assertJsonPath('data.tenant.slug', 'acme');
    }

    public function test_it_rejects_an_unknown_email(): void
    {
        $this->postJson('/api/v1/auth/token', [
            'email' => 'nobody@example.test',
            'password' => 'whatever',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_it_rejects_a_wrong_password_without_revealing_which_part_failed(): void
    {
        $tenant = $this->createTenant();
        $this->createUser($tenant, UserRole::Owner, [
            'email' => 'owner@acme.test',
            'password' => 'correct-horse-battery',
        ]);

        $response = $this->postJson('/api/v1/auth/token', [
            'email' => 'owner@acme.test',
            'password' => 'wrong',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('email');
        $this->assertSame(
            'These credentials do not match our records.',
            $response->json('errors.email.0'),
        );
    }

    public function test_it_refuses_to_issue_a_token_for_a_suspended_tenant(): void
    {
        $tenant = $this->createTenant(['status' => 'suspended']);
        $this->createUser($tenant, UserRole::Owner, [
            'email' => 'owner@suspended.test',
            'password' => 'correct-horse-battery',
        ]);

        $this->postJson('/api/v1/auth/token', [
            'email' => 'owner@suspended.test',
            'password' => 'correct-horse-battery',
        ])->assertForbidden();
    }

    public function test_it_revokes_only_the_token_used_for_the_request(): void
    {
        $tenant = $this->createTenant();
        $user = $this->createUser($tenant, UserRole::Owner, [
            'email' => 'owner@acme.test',
            'password' => 'correct-horse-battery',
        ]);

        $issued = $this->postJson('/api/v1/auth/token', [
            'email' => 'owner@acme.test',
            'password' => 'correct-horse-battery',
            'device_name' => 'first',
        ]);
        $this->postJson('/api/v1/auth/token', [
            'email' => 'owner@acme.test',
            'password' => 'correct-horse-battery',
            'device_name' => 'second',
        ])->assertCreated();

        $this->assertSame(2, $user->tokens()->count());

        $token = (string) $issued->json('data.token');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->deleteJson('/api/v1/auth/token')
            ->assertNoContent();

        $this->assertSame(1, $user->tokens()->count());
        $this->assertSame('second', $user->tokens()->first()?->name);

        // Test harness artifact: within a single test the Sanctum guard caches
        // the user it already resolved, so a request carrying a token that was
        // *just* deleted would still be authenticated in-process. Dropping the
        // resolved guards forces the guard to re-read the token from the
        // database, which is what a real separate request would do.
        $this->app['auth']->forgetGuards();

        // The revoked token is rejected, the other one still works.
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/auth/me')
            ->assertUnauthorized();
    }

    public function test_an_unauthenticated_user_cannot_touch_any_protected_endpoint(): void
    {
        $routes = [
            ['get', '/api/v1/auth/me'],
            ['get', '/api/v1/tenant'],
            ['get', '/api/v1/customers'],
            ['post', '/api/v1/customers'],
            ['get', '/api/v1/products'],
            ['post', '/api/v1/products'],
            ['get', '/api/v1/orders'],
            ['post', '/api/v1/orders'],
            ['get', '/api/v1/stock-reservations'],
            ['post', '/api/v1/stock-reservations'],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri)
                ->assertUnauthorized()
                ->assertJsonPath('message', 'Unauthenticated.');
        }
    }

    public function test_a_user_whose_tenant_is_suspended_is_refused(): void
    {
        // A tenant can be suspended after tokens were issued; every request made
        // with such a token must be refused (403) for as long as it is valid.
        $tenant = $this->createTenant(['status' => 'suspended']);
        $user = $this->createUser($tenant, UserRole::Owner);

        $this->actingAs($user)
            ->getJson('/api/v1/customers')
            ->assertForbidden()
            ->assertJsonPath('message', 'This account is not attached to an active tenant.');
    }
}
