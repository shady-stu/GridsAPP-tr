<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\ReservationStatus;
use App\Models\Product;
use App\Models\StockReservation;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StockReservation>
 */
class StockReservationFactory extends Factory
{
    protected $model = StockReservation::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'product_id' => Product::factory(),
            'order_id' => null,
            'quantity' => 1,
            'status' => ReservationStatus::Held,
            'idempotency_key' => null,
            'expires_at' => now()->addMinutes(30),
        ];
    }

    public function released(): static
    {
        return $this->state(fn (): array => ['status' => ReservationStatus::Released]);
    }
}
