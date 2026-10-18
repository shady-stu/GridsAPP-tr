<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\StockReservationController;
use App\Http\Controllers\Api\V1\TenantController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API routes (v1)
|--------------------------------------------------------------------------
|
| Every route below is JSON only. Requests are authenticated with a Sanctum
| bearer token and then passed through the `tenant` middleware, which resolves
| the tenant from the authenticated user and publishes it to the TenantContext.
| No endpoint accepts a tenant identifier from the client.
|
*/

Route::prefix('v1')->name('api.v1.')->group(function (): void {
    // Unauthenticated: issues a personal access token. Rate limited separately
    // from the general API limiter to slow down credential stuffing.
    Route::post('auth/token', [AuthController::class, 'store'])
        ->middleware('throttle:6,1')
        ->name('auth.token.store');

    Route::middleware(['auth:sanctum', 'tenant'])->group(function (): void {
        Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
        Route::delete('auth/token', [AuthController::class, 'destroy'])->name('auth.token.destroy');

        // The tenant the current token belongs to.
        Route::get('tenant', TenantController::class)->name('tenant.show');

        Route::apiResource('customers', CustomerController::class)
            ->only(['index', 'show', 'store', 'update']);

        Route::apiResource('products', ProductController::class)
            ->only(['index', 'show', 'store', 'update']);

        Route::apiResource('orders', OrderController::class)
            ->only(['index', 'show', 'store', 'update']);

        // Stock reservations: create a hold, list holds, release a hold.
        Route::apiResource('stock-reservations', StockReservationController::class)
            ->only(['index', 'store', 'destroy']);
    });
});
