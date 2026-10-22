<?php

declare(strict_types=1);

use App\Support\DatabaseChecks;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Runs before the shipped users migration (0000 sorts before 0001) because
 * users belong to a tenant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug', 64)->unique();
            $table->string('status', 20)->default('active');
            $table->timestamps();

            $table->index('status');
        });

        DatabaseChecks::add('tenants', 'tenants_status_check', "status in ('active', 'suspended')");
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
