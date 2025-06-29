<?php

namespace GadingRengga\LiveDomJS\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class InstallCommand extends Command
{
    protected $signature = 'livedomjs:install';
    protected $description = 'Install LiveDomJS package';

    public function handle()
    {
        // Publish asset
        $this->call('vendor:publish', ['--tag' => 'livedomjs-assets']);

        // Tambahkan route ajax jika belum ada
        $routeFile = base_path('routes/web.php');
        $routeDefinition = "Route::any('/ajax/{controller}/{action}', [\\GadingRengga\\LiveDomJS\\Http\\Controllers\\AjaxController::class, 'handle']);";

        $existing = File::get($routeFile);

        if (!str_contains($existing, $routeDefinition)) {
            File::append($routeFile, "\n\n// LiveDomJs AJAX Route\n" . $routeDefinition . "\n");
            $this->info('✅ Route AJAX LiveDomJs berhasil ditambahkan.');
        } else {
            $this->info('ℹ️ Route AJAX LiveDomJs sudah ada.');
        }

        $this->info('🎉 LiveDomJS berhasil diinstall!');
    }
}
