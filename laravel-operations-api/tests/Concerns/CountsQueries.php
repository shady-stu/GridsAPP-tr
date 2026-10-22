<?php

declare(strict_types=1);

namespace Tests\Concerns;

use App\Models\Tenant;
use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

trait CountsQueries
{
    /**
     * Number of SQL statements executed while the callback runs.
     */
    protected function countQueries(callable $callback): int
    {
        $count = 0;

        DB::listen(function () use (&$count): void {
            $count++;
        });

        $callback();

        return $count;
    }

    /**
     * The SQL statements executed while the callback runs. Useful for asserting
     * that a pessimistic lock was actually taken.
     *
     * @return array<int, string>
     */
    protected function captureQueries(callable $callback): array
    {
        $queries = [];

        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $callback();

        return $queries;
    }

    /**
     * Runs a callback with a tenant scope active, the way an HTTP request would.
     */
    protected function withTenantContext(Tenant $tenant, callable $callback): mixed
    {
        app(TenantContext::class)->set($tenant);

        try {
            return $callback();
        } finally {
            app(TenantContext::class)->clear();
        }
    }
}
