<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Explicit order lifecycle.
 *
 * pending   -> confirmed -> fulfilled
 * pending   -> cancelled
 * confirmed -> cancelled
 * fulfilled and cancelled are terminal.
 */
enum OrderStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Fulfilled = 'fulfilled';
    case Cancelled = 'cancelled';

    /**
     * @return array<int, self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Pending => [self::Confirmed, self::Cancelled],
            self::Confirmed => [self::Fulfilled, self::Cancelled],
            self::Fulfilled, self::Cancelled => [],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTransitions(), true);
    }

    public function isFinal(): bool
    {
        return $this->allowedTransitions() === [];
    }

    /**
     * Only a pending order may still be edited by the client.
     */
    public function isEditable(): bool
    {
        return $this === self::Pending;
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $status): string => $status->value, self::cases());
    }
}
