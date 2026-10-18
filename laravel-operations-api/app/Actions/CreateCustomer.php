<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\OperationalEventType;
use App\Models\Customer;
use App\Models\User;
use App\Services\OperationalEventLogger;
use Illuminate\Support\Facades\DB;

/**
 * CreateCustomer.
 *
 * The tenant, like everywhere else, comes from the authenticated user through
 * the TenantContext - it is deliberately absent from the request payload and
 * from the model's Fillable list, so a client cannot create a record inside
 * another tenant.
 */
final class CreateCustomer
{
    public function __construct(private readonly OperationalEventLogger $events) {}

    /**
     * @param  array{name: string, email: string, phone?: string|null, status?: string, notes?: string|null}  $attributes
     */
    public function handle(User $actor, array $attributes): Customer
    {
        // The customer row and its audit event are one unit of work: they are
        // committed together or not at all.
        return DB::transaction(function () use ($attributes): Customer {
            $customer = new Customer($attributes);
            $customer->save();

            $this->events->record(
                type: OperationalEventType::CustomerCreated,
                subject: $customer,
                payload: [
                    'customer_id' => (int) $customer->getKey(),
                    'status' => $customer->status->value,
                ],
            );

            return $customer;
        });
    }
}
