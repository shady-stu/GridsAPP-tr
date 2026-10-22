<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\TenantResource;
use App\Support\TenantContext;

/**
 * Exposes the tenant the caller is authenticated against, so a client can verify
 * which organization it is talking to (mirrors GET /api/v1/tenant).
 */
final class TenantController extends Controller
{
    public function __invoke(TenantContext $context): TenantResource
    {
        return new TenantResource($context->tenant());
    }
}
