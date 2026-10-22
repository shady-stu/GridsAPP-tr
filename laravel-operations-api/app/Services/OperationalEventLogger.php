<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\OperationalEventType;
use App\Models\OperationalEvent;
use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * Single write path for the operational log.
 *
 * Why this exists: an audit trail is only useful if it is safe to read. The
 * logger refuses payload keys that would persist secrets or customer PII, so no
 * call site can accidentally log a password, a token or an email address.
 */
final class OperationalEventLogger
{
    /**
     * Keys that must never reach the operational log.
     */
    private const FORBIDDEN_KEYS = [
        'password',
        'password_confirmation',
        'token',
        'access_token',
        'refresh_token',
        'api_key',
        'secret',
        'authorization',
        'email',
        'phone',
        'phone_number',
        'address',
        'credit_card',
        'card_number',
    ];

    public function __construct(private readonly TenantContext $tenantContext) {}

    /**
     * @param  array<string, mixed>  $payload  Non sensitive, structured context.
     */
    public function record(
        OperationalEventType $type,
        ?Model $subject = null,
        array $payload = [],
        ?int $tenantId = null,
    ): OperationalEvent {
        $this->assertPayloadIsSafe($payload);

        $event = new OperationalEvent;
        $event->forceFill([
            'tenant_id' => $tenantId ?? $this->resolveTenantId($subject),
            'type' => $type,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'payload' => $payload === [] ? null : $payload,
            'occurred_at' => now(),
        ]);
        $event->save();

        return $event;
    }

    /**
     * Prefer the tenant of the current request, and fall back to the tenant of
     * the subject so events written from a queue worker (no request context)
     * still land on the right tenant.
     */
    private function resolveTenantId(?Model $subject): ?int
    {
        $contextTenantId = $this->tenantContext->id();

        if ($contextTenantId !== null) {
            return $contextTenantId;
        }

        $subjectTenantId = $subject?->getAttribute('tenant_id');

        return $subjectTenantId === null ? null : (int) $subjectTenantId;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function assertPayloadIsSafe(array $payload, string $path = ''): void
    {
        foreach ($payload as $key => $value) {
            $key = (string) $key;

            if (in_array($key, self::FORBIDDEN_KEYS, true)) {
                throw new InvalidArgumentException(sprintf(
                    'Refusing to write [%s%s] to the operational log: sensitive keys are not allowed.',
                    $path,
                    $key,
                ));
            }

            if (is_array($value)) {
                $this->assertPayloadIsSafe($value, $path.$key.'.');
            }
        }
    }
}
