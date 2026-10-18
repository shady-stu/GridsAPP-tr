<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * A role is always evaluated *inside* the tenant the user belongs to. No role
 * can grant access to another tenant's records: tenant isolation is enforced by
 * the query scope and the policies, never by the role itself.
 */
enum UserRole: string
{
    case Owner = 'owner';
    case Admin = 'admin';
    case Member = 'member';

    /**
     * Managing the catalog and customer records (create/update).
     */
    public function managesRecords(): bool
    {
        return $this === self::Owner || $this === self::Admin;
    }

    /**
     * Administrative lifecycle operations: order state transitions and moving
     * reserved stock (releasing or committing a reservation).
     */
    public function administersLifecycle(): bool
    {
        return $this === self::Owner || $this === self::Admin;
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $role): string => $role->value, self::cases());
    }
}
