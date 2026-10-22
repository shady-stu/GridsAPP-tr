<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrderItem>
 */
class OrderItemFactory extends Factory
{
    protected $model = OrderItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'order_id' => Order::factory(),
            'product_id' => Product::factory(),
            'product_sku' => 'SKU-FACTORY',
            'product_name' => 'Factory product',
            'unit_price' => '10.00',
            'quantity' => 1,
            'line_total' => '10.00',
        ];
    }
}
