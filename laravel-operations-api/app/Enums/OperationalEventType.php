<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Types written to `operational_events`. The payload of every event is passed
 * through OperationalEventLogger, which refuses obvious secrets and customer
 * PII so the audit trail stays safe to read in production.
 */
enum OperationalEventType: string
{
    case StockReserved = 'stock.reserved';
    case StockReservationReleased = 'stock.reservation_released';
    case CustomerCreated = 'customer.created';
    case OrderCreated = 'order.created';
    case OrderStatusChanged = 'order.status_changed';
    case OrderNotificationQueued = 'order.notification_queued';
    case OrderNotificationSent = 'order.notification_sent';

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $type): string => $type->value, self::cases());
    }
}
