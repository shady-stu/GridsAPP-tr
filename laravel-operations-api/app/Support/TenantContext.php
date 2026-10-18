<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Tenant;

/**
 * Request scoped holder for the tenant the current API call belongs to.
 *
 * The tenant is resolved from the authenticated user (see ResolveTenant
 * middleware) and is never read from client input. Eloquent's TenantScope reads
 * this holder, which is what keeps route model binding from ever resolving
 * another tenant's record.
 */
final class TenantContext
{
    private ?Tenant $tenant = null;

    public function set(Tenant $tenant): void
    {
        $this->tenant = $tenant;
    }

    public function clear(): void
    {
        $this->tenant = null;
    }

    public function tenant(): ?Tenant
    {
        return $this->tenant;
    }

    public function id(): ?int
    {
        $key = $this->tenant?->getKey();

        return $key === null ? null : (int) $key;
    }

    public function isSet(): bool
    {
        return $this->tenant !== null;
    }

    /**
     * Convenience accessor for code that is not injected with the instance.
     */
    public static function current(): self
    {
        return app(self::class);
    }
}
