<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Reproducible development data.
 *
 * Two tenants are seeded so tenant isolation can be exercised by hand straight
 * after `php artisan migrate --seed`. Both use the password "password".
 *
 *   Acme Industrial : owner@acme.test / admin@acme.test / member@acme.test
 *   Globex Supply   : owner@globex.test / admin@globex.test / member@globex.test
 */
final class DatabaseSeeder extends Seeder
{
    /**
     * Fixed catalog so stock and price assertions in manual testing are stable.
     *
     * @var array<int, array{sku: string, name: string, price: string, stock: int}>
     */
    private const CATALOG = [
        ['sku' => 'WIDGET-100', 'name' => 'Steel Widget 100', 'price' => '19.99', 'stock' => 250],
        ['sku' => 'WIDGET-200', 'name' => 'Alloy Widget 200', 'price' => '49.50', 'stock' => 120],
        ['sku' => 'BOLT-M8', 'name' => 'M8 Hex Bolt', 'price' => '0.35', 'stock' => 10000],
        ['sku' => 'PUMP-XL', 'name' => 'Industrial Pump XL', 'price' => '1249.00', 'stock' => 12],
    ];

    public function run(): void
    {
        $tenants = [
            'acme' => Tenant::factory()->create(['name' => 'Acme Industrial', 'slug' => 'acme-industrial']),
            'globex' => Tenant::factory()->create(['name' => 'Globex Supply', 'slug' => 'globex-supply']),
        ];

        foreach ($tenants as $slug => $tenant) {
            $this->seedUsers($tenant, $slug);
            $this->seedCatalog($tenant, $slug);
        }
    }

    private function seedUsers(Tenant $tenant, string $slug): void
    {
        foreach (UserRole::cases() as $role) {
            User::factory()->create([
                'tenant_id' => $tenant->getKey(),
                'name' => ucfirst($role->value).' '.$tenant->name,
                'email' => $role->value.'@'.$slug.'.test',
                'role' => $role,
            ]);
        }
    }

    private function seedCatalog(Tenant $tenant, string $slug): void
    {
        Customer::factory()
            ->count(5)
            ->create(['tenant_id' => $tenant->getKey()]);

        foreach (self::CATALOG as $index => $item) {
            Product::factory()->create([
                'tenant_id' => $tenant->getKey(),
                'sku' => $item['sku'],
                'name' => $item['name'],
                'price' => $item['price'],
                'stock_on_hand' => $item['stock'],
                'stock_reserved' => 0,
                'description' => $item['name'].' seeded for the '.$slug.' tenant.',
                'is_active' => $index !== count(self::CATALOG) - 1 || $slug === 'acme',
            ]);
        }
    }
}
