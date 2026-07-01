<?php

namespace GadingRengga\LiveDomJS\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Response;
use GadingRengga\LiveDomJS\Console\InstallCommand;
use GadingRengga\LiveDomJS\Http\Controllers\AjaxController;
use GadingRengga\LiveDomJS\Http\Middleware\InjectLiveDomAssets;

class LiveDomServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->mergeConfigFrom(
            dirname(__DIR__, 2) . '/config/livedomjs.php',
            'livedomjs'
        );

        if ($this->app->runningInConsole()) {
            $this->commands([
                InstallCommand::class,
            ]);
        }
    }

    public function boot()
    {
        $this->publishes([
            dirname(__DIR__, 2) . '/resources/js' => public_path('vendor/livedomjs'),
        ], 'livedomjs-assets');

        $this->publishes([
            dirname(__DIR__, 2) . '/resources/views' => resource_path('views/vendor/livedomjs'),
        ], 'livedomjs-views');

        $this->publishes([
            dirname(__DIR__, 2) . '/config/livedomjs.php' => config_path('livedomjs.php'),
        ], 'livedomjs-config');

        $this->registerAjaxRoute();
        $this->registerAssetFallbackRoute();
        $this->registerAutoInjectMiddleware();
    }

    /**
     * Daftarkan endpoint AJAX dinamis langsung dari provider — tidak
     * bergantung pada `artisan livedomjs:install` menulis ke routes/web.php.
     * Ini yang membuat package langsung berfungsi begitu di-composer require.
     */
    protected function registerAjaxRoute(): void
    {
        $prefix = config('livedomjs.route_prefix', 'ajax');
        $middleware = config('livedomjs.route_middleware', ['web']);

        Route::middleware($middleware)
            ->any("/{$prefix}/{controller}/{action}", [AjaxController::class, 'handle'])
            ->where('controller', '[a-zA-Z0-9\/\.]+')
            ->where('action', '[a-zA-Z0-9]+')
            ->name('livedomjs.ajax');
    }

    /**
     * Serve livedom.js & dynamic-broadcast.js langsung dari package,
     * sehingga TIDAK butuh `vendor:publish` untuk mulai memakainya.
     * Kalau file sudah dipublish ke public/, webserver akan serve file
     * statis itu langsung (Laravel routing tidak akan pernah tersentuh),
     * jadi route ini murni fallback yang aman.
     */
    protected function registerAssetFallbackRoute(): void
    {
        if (!config('livedomjs.serve_assets', true)) {
            return;
        }

        Route::get('/vendor/livedomjs/{file}', function (string $file) {
            $allowed = ['livedom.js', 'dynamic-broadcast.js'];

            if (!in_array($file, $allowed, true)) {
                abort(404);
            }

            $path = dirname(__DIR__, 2) . "/resources/js/{$file}";

            if (!file_exists($path)) {
                abort(404);
            }

            return Response::make(file_get_contents($path), 200, [
                'Content-Type' => 'application/javascript',
                'Cache-Control' => 'public, max-age=86400',
            ]);
        })->where('file', '[a-zA-Z0-9\-\.]+')->name('livedomjs.asset');
    }

    /**
     * Pasang middleware yang otomatis menyisipkan <script> jQuery +
     * livedom.js ke setiap response HTML. Developer tidak perlu edit
     * Blade layout untuk mulai memakai LiveDomJS.
     */
    protected function registerAutoInjectMiddleware(): void
    {
        if (!config('livedomjs.auto_inject', true)) {
            return;
        }

        $this->app['router']->pushMiddlewareToGroup('web', InjectLiveDomAssets::class);
    }
}
