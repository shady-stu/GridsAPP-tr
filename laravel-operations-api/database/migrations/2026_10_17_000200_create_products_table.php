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
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('sku', 64);
            $table->string('name');
            $table->text('description')->nullable();
            // Monetary values always use a fixed scale decimal, never a float.
            $table->decimal('price', 12, 2);
            $table->char('currency', 3)->default('USD');
            $table->unsignedInteger('stock_on_hand')->default(0);
            $table->unsignedInteger('stock_reserved')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'sku']);
            $table->index(['tenant_id', 'is_active']);
            $table->index(['tenant_id', 'name']);
        });

        DatabaseChecks::add('products', 'products_price_non_negative', 'price >= 0');
        // Row level inventory invariants. `stock_reserved <= stock_on_hand` is
        // what makes overselling impossible even under a code path bug.
        DatabaseChecks::add(
            'products',
            'products_stock_invariants',
            'stock_on_hand >= 0 and stock_reserved >= 0 and stock_reserved <= stock_on_hand',
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
