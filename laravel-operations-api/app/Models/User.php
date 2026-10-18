<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * A user always belongs to exactly one tenant. The tenant of a request is
 * derived from the authenticated user, which is why tenant_id can never be
 * supplied by an API client.
 */
#[Fillable(['name', 'email', 'password', 'role'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Mirrors the database column defaults (see the users migration).
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'role' => 'member',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function belongsToTenant(Tenant|int $tenant): bool
    {
        $tenantId = $tenant instanceof Tenant ? $tenant->getKey() : $tenant;

        return $this->tenant_id !== null && (int) $this->tenant_id === (int) $tenantId;
    }
}
