<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Order;
use App\Models\User;
use App\Policies\Concerns\AssertsTenantAccess;

final class OrderPolicy
{
    use AssertsTenantAccess;

    public function viewAny(User $user): bool
    {
        return $user->tenant_id !== null;
    }

    public function view(User $user, Order $order): bool
    {
        return $this->inSameTenant($user, $order);
    }

    /**
     * Selling is the day-to-day job, so every role may create an order.
     */
    public function create(User $user): bool
    {
        return $user->tenant_id !== null;
    }

    /**
     * Moving an order through its lifecycle is an administrative action.
     */
    public function update(User $user, Order $order): bool
    {
        return $this->inSameTenant($user, $order) && $user->role->administersLifecycle();
    }
}
