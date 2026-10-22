<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\StockReservation;
use App\Models\User;
use App\Policies\Concerns\AssertsTenantAccess;

final class StockReservationPolicy
{
    use AssertsTenantAccess;

    public function viewAny(User $user): bool
    {
        return $user->tenant_id !== null;
    }

    public function view(User $user, StockReservation $reservation): bool
    {
        return $this->inSameTenant($user, $reservation);
    }

    /**
     * Holding stock is part of selling, so any role may reserve.
     */
    public function create(User $user): bool
    {
        return $user->tenant_id !== null;
    }

    /**
     * Giving stock back is an administrative action: a member can hold
     * inventory but cannot quietly un-hold it.
     */
    public function delete(User $user, StockReservation $reservation): bool
    {
        return $this->inSameTenant($user, $reservation) && $user->role->administersLifecycle();
    }
}
