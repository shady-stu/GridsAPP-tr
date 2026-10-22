<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexProductRequest;
use App\Http\Requests\Api\V1\StoreProductRequest;
use App\Http\Requests\Api\V1\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class ProductController extends Controller
{
    public function index(IndexProductRequest $request): AnonymousResourceCollection
    {
        $products = Product::query()
            ->when(
                $request->has('is_active'),
                fn (Builder $query): Builder => $query->where('is_active', $request->boolean('is_active')),
            )
            ->when(
                $request->validated('search'),
                fn (Builder $query, string $term): Builder => $query->search($term),
            )
            ->when(
                $request->validated('min_price'),
                fn (Builder $query, mixed $price): Builder => $query->where('price', '>=', $price),
            )
            ->when(
                $request->validated('max_price'),
                fn (Builder $query, mixed $price): Builder => $query->where('price', '<=', $price),
            )
            ->orderBy($request->sortColumn(), $request->direction())
            ->paginate($request->perPage())
            ->withQueryString();

        return ProductResource::collection($products);
    }

    public function show(Product $product): ProductResource
    {
        return new ProductResource($product);
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $attributes = $request->validated();
        $attributes['currency'] = strtoupper((string) ($attributes['currency'] ?? config('orders.default_currency')));

        // A single insert with no related side effects: an action would only add
        // indirection, so the controller writes the row directly.
        $product = new Product($attributes);
        $product->save();

        return (new ProductResource($product))->response()->setStatusCode(201);
    }

    public function update(UpdateProductRequest $request, Product $product): ProductResource
    {
        $attributes = $request->validated();

        if (isset($attributes['currency'])) {
            $attributes['currency'] = strtoupper((string) $attributes['currency']);
        }

        $product->fill($attributes)->save();

        return new ProductResource($product);
    }
}
