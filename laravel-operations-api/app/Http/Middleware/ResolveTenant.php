<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the tenant of the current request from the authenticated user and
 * publishes it on the request scoped TenantContext.
 *
 * This is the single place a tenant is decided. The client never supplies one:
 * there is no "tenant_id" request field anywhere in the API, and a suspended
 * tenant is refused outright.
 *
 * Runs after `auth:sanctum` and before controllers, form requests and route
 * model binding, so every query in the request is already tenant scoped.
 */
final class ResolveTenant
{
    public function __construct(private readonly TenantContext $context) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User) {
            // loadMissing is an explicit load (safe with lazy loading prevention).
            $user->loadMissing('tenant');

            /** @var Tenant|null $tenant */
            $tenant = $user->tenant;

            if ($tenant === null || ! $tenant->isActive()) {
                return response()->json([
                    'message' => 'This account is not attached to an active tenant.',
                ], 403);
            }

            $this->context->set($tenant);
        }

        return $next($request);
    }
}
