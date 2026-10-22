<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Order totals
    |--------------------------------------------------------------------------
    |
    | Tax is applied to the order subtotal (the sum of the line totals, which
    | are themselves derived from trusted database prices). 0.00 keeps the total
    | equal to the subtotal.
    |
    */

    'tax_rate' => env('ORDER_TAX_RATE', '0.00'),

    'default_currency' => env('ORDER_CURRENCY', 'USD'),

    /*
    |--------------------------------------------------------------------------
    | Stock reservations
    |--------------------------------------------------------------------------
    |
    | Reservations created outside of an order (a manual hold through the API)
    | expire so forgotten holds cannot freeze inventory forever. Holds attached
    | to an order live for as long as the order is pending or confirmed.
    |
    */

    'reservation_ttl_minutes' => (int) env('STOCK_RESERVATION_TTL_MINUTES', 30),

];
