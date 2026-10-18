<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CustomerStatus;
use App\Models\Concerns\BelongsToTenant;
use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'email', 'phone', 'status', 'notes'])]
class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use BelongsToTenant, HasFactory;

    /**
     * Mirrors the database column defaults (see the customers migration).
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => CustomerStatus::class,
        ];
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /**
     * Case insensitive search that works on both PostgreSQL and SQLite.
     */
    public function scopeSearch(Builder $query, string $term): Builder
    {
        $needle = '%'.mb_strtolower($term).'%';

        return $query->where(function (Builder $query) use ($needle): void {
            $query->whereRaw('lower(name) like ?', [$needle])
                ->orWhereRaw('lower(email) like ?', [$needle]);
        });
    }
}
