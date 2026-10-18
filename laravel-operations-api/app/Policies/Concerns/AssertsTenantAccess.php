<?php

declare(strict_types=1);

namespace App\Policies\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Shared tenant check for policies.
 *
 * Route model binding already hides another tenant's rows behind a 404 (the
 * global TenantScope filters them out). These checks are the second layer: they
 * still deny the action if a model ever reaches a policy by another path.
 */
trait AssertsTenantAccess
{
    protected function inSameTenant(User $user, Model $model): bool
    {
        $tenantId = $model->getAttribute('tenant_id');

        return $user->tenant_id !== null
            && $tenantId !== null
            && (int) $user->tenant_id === (int) $tenantId;
    }
}
