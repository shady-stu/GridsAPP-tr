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
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            // Products referenced by historical orders cannot be deleted.
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('product_sku', 64);
            $table->string('product_name');
            $table->decimal('unit_price', 12, 2);
            $table->unsignedInteger('quantity');
            $table->decimal('line_total', 14, 2);
            $table->timestamps();

            $table->index(['order_id', 'product_id']);
            $table->index('product_id');
        });

        DatabaseChecks::add('order_items', 'order_items_quantity_positive', 'quantity > 0');
        DatabaseChecks::add(
            'order_items',
            'order_items_amounts_non_negative',
            'unit_price >= 0 and line_total >= 0',
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
