<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('operational_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('type', 64);
            $table->nullableMorphs('subject');
            // Sanitised payload: no secrets and no customer PII (see
            // OperationalEventLogger).
            $table->jsonb('payload')->nullable();
            // occurred_at doubles as the append-only created_at of the log.
            $table->timestamp('occurred_at');

            $table->index(['tenant_id', 'type', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('operational_events');
    }
};
