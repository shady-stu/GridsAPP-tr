<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;
use App\Policies\Concerns\AssertsTenantAccess;

final class CustomerPolicy
{
    use AssertsTenantAccess;

    /**
     * Any authenticated user of the tenant may read the customer list.
     */
    public function viewAny(User $user): bool
    {
        return $user->tenant_id !== null;
    }

    public function view(User $user, Customer $customer): bool
    {
        return $this->inSameTenant($user, $customer);
    }

    public function create(User $user): bool
    {
        return $user->role->managesRecords();
    }

    /**
     * Mutations require both tenant ownership *and* a managing role: a member
     * can read customers but cannot edit them.
     */
    public function update(User $user, Customer $customer): bool
    {
        return $this->inSameTenant($user, $customer) && $user->role->managesRecords();
    }
}
