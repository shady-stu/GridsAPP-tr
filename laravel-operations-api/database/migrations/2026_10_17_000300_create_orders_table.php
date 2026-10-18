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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            // Wide enough for the provisional `PENDING-<uuid>` number written at
            // insert time (44 chars) as well as the final `ORD-00000001` form.
            $table->string('number', 64);
            $table->string('status', 20)->default('pending');
            $table->char('currency', 3)->default('USD');
            // Money is server computed from trusted product prices.
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('tax_total', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamp('placed_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'created_at']);
            $table->index(['tenant_id', 'customer_id']);
        });

        DatabaseChecks::add(
            'orders',
            'orders_status_check',
            "status in ('pending', 'confirmed', 'fulfilled', 'cancelled')",
        );
        DatabaseChecks::add(
            'orders',
            'orders_totals_non_negative',
            'subtotal >= 0 and tax_total >= 0 and total >= 0',
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
