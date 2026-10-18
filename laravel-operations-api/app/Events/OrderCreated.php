<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Raised once an order - its items and its stock holds - is committed.
 *
 * The event is dispatched by CreateOrder *after* the database transaction has
 * returned, which is what guarantees that a rolled back order never reaches a
 * listener.
 */
final class OrderCreated
{
    use Dispatchable, SerializesModels;

    public function __construct(public readonly Order $order) {}
}
