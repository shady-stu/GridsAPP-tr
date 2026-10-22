<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Enums\OperationalEventType;
use App\Models\OperationalEvent;
use App\Services\OperationalEventLogger;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\Concerns\BuildsTenantData;
use Tests\TestCase;

/**
 * The operational log is only useful if it is safe to read, so the rejection of
 * secret/PII payload keys is a correctness requirement, not a nicety.
 */
final class OperationalEventLoggerTest extends TestCase
{
    use BuildsTenantData, RefreshDatabase;

    public function test_it_refuses_a_password_key(): void
    {
        $logger = $this->logger();

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/password/');

        $logger->record(OperationalEventType::CustomerCreated, payload: [
            'customer_id' => 1,
            'password' => 'hunter2',
        ]);
    }

    public function test_it_refuses_a_nested_sensitive_key(): void
    {
        $logger = $this->logger();

        // A secret hidden one level down must be caught too.
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/email/');

        $logger->record(OperationalEventType::OrderCreated, payload: [
            'order_id' => 10,
            'customer' => [
                'id' => 3,
                'email' => 'buyer@example.test',
            ],
        ]);
    }

    public function test_it_refuses_a_token_key(): void
    {
        $logger = $this->logger();

        $this->expectException(InvalidArgumentException::class);

        $logger->record(OperationalEventType::OrderCreated, payload: [
            'access_token' => 'plaintext-token',
        ]);
    }

    public function test_it_writes_a_safe_payload(): void
    {
        $tenant = $this->createTenant();
        $customer = $this->createCustomer($tenant);

        $this->logger()->record(
            type: OperationalEventType::CustomerCreated,
            subject: $customer,
            payload: [
                'customer_id' => (int) $customer->getKey(),
                'status' => 'active',
            ],
        );

        /** @var OperationalEvent $event */
        $event = OperationalEvent::query()->withoutGlobalScopes()->sole();

        $this->assertSame(OperationalEventType::CustomerCreated, $event->type);
        $this->assertSame($customer->getMorphClass(), $event->subject_type);
        $this->assertSame($customer->getKey(), $event->subject_id);
        $this->assertSame($tenant->getKey(), $event->tenant_id);
        $this->assertSame((int) $customer->getKey(), $event->payload['customer_id']);
        $this->assertSame('active', $event->payload['status']);
    }

    public function test_it_falls_back_to_the_subject_tenant_when_no_request_context_is_active(): void
    {
        $tenant = $this->createTenant();
        $customer = $this->createCustomer($tenant);

        // No TenantContext is set, which is what a queue worker sees.
        $this->assertNull(app(TenantContext::class)->id());

        $this->logger()->record(
            type: OperationalEventType::OrderNotificationSent,
            subject: $customer,
            payload: ['customer_id' => (int) $customer->getKey()],
        );

        $this->assertDatabaseHas('operational_events', [
            'type' => OperationalEventType::OrderNotificationSent->value,
            'tenant_id' => $tenant->getKey(),
        ]);
    }

    public function test_the_request_tenant_wins_over_the_subject_tenant(): void
    {
        $requestTenant = $this->createTenant(['slug' => 'request-tenant']);
        $otherTenant = $this->createTenant(['slug' => 'other-tenant']);
        $foreignSubject = $this->createCustomer($otherTenant);

        $context = app(TenantContext::class);
        $context->set($requestTenant);

        try {
            $this->logger()->record(
                type: OperationalEventType::CustomerCreated,
                subject: $foreignSubject,
                payload: ['customer_id' => (int) $foreignSubject->getKey()],
            );
        } finally {
            $context->clear();
        }

        // The event is attributed to the acting tenant, never to the subject's.
        $this->assertDatabaseHas('operational_events', [
            'tenant_id' => $requestTenant->getKey(),
        ]);
        $this->assertDatabaseMissing('operational_events', [
            'tenant_id' => $otherTenant->getKey(),
        ]);
    }

    public function test_a_null_tenant_subject_is_allowed(): void
    {
        // System level events (no tenant, no subject) must still be recordable.
        $this->logger()->record(
            type: OperationalEventType::OrderCreated,
            payload: ['order_id' => 1],
        );

        $this->assertDatabaseHas('operational_events', [
            'type' => OperationalEventType::OrderCreated->value,
            'tenant_id' => null,
        ]);
    }

    private function logger(): OperationalEventLogger
    {
        return app(OperationalEventLogger::class);
    }
}
