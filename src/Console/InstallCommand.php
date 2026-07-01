<?php

namespace GadingRengga\LiveDomJS\Console;

use Illuminate\Console\Command;

class InstallCommand extends Command
{
    protected $signature = 'livedomjs:install {--publish : Publish assets & config ke project (opsional, untuk kustomisasi)}';
    protected $description = 'Cek status LiveDomJS & (opsional) publish assets/config untuk kustomisasi';

    public function handle()
    {
        $this->info('✅ LiveDomJS sudah aktif secara otomatis sejak composer require:');
        $this->line('   • Route AJAX terdaftar otomatis (tidak perlu edit routes/web.php)');
        $this->line('   • livedom.js otomatis disisipkan ke halaman (tidak perlu edit layout)');

        if ($this->option('publish')) {
            $this->call('vendor:publish', ['--tag' => 'livedomjs-assets']);
            $this->call('vendor:publish', ['--tag' => 'livedomjs-config']);
            $this->newLine();
            $this->info('📦 Assets & config dipublish. Setelah dipublish:');
            $this->comment('   • Edit config/livedomjs.php untuk ubah prefix route / matikan auto-inject.');
            $this->comment('   • File public/vendor/livedomjs/livedom.js kini otomatis dipakai (menggantikan versi package).');
        } else {
            $this->newLine();
            $this->comment('ℹ️  Tidak perlu langkah tambahan apa pun untuk fitur dasar.');
            $this->comment('   Jalankan dengan --publish jika ingin kustomisasi config atau edit langsung file JS-nya.');
        }

        $this->newLine();
        $this->comment('ℹ️  Untuk fitur live-realtime (WebSocket):');
        $this->comment('   1. Install & konfigurasi Laravel Reverb (atau driver broadcasting lain).');
        $this->comment('   2. Set BROADCAST_CONNECTION di .env sesuai driver tersebut.');
        $this->comment('   3. Tambahkan Laravel Echo + script berikut di layout Blade:');
        $this->comment("      <script src=\"{{ asset('vendor/livedomjs/dynamic-broadcast.js') }}\"></script>");

        $this->newLine();
        $this->info('🎉 Selesai.');
    }
}
