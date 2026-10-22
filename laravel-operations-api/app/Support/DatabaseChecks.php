<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Adds CHECK constraints to an existing table.
 *
 * Laravel's schema builder has no driver agnostic CHECK API, and SQLite cannot
 * add a CHECK constraint after a table exists (it only supports them inline at
 * CREATE TABLE time). Postgres is the intended database, so the constraint is
 * applied there and skipped elsewhere.
 *
 * These constraints are the last line of defence: even if application level
 * validation were bypassed, the database still refuses negative prices,
 * negative stock or reserving more than is on hand.
 */
final class DatabaseChecks
{
    public static function add(string $table, string $name, string $expression): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(sprintf(
            'ALTER TABLE %s ADD CONSTRAINT %s CHECK (%s)',
            $table,
            $name,
            $expression,
        ));
    }
}
