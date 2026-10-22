<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockReservation;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Symfony\Component\Process\Process;
use Tests\Concerns\BuildsTenantData;
use Tests\TestCase;

/**
 * Proves, with two real OS processes, that concurrent reservations cannot
 * oversell the same product row.
 *
 * Why real processes instead of threads/fibers: PHP is single threaded, and an
 * in-process fake would share one database connection and therefore one
 * transaction. Only two independent connections can demonstrate that the
 * `SELECT ... FOR UPDATE` on the product row actually serialises the writers.
 *
 * The database uses DatabaseTruncation (no wrapping transaction) so the rows
 * the test creates are committed and visible to the child processes, and the
 * child processes are handed the exact test database of the parent.
 */
final class StockConcurrencyTest extends TestCase
{
    use BuildsTenantData, DatabaseTruncation;

    public function test_two_concurrent_reservations_cannot_oversell_the_last_units(): void
    {
        $tenant = $this->createTenant();
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        // The first process reserves 6 of the 10 available and holds the row
        // lock for `--delay` seconds, announcing from inside the transaction
        // that the lock is held.
        $first = $this->reserveStockProcess((int) $product->getKey(), 6, delay: 5);
        $first->start();

        $this->waitForLockMarker($first);

        // Started while the lock is still held: it must block on the row and
        // then see the post-commit state (6 already reserved, 4 left).
        $second = $this->reserveStockProcess((int) $product->getKey(), 6);
        $second->start();

        $first->wait();
        $second->wait();

        $this->assertSame(0, $first->getExitCode(), 'First reservation should succeed. Output: '.$first->getOutput().$first->getErrorOutput());
        $this->assertStringContainsString('"status":"reserved"', $first->getOutput());

        $this->assertSame(3, $second->getExitCode(), 'Second reservation should be refused as insufficient stock. Output: '.$second->getOutput().$second->getErrorOutput());
        $this->assertStringContainsString('"status":"insufficient"', $second->getOutput());
        // The command reports the exact numbers it saw *after* taking the lock.
        $this->assertStringContainsString('"available":4', $second->getOutput());

        // 6 units are held, never 12: no oversell happened.
        $this->assertSame(6, $this->productStockReserved((int) $product->getKey()));
        $this->assertSame(1, StockReservation::query()->forTenant($tenant)->count());
        $this->assertDatabaseHas('products', [
            'id' => $product->getKey(),
            'stock_on_hand' => 10,
            'stock_reserved' => 6,
        ]);
    }

    public function test_a_concurrent_replay_of_the_same_idempotency_key_reserves_stock_once(): void
    {
        $tenant = $this->createTenant();
        $product = $this->createProduct($tenant, ['stock_on_hand' => 20]);

        $first = $this->reserveStockProcess((int) $product->getKey(), 6, delay: 5, idempotencyKey: 'order-777');
        $first->start();

        $this->waitForLockMarker($first);

        // Same logical request, retried on another connection. It cannot see the
        // uncommitted reservation of the first process, so it races it: the
        // unique (tenant_id, idempotency_key) index is what settles it.
        $second = $this->reserveStockProcess((int) $product->getKey(), 4, idempotencyKey: 'order-777');
        $second->start();

        $first->wait();
        $second->wait();

        $this->assertSame(0, $first->getExitCode(), 'First reservation should succeed. Output: '.$first->getOutput().$first->getErrorOutput());
        $this->assertSame(0, $second->getExitCode(), 'A replayed request should succeed by returning the original. Output: '.$second->getOutput().$second->getErrorOutput());

        // Exactly one hold exists even though two processes requested one, and
        // the stock is reserved once. A retry is not a second reservation.
        $this->assertSame(1, StockReservation::query()->forTenant($tenant)->count());
        $this->assertSame(6, $this->productStockReserved((int) $product->getKey()));

        $this->assertSame(
            $this->reservationIdFrom($first),
            $this->reservationIdFrom($second),
            'Both processes must report the same reservation.',
        );
    }

    public function test_two_concurrent_reservations_that_both_fit_both_succeed(): void
    {
        $tenant = $this->createTenant();
        $product = $this->createProduct($tenant, ['stock_on_hand' => 10]);

        $first = $this->reserveStockProcess((int) $product->getKey(), 4, delay: 5);
        $first->start();

        $this->waitForLockMarker($first);

        // 4 + 4 = 8 <= 10, so the second process waits for the lock and then
        // legitimately succeeds. Serialisation must not turn into starvation.
        $second = $this->reserveStockProcess((int) $product->getKey(), 4);
        $second->start();

        $first->wait();
        $second->wait();

        $this->assertSame(0, $first->getExitCode(), $first->getOutput().$first->getErrorOutput());
        $this->assertSame(0, $second->getExitCode(), $second->getOutput().$second->getErrorOutput());

        $this->assertSame(8, $this->productStockReserved((int) $product->getKey()));
        $this->assertSame(2, StockReservation::query()->forTenant($tenant)->count());
    }

    private function reserveStockProcess(int $productId, int $quantity, int $delay = 0, ?string $idempotencyKey = null): Process
    {
        $command = [
            PHP_BINARY,
            base_path('artisan'),
            'grids:reserve-stock',
            (string) $productId,
            (string) $quantity,
            '--no-interaction',
        ];

        if ($delay > 0) {
            $command[] = '--delay='.$delay;
        }

        if ($idempotencyKey !== null) {
            $command[] = '--idempotency-key='.$idempotencyKey;
        }

        return new Process($command, base_path(), $this->childEnvironment());
    }

    /**
     * The child `php artisan` process must talk to the same PostgreSQL database
     * as the test, so the connection settings are passed explicitly instead of
     * relying on the environment PHPUnit happens to export.
     *
     * @return array<string, string>
     */
    private function childEnvironment(): array
    {
        $connection = (string) config('database.default');

        return [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => $connection,
            'DB_HOST' => (string) config("database.connections.{$connection}.host", ''),
            'DB_PORT' => (string) config("database.connections.{$connection}.port", ''),
            'DB_DATABASE' => (string) config("database.connections.{$connection}.database", ''),
            'DB_USERNAME' => (string) config("database.connections.{$connection}.username", ''),
            'DB_PASSWORD' => (string) config("database.connections.{$connection}.password", ''),
            // The command itself never queues work, but a deterministic cache
            // keeps the child from touching a shared cache table.
            'CACHE_STORE' => 'array',
        ];
    }

    /**
     * Blocks until the first process reports, from inside its transaction, that
     * it holds the row lock. Handshaking on the marker removes the sleep-based
     * flakiness: the competing process is started at a known moment.
     */
    private function waitForLockMarker(Process $process, int $timeoutSeconds = 20): void
    {
        $buffer = '';
        $deadline = microtime(true) + $timeoutSeconds;

        while (microtime(true) < $deadline) {
            $buffer .= $process->getIncrementalOutput();

            if (str_contains($buffer, '"status":"locked"')) {
                return;
            }

            if (! $process->isRunning()) {
                break;
            }

            usleep(50_000);
        }

        $this->fail(sprintf(
            "The reservation process never reported that it held the row lock.\nstdout: %s\nstderr: %s",
            $buffer.$process->getOutput(),
            $process->getErrorOutput(),
        ));
    }

    private function productStockReserved(int $productId): int
    {
        /** @var Product $product */
        $product = Product::query()->withoutGlobalScopes()->whereKey($productId)->firstOrFail();

        return (int) $product->stock_reserved;
    }

    private function reservationIdFrom(Process $process): ?int
    {
        if (preg_match('/"reservation_id":(\d+)/', $process->getOutput(), $matches) !== 1) {
            return null;
        }

        return (int) $matches[1];
    }
}
