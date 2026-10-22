<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Actions\ReserveStock;
use App\Models\Product;
use InvalidArgumentException;
use Tests\TestCase;

/**
 * The HTTP layer already validates `quantity >= 1`, but the action is also used
 * by the console command and by other actions, so it enforces the rule itself
 * rather than trusting its callers.
 */
final class ReserveStockTest extends TestCase
{
    public function test_it_refuses_a_zero_quantity_before_touching_the_database(): void
    {
        $action = app(ReserveStock::class);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/at least one unit/');

        // An unsaved product is never reached: the guard runs first.
        $action->handle(new Product, 0);
    }

    public function test_it_refuses_a_negative_quantity(): void
    {
        $action = app(ReserveStock::class);

        $this->expectException(InvalidArgumentException::class);

        $action->handle(new Product, -3);
    }
}
