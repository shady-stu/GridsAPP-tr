<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Reserved stock is never deleted, it moves through explicit states so the
 * history of a product's inventory stays auditable.
 */
enum ReservationStatus: string
{
    /** Stock is held for an order but the goods have not left the warehouse. */
    case Held = 'held';

    /** Goods were fulfilled: on-hand and reserved quantities both decrease. */
    case Committed = 'committed';

    /** The hold was given back to available stock. */
    case Released = 'released';

    /** The hold expired before the order was confirmed. */
    case Expired = 'expired';

    /** Does this reservation still occupy inventory? */
    public function isActive(): bool
    {
        return $this === self::Held;
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $status): string => $status->value, self::cases());
    }
}
