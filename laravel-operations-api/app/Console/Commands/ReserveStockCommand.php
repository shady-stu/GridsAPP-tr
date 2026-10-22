<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\ReserveStock;
use App\Exceptions\InsufficientStockException;
use App\Models\Product;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Reserves stock from the command line.
 *
 * Why it exists: it is the smallest honest way to reproduce a *real* concurrent
 * reservation. The command opens a transaction, takes the product row lock and
 * only then (optionally) waits, so two processes started a moment apart overlap
 * on the same row. Without the row lock both would read the same available
 * quantity and oversell; with it, the second process waits and then correctly
 * fails. `tests/Feature/StockConcurrencyTest.php` drives it exactly that way.
 *
 * Exit codes: 0 = reserved, 3 = insufficient stock, 1 = unexpected error.
 */
final class ReserveStockCommand extends Command
{
    protected $signature = 'grids:reserve-stock
                            {product : Product id}
                            {quantity : Units to reserve}
                            {--delay=0 : Seconds to hold the row lock before committing}
                            {--idempotency-key= : Optional replay key}';

    protected $description = 'Reserve stock for a product (concurrency and load testing helper)';

    public function handle(ReserveStock $reserveStock): int
    {
        $productId = (int) $this->argument('product');
        $quantity = (int) $this->argument('quantity');
        $delay = (int) $this->option('delay');
        $key = (string) ($this->option('idempotency-key') ?? '');

        try {
            $reservation = DB::transaction(function () use ($reserveStock, $productId, $quantity, $delay, $key) {
                // Hold the row for `delay` seconds so the test can force an
                // overlap window between two processes.
                $product = Product::query()->whereKey($productId)->lockForUpdate()->firstOrFail();

                if ($delay > 0) {
                    // Announce that the row lock is held before waiting, so a
                    // test can start a competing process at a known moment
                    // instead of guessing with sleeps.
                    fwrite(STDOUT, (string) json_encode(['status' => 'locked']).PHP_EOL);
                    fflush(STDOUT);
                    sleep($delay);
                }

                return $reserveStock->handle($product, $quantity, $key === '' ? null : $key);
            });

            $product = Product::query()->find($productId);

            $this->line((string) json_encode([
                'status' => 'reserved',
                'reservation_id' => (int) $reservation->getKey(),
                'product_id' => $productId,
                'quantity' => $quantity,
                'stock_reserved' => $product?->stock_reserved,
                'stock_available' => $product?->availableStock(),
            ]));

            return self::SUCCESS;
        } catch (InsufficientStockException $exception) {
            $this->line((string) json_encode([
                'status' => 'insufficient',
                'product_id' => $productId,
                'requested' => $exception->requested,
                'available' => $exception->available,
            ]));

            return 3;
        } catch (Throwable $exception) {
            $this->line((string) json_encode([
                'status' => 'error',
                'message' => $exception->getMessage(),
            ]));

            return self::FAILURE;
        }
    }
}
