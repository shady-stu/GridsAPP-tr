<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Product;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'sku' => Str::upper(fake()->unique()->bothify('SKU-####-??')),
            'name' => Str::title(fake()->words(3, true)),
            'description' => fake()->sentence(),
            'price' => fake()->randomFloat(2, 1, 500),
            'currency' => 'USD',
            'stock_on_hand' => fake()->numberBetween(0, 100),
            // Never random: the products_stock_invariants CHECK constraint
            // requires stock_reserved <= stock_on_hand.
            'stock_reserved' => 0,
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }

    /**
     * Deterministic stock levels so a test can reason about availability.
     */
    public function withStock(int $onHand, int $reserved = 0): static
    {
        return $this->state(fn (): array => [
            'stock_on_hand' => $onHand,
            'stock_reserved' => $reserved,
        ]);
    }

    public function priced(string $price): static
    {
        return $this->state(fn (): array => ['price' => $price]);
    }
}
