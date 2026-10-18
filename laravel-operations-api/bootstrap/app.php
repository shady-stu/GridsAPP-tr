<?php

use App\Http\Middleware\ResolveTenant;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Tenant resolution runs after authentication and before any controller,
        // form request or route model binding touches a tenant owned record.
        $middleware->alias([
            'tenant' => ResolveTenant::class,
        ]);

        // Enable the named "api" rate limiter on the whole api route group.
        $middleware->throttleApi();

        // Forced ordering: the two middleware in the framework's priority list
        // would otherwise leave `ResolveTenant` after `auth:sanctum`, but with
        // an unspecified position relative to `SubstituteBindings`, which makes
        // route model binding resolve *before* the tenant is known. Pinning
        // ResolveTenant immediately before SubstituteBindings guarantees the
        // TenantScope is active by the time {customer}/{product}/... are bound,
        // so a foreign id becomes a 404 instead of a leak.
        $middleware->prependToPriorityList(
            SubstituteBindings::class,
            ResolveTenant::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // API clients only ever receive JSON: never redirect an unauthenticated
        // API call to a login route.
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        });
    })->create();
