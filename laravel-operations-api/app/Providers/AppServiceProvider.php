<?php

declare(strict_types=1);

namespace App\Providers;

use App\Events\OrderCreated;
use App\Listeners\QueueOrderConfirmation;
use App\Support\TenantContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Request scoped: it is reset between requests (and between Octane
        // requests) so tenant context can never leak from one request to another.
        $this->app->scoped(TenantContext::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureModels();
        $this->configureRateLimiting();
        $this->registerEventListeners();
    }

    /**
     * Outside production, turn invisible mistakes into loud failures:
     * an N+1 relationship access or a silently discarded mass assignment
     * attribute fails the test instead of quietly degrading correctness.
     */
    private function configureModels(): void
    {
        Model::preventLazyLoading(! $this->app->isProduction());
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
    }

    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', fn (Request $request): Limit => Limit::perMinute(60)
            ->by($request->user()?->getAuthIdentifier() ?? (string) $request->ip()));
    }

    /**
     * The order notification is wired explicitly rather than relying on listener
     * auto-discovery, so the single side effect of an OrderCreated event is
     * obvious from one place.
     */
    private function registerEventListeners(): void
    {
        Event::listen(OrderCreated::class, QueueOrderConfirmation::class);
    }
}
