<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Product;
use App\Models\User;
use App\Policies\Concerns\AssertsTenantAccess;

final class ProductPolicy
{
    use AssertsTenantAccess;

    public function viewAny(User $user): bool
    {
        return $user->tenant_id !== null;
    }

    public function view(User $user, Product $product): bool
    {
        return $this->inSameTenant($user, $product);
    }

    public function create(User $user): bool
    {
        return $user->role->managesRecords();
    }

    public function update(User $user, Product $product): bool
    {
        return $this->inSameTenant($user, $product) && $user->role->managesRecords();
    }
}
