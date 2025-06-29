<?php

namespace GadingRengga\LiveDomJS\Providers;

use Illuminate\Support\ServiceProvider;
use GadingRengga\LiveDomJS\Console\InstallCommand;

class LiveDomServiceProvider extends ServiceProvider
{
    public function register()
    {
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
            dirname(__DIR__, 2) . '/resources/views' => resource_path('views/vendor/livedomjs'),
        ], 'livedomjs-assets');
    }
}
