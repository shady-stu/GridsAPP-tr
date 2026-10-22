<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\ReleaseStockReservation;
use App\Actions\ReserveStock;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexStockReservationRequest;
use App\Http\Requests\Api\V1\StoreStockReservationRequest;
use App\Http\Resources\StockReservationResource;
use App\Models\Order;
use App\Models\Product;
use App\Models\StockReservation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

final class StockReservationController extends Controller
{
    public function index(IndexStockReservationRequest $request): AnonymousResourceCollection
    {
        $reservations = StockReservation::query()
            ->with('product')
            ->when(
                $request->validated('status'),
                fn (Builder $query, string $status): Builder => $query->where('status', $status),
            )
            ->when(
                $request->validated('product_id'),
                fn (Builder $query, mixed $productId): Builder => $query->where('product_id', (int) $productId),
            )
            ->when(
                $request->validated('order_id'),
                fn (Builder $query, mixed $orderId): Builder => $query->where('order_id', (int) $orderId),
            )
            ->orderBy($request->sortColumn(), $request->direction())
            ->paginate($request->perPage())
            ->withQueryString();

        return StockReservationResource::collection($reservations);
    }

    /**
     * Hold stock for a product.
     *
     * A client may send an `Idempotency-Key` header (or an `idempotency_key`
     * body field) so a retried request returns the original reservation instead
     * of reserving the same inventory twice.
     */
    public function store(StoreStockReservationRequest $request, ReserveStock $action): JsonResponse
    {
        $product = $this->resolveProduct((int) $request->validated('product_id'));
        $order = $this->resolveOrder($request->validated('order_id'));

        $reservation = $action->handle(
            $product,
            (int) $request->validated('quantity'),
            $request->validated('idempotency_key'),
            $order,
        );

        return (new StockReservationResource($reservation->load('product')))
            ->response()
            ->setStatusCode($reservation->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Releases a hold. The reservation route parameter is resolved through the
     * tenant scope, so another tenant's reservation is a 404.
     */
    public function destroy(StockReservation $stockReservation, ReleaseStockReservation $action): StockReservationResource
    {
        $this->authorize('delete', $stockReservation);

        return new StockReservationResource($action->handle($stockReservation)->load('product'));
    }

    private function resolveProduct(int $productId): Product
    {
        // Tenant scoped lookup: a foreign product id is reported as invalid input
        // rather than leaking that it exists elsewhere.
        $product = Product::query()->whereKey($productId)->first();

        if ($product === null) {
            throw ValidationException::withMessages([
                'product_id' => [__('The selected product does not exist in your tenant.')],
            ]);
        }

        return $product;
    }

    private function resolveOrder(mixed $orderId): ?Order
    {
        if ($orderId === null) {
            return null;
        }

        $order = Order::query()->whereKey((int) $orderId)->first();

        if ($order === null) {
            throw ValidationException::withMessages([
                'order_id' => [__('The selected order does not exist in your tenant.')],
            ]);
        }

        return $order;
    }
}
