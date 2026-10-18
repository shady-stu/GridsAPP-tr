<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\CustomerStatus;
use App\Enums\OperationalEventType;
use App\Enums\OrderStatus;
use App\Events\OrderCreated;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use App\Services\OperationalEventLogger;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * CreateOrder - the one place where an order comes into existence.
 *
 * Transaction boundary
 * --------------------
 * The order row, every order item, every stock reservation and the audit event
 * are written inside a single `DB::transaction`. If any line fails (unknown
 * product, inactive product, foreign tenant customer, insufficient stock) the
 * whole thing rolls back: there is no such thing as a half created order.
 *
 * Money
 * -----
 * Subtotal, tax and total are always recomputed from the product prices stored
 * in the database. Client supplied prices or totals are ignored so an order can
 * never be discounted by tampering with the payload.
 *
 * Notifications
 * -------------
 * `OrderCreated` is dispatched *after* the transaction returns, so a rolled back
 * order can never enqueue a customer notification.
 */
final class CreateOrder
{
    public function __construct(
        private readonly ReserveStock $reserveStock,
        private readonly OperationalEventLogger $events,
    ) {}

    /**
     * @param  array{customer_id: int, items: array<int, array{product_id: int, quantity: int}>, notes?: string|null, currency?: string|null}  $data
     */
    public function handle(User $actor, array $data): Order
    {
        $order = DB::transaction(function () use ($data): Order {
            $customer = $this->resolveCustomer((int) $data['customer_id']);
            $lines = $this->normaliseLines($data['items']);

            $products = $this->lockOrderedProducts($lines);
            $currency = $this->resolveCurrency($data['currency'] ?? null, $products);
            $this->assertCurrencyMatches($products, $currency);

            $order = new Order;
            $order->forceFill([
                'customer_id' => $customer->getKey(),
                'currency' => $currency,
                'status' => OrderStatus::Pending,
                // Provisional unique number: the final, human readable number
                // needs the auto increment id, which only exists after insert.
                'number' => 'PENDING-'.Str::uuid()->toString(),
                'notes' => $data['notes'] ?? null,
                'placed_at' => now(),
            ]);
            $order->save();

            $subtotal = '0.00';

            foreach ($lines as $line) {
                /** @var Product $product */
                $product = $products->get($line['product_id']);

                // Reserve before writing the line. A duplicate product line that
                // over-commits stock therefore aborts the entire order instead of
                // creating a partially reserved one.
                $this->reserveStock->handle($product, $line['quantity'], null, $order);

                $unitPrice = (string) $product->price;
                $lineTotal = bcmul($unitPrice, (string) $line['quantity'], 2);
                $subtotal = bcadd($subtotal, $lineTotal, 2);

                $item = new OrderItem;
                $item->forceFill([
                    'tenant_id' => $order->tenant_id,
                    'order_id' => $order->getKey(),
                    'product_id' => $product->getKey(),
                    // Snapshots: later catalog edits must not rewrite history.
                    'product_sku' => $product->sku,
                    'product_name' => $product->name,
                    'unit_price' => $unitPrice,
                    'quantity' => $line['quantity'],
                    'line_total' => $lineTotal,
                ]);
                $item->save();
            }

            // bcmath keeps money arithmetic exact and deterministic (no floats).
            $taxTotal = bcmul($subtotal, (string) config('orders.tax_rate'), 2);
            $total = bcadd($subtotal, $taxTotal, 2);

            $order->forceFill([
                'number' => sprintf('ORD-%08d', (int) $order->getKey()),
                'subtotal' => $subtotal,
                'tax_total' => $taxTotal,
                'total' => $total,
            ])->save();

            $this->events->record(
                type: OperationalEventType::OrderCreated,
                subject: $order,
                payload: [
                    'order_id' => (int) $order->getKey(),
                    'customer_id' => (int) $customer->getKey(),
                    'line_count' => count($lines),
                    'total' => $total,
                    'currency' => $currency,
                ],
            );

            return $order;
        });

        // Deliberately outside the transaction (see class docblock).
        OrderCreated::dispatch($order);

        return $order;
    }

    private function resolveCustomer(int $customerId): Customer
    {
        // TenantScope applies here, so another tenant's customer is simply not
        // found: the client cannot place an order against a foreign customer.
        $customer = Customer::query()->whereKey($customerId)->first();

        if ($customer === null) {
            throw ValidationException::withMessages([
                'customer_id' => [__('The selected customer does not exist in your tenant.')],
            ]);
        }

        if ($customer->status !== CustomerStatus::Active) {
            throw ValidationException::withMessages([
                'customer_id' => [__('Orders can only be placed for an active customer.')],
            ]);
        }

        return $customer;
    }

    /**
     * @param  array<int, array{product_id: int, quantity: int}>  $items
     * @return array<int, array{product_id: int, quantity: int}>
     */
    private function normaliseLines(array $items): array
    {
        return array_values(array_map(
            static fn (array $line): array => [
                'product_id' => (int) $line['product_id'],
                'quantity' => (int) $line['quantity'],
            ],
            $items,
        ));
    }

    /**
     * @param  array<int, array{product_id: int, quantity: int}>  $lines
     * @return Collection<int, Product>
     */
    private function lockOrderedProducts(array $lines): Collection
    {
        $productIds = array_values(array_unique(array_column($lines, 'product_id')));

        // Lock all requested products up front in a deterministic order. Two
        // concurrent multi-line orders acquire the same row locks in the same
        // order, which removes the deadlock that otherwise occurs when two
        // orders touch the same products in opposite orders.
        $products = Product::query()
            ->whereIn('id', $productIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($productIds as $productId) {
            $product = $products->get($productId);

            if ($product === null) {
                throw ValidationException::withMessages([
                    'items' => [__('Product :id does not exist in your tenant.', ['id' => $productId])],
                ]);
            }

            if (! $product->is_active) {
                throw ValidationException::withMessages([
                    'items' => [__('Product :id is not available for sale.', ['id' => $productId])],
                ]);
            }
        }

        return $products;
    }

    /**
     * @param  Collection<int, Product>  $products
     */
    private function resolveCurrency(?string $requested, Collection $products): string
    {
        $currency = $requested ?: (string) ($products->first()?->currency ?? config('orders.default_currency'));

        return strtoupper($currency);
    }

    /**
     * @param  Collection<int, Product>  $products
     */
    private function assertCurrencyMatches(Collection $products, string $currency): void
    {
        foreach ($products as $product) {
            if (strtoupper((string) $product->currency) !== $currency) {
                throw ValidationException::withMessages([
                    'currency' => [__('All ordered products must use the :currency currency.', ['currency' => $currency])],
                ]);
            }
        }
    }
}
