<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ReservationStatus;
use App\Models\Concerns\BelongsToTenant;
use Database\Factories\StockReservationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['product_id', 'order_id', 'quantity', 'status', 'expires_at', 'idempotency_key'])]
class StockReservation extends Model
{
    /** @use HasFactory<StockReservationFactory> */
    use BelongsToTenant, HasFactory;

    /**
     * Mirrors the database column defaults (see the stock_reservations
     * migration).
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'held',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => ReservationStatus::class,
            'quantity' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', ReservationStatus::Held->value);
    }

    public function isActive(): bool
    {
        return $this->status instanceof ReservationStatus && $this->status->isActive();
    }
}
