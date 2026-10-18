<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->optional()->numerify('+1##########'),
            'status' => CustomerStatus::Active,
            'notes' => null,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['status' => CustomerStatus::Inactive]);
    }
}
