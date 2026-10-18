<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * stock_reserved is deliberately NOT fillable: it is only ever mutated by the
 * reservation actions while holding a `SELECT ... FOR UPDATE` lock on the row.
 */
#[Fillable(['sku', 'name', 'description', 'price', 'currency', 'stock_on_hand', 'is_active'])]
class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use BelongsToTenant, HasFactory;

    /**
     * Mirrors the database column defaults (see the products migration).
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'currency' => 'USD',
        'stock_on_hand' => 0,
        'stock_reserved' => 0,
        'is_active' => true,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'stock_on_hand' => 'integer',
            'stock_reserved' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class);
    }

    /**
     * Sellable quantity. Kept as a method (not an appended attribute) so a
     * resource can decide whether to expose it.
     */
    public function availableStock(): int
    {
        return max(0, $this->stock_on_hand - $this->stock_reserved);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        $needle = '%'.mb_strtolower($term).'%';

        return $query->where(function (Builder $query) use ($needle): void {
            $query->whereRaw('lower(name) like ?', [$needle])
                ->orWhereRaw('lower(sku) like ?', [$needle]);
        });
    }
}
