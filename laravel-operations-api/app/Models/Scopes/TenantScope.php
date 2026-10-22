<?php

declare(strict_types=1);

namespace App\Models\Scopes;

use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Restricts every tenant owned model to the tenant of the current request.
 *
 * When no tenant context is active (console commands, queued jobs, seeders) the
 * scope is a no-op so background work can address rows across tenants. Anything
 * that runs without a context is therefore responsible for its own isolation.
 */
final class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $tenantId = TenantContext::current()->id();

        if ($tenantId !== null) {
            $builder->where($model->getTable().'.tenant_id', $tenantId);
        }
    }
}
