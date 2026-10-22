<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The authenticated user as exposed to the client.
 *
 * password, remember_token and every tokenable column are never listed here, so
 * they cannot leak through a "new resource" refactor: only explicit fields are
 * returned.
 *
 * @mixin User
 */
final class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'tenant' => new TenantResource($this->whenLoaded('tenant')),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
