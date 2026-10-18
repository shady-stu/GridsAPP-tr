<?php

declare(strict_types=1);

use App\Support\DatabaseChecks;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('quantity');
            $table->string('status', 20)->default('held');
            // Client supplied replay key. Unique per tenant so a retried request
            // cannot reserve the same inventory twice.
            $table->string('idempotency_key', 120)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            // Multiple NULLs are allowed in Postgres, so reservations without a
            // replay key are unconstrained while duplicates are rejected.
            $table->unique(['tenant_id', 'idempotency_key']);
            $table->index(['tenant_id', 'status']);
            $table->index(['product_id', 'status']);
            $table->index('order_id');
        });

        DatabaseChecks::add('stock_reservations', 'stock_reservations_quantity_positive', 'quantity > 0');
        DatabaseChecks::add(
            'stock_reservations',
            'stock_reservations_status_check',
            "status in ('held', 'committed', 'released', 'expired')",
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
    }
};
