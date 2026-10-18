<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\CreateOrder;
use App\Actions\UpdateOrderStatus;
use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexOrderRequest;
use App\Http\Requests\Api\V1\StoreOrderRequest;
use App\Http\Requests\Api\V1\UpdateOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class OrderController extends Controller
{
    /**
     * Relations are eager loaded and the loaded columns are listed explicitly,
     * which keeps the endpoint at a constant number of queries no matter how many
     * orders are on the page.
     */
    public function index(IndexOrderRequest $request): AnonymousResourceCollection
    {
        $orders = Order::query()
            ->with([
                'customer:id,name,email,phone,status,notes,created_at,updated_at',
                'items:id,order_id,product_id,product_sku,product_name,unit_price,quantity,line_total',
            ])
            ->withCount('items')
            ->when(
                $request->validated('status'),
                fn (Builder $query, string $status): Builder => $query->where('status', $status),
            )
            ->when(
                $request->validated('customer_id'),
                fn (Builder $query, mixed $customerId): Builder => $query->where('customer_id', (int) $customerId),
            )
            ->when(
                $request->validated('placed_from'),
                fn (Builder $query, string $from): Builder => $query->where('placed_at', '>=', $from),
            )
            ->when(
                $request->validated('placed_until'),
                fn (Builder $query, string $until): Builder => $query->where('placed_at', '<=', $until),
            )
            ->orderBy($request->sortColumn(), $request->direction())
            ->paginate($request->perPage())
            ->withQueryString();

        return OrderResource::collection($orders);
    }

    public function show(Order $order): OrderResource
    {
        return new OrderResource($this->withDetail($order));
    }

    public function store(StoreOrderRequest $request, CreateOrder $action): JsonResponse
    {
        $order = $action->handle($request->user(), $request->validated());

        return (new OrderResource($this->withDetail($order)))->response()->setStatusCode(201);
    }

    public function update(UpdateOrderRequest $request, Order $order, UpdateOrderStatus $action): OrderResource
    {
        $updated = $action->handle(
            $order,
            OrderStatus::from((string) $request->validated('status')),
            $request->validated('notes'),
        );

        return new OrderResource($this->withDetail($updated));
    }

    private function withDetail(Order $order): Order
    {
        return $order->load([
            'customer',
            'items',
            'reservations.product',
        ]);
    }
}
