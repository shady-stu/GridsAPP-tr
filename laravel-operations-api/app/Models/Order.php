<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\OrderStatus;
use App\Models\Concerns\BelongsToTenant;
use Database\Factories\OrderFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * number, subtotal, tax_total and total are computed on the server from trusted
 * database prices/quantities and are therefore not mass assignable.
 */
#[Fillable(['customer_id', 'status', 'currency', 'notes', 'placed_at'])]
class Order extends Model
{
    /** @use HasFactory<OrderFactory> */
    use BelongsToTenant, HasFactory;

    /**
     * Mirrors the database column defaults (see the orders migration). The
     * totals are overwritten by CreateOrder from trusted product prices; the
     * defaults keep a factory-built order readable before it is saved.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'pending',
        'currency' => 'USD',
        'subtotal' => '0.00',
        'tax_total' => '0.00',
        'total' => '0.00',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'subtotal' => 'decimal:2',
            'tax_total' => 'decimal:2',
            'total' => 'decimal:2',
            'placed_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class);
    }

    public function scopeStatus(Builder $query, OrderStatus $status): Builder
    {
        return $query->where('status', $status->value);
    }

    public function isCancellable(): bool
    {
        return $this->status instanceof OrderStatus && ! $this->status->isFinal();
    }
}
