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
        // Publish assets
        $this->call('vendor:publish', ['--tag' => 'livedomjs-assets']);

        // Add route
        $route = "\nRoute::any('/ajax/{controller}/{action}', [\\GadingRengga\\LiveDomJS\\Http\\Controllers\\AjaxController::class, 'handle']);\n";
        File::append(base_path('routes/web.php'), $route);

        $this->info('LiveDomJS berhasil diinstall!');
    }
}
