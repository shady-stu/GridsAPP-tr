<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Enums\OrderStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The order lifecycle is the one piece of business logic that has no database
 * dependency, so it is verified directly: pending -> confirmed -> fulfilled,
 * pending/confirmed -> cancelled, and nothing else.
 */
final class OrderStatusTest extends TestCase
{
    public function test_a_pending_order_can_be_confirmed_or_cancelled(): void
    {
        $this->assertSame(
            [OrderStatus::Confirmed, OrderStatus::Cancelled],
            OrderStatus::Pending->allowedTransitions(),
        );

        $this->assertTrue(OrderStatus::Pending->canTransitionTo(OrderStatus::Confirmed));
        $this->assertTrue(OrderStatus::Pending->canTransitionTo(OrderStatus::Cancelled));
    }

    public function test_a_confirmed_order_can_be_fulfilled_or_cancelled(): void
    {
        $this->assertTrue(OrderStatus::Confirmed->canTransitionTo(OrderStatus::Fulfilled));
        $this->assertTrue(OrderStatus::Confirmed->canTransitionTo(OrderStatus::Cancelled));
    }

    public function test_fulfilled_and_cancelled_are_terminal(): void
    {
        foreach ([OrderStatus::Fulfilled, OrderStatus::Cancelled] as $status) {
            $this->assertTrue($status->isFinal());
            $this->assertSame([], $status->allowedTransitions());

            foreach (OrderStatus::cases() as $target) {
                $this->assertFalse($status->canTransitionTo($target));
            }
        }
    }

    public function test_an_order_cannot_skip_forward_or_reopen(): void
    {
        // pending -> fulfilled skips confirmation.
        $this->assertFalse(OrderStatus::Pending->canTransitionTo(OrderStatus::Fulfilled));
        // confirmed -> pending would rewind the lifecycle.
        $this->assertFalse(OrderStatus::Confirmed->canTransitionTo(OrderStatus::Pending));
    }

    public function test_a_status_never_transitions_to_itself(): void
    {
        foreach (OrderStatus::cases() as $status) {
            $this->assertFalse($status->canTransitionTo($status));
        }
    }

    public function test_only_a_pending_order_is_editable(): void
    {
        $this->assertTrue(OrderStatus::Pending->isEditable());

        $this->assertFalse(OrderStatus::Confirmed->isEditable());
        $this->assertFalse(OrderStatus::Fulfilled->isEditable());
        $this->assertFalse(OrderStatus::Cancelled->isEditable());
    }

    public function test_values_lists_every_status_as_a_string(): void
    {
        $this->assertSame(['pending', 'confirmed', 'fulfilled', 'cancelled'], OrderStatus::values());
    }

    #[DataProvider('finalStatuses')]
    public function test_the_is_final_helper_matches_the_transition_table(OrderStatus $status): void
    {
        $this->assertTrue($status->isFinal());
    }

    /**
     * @return array<string, array{OrderStatus}>
     */
    public static function finalStatuses(): array
    {
        return [
            'fulfilled' => [OrderStatus::Fulfilled],
            'cancelled' => [OrderStatus::Cancelled],
        ];
    }
}
