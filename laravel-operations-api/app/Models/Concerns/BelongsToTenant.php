<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Adds tenant ownership to a model:
 *
 *  - a global scope that hides every other tenant's rows (also used by route
 *    model binding, so a foreign id resolves to a 404 instead of a leak),
 *  - a `tenant()` relation,
 *  - a `creating` hook that stamps tenant_id so a row can never be orphaned.
 *
 * IMPORTANT: tenant_id is never listed in a model's Fillable attribute. It is
 * always derived from the authenticated session, which is what makes it
 * impossible for a client to assign a record to another tenant.
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope);

        static::creating(function (Model $model): void {
            if ($model->getAttribute('tenant_id') === null) {
                $tenantId = TenantContext::current()->id();

                if ($tenantId !== null) {
                    $model->setAttribute('tenant_id', $tenantId);
                }
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Explicit cross-tenant query. Only used by seeders, console tooling and
     * tests; the global scope is dropped on purpose here.
     */
    public function scopeForTenant(Builder $query, Tenant|int $tenant): Builder
    {
        $tenantId = $tenant instanceof Tenant ? $tenant->getKey() : $tenant;

        return $query->withoutGlobalScope(TenantScope::class)
            ->where($this->getTable().'.tenant_id', $tenantId);
    }
}
