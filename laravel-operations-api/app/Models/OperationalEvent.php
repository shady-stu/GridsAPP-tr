<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\OperationalEventType;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Append-only operational log. Rows are never updated, which keeps the audit
 * trail trustworthy. Payloads must not contain secrets or customer PII: the
 * OperationalEventLogger service enforces that before writing.
 */
#[Fillable(['type', 'subject_type', 'subject_id', 'payload', 'occurred_at'])]
class OperationalEvent extends Model
{
    use BelongsToTenant;

    /**
     * The table only stores occurred_at, there is no updated_at.
     */
    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => OperationalEventType::class,
            'payload' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public function subject(): MorphTo
    {
        return $this->morphTo();
    }
}
