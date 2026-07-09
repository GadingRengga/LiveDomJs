<?php

namespace GadingRengga\LiveDomJS\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InjectLiveDomAssets
{
    /**
     * Sisipkan <script> livedom.js (vanilla JS, tanpa dependency jQuery) —
     * dan, jika Reverb terkonfigurasi, juga stack realtime: CSRF meta tag,
     * window.userGlobal, Echo/Reverb client, dynamic-broadcast.js — ke
     * response HTML sebelum </body>, supaya developer tidak perlu edit
     * Blade layout sama sekali.
     */
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        if (!config('livedomjs.auto_inject', true)) {
            return $response;
        }

        if (!$this->isInjectableHtmlResponse($response)) {
            return $response;
        }

        $content = $response->getContent();

        // Sudah pernah disisipkan (misal lewat komponen manual atau publish
        // manual) — jangan duplikat.
        if (str_contains($content, 'vendor/livedomjs/livedom.js') || str_contains($content, '/livedomjs/livedom.js')) {
            return $response;
        }

        $tags = $this->buildAssetTags($request);

        if (str_contains($content, '</body>')) {
            $content = str_replace('</body>', $tags . "\n</body>", $content);
        } else {
            // Tidak ada </body> (misal partial/fragment) — tempel di akhir.
            $content .= $tags;
        }

        $response->setContent($content);

        return $response;
    }

    protected function isInjectableHtmlResponse(Response $response): bool
    {
        if (!method_exists($response, 'getContent') || !$response->getContent()) {
            return false;
        }

        $contentType = $response->headers->get('Content-Type', '');

        return str_contains($contentType, 'text/html');
    }

    protected function buildAssetTags(Request $request): string
    {
        $tags = '';

        // NOTE: livedom.js sudah 100% vanilla JS sejak versi terbaru —
        // jQuery TIDAK lagi dibutuhkan untuk fitur dasar. Config
        // 'jquery_cdn' dipertahankan (default null) hanya untuk kompatibilitas
        // mundur bagi project yang masih punya kode custom lain yang
        // butuh jQuery global; set manual di config kalau memang perlu.
        $jqueryCdn = config('livedomjs.jquery_cdn');
        if ($jqueryCdn && !$this->assumeJqueryPresent()) {
            $tags .= "<script src=\"{$jqueryCdn}\"></script>\n";
        }

        $livedomUrl = $this->resolveAssetUrl('livedom.js');
        $tags .= "<script src=\"{$livedomUrl}\"></script>\n";

        if ($this->shouldInjectRealtime()) {
            $tags .= $this->buildRealtimeTags($request);
        }

        return $tags;
    }

    /**
     * Placeholder hook — bisa dikembangkan untuk deteksi jQuery yang sudah
     * di-load manual oleh developer. livedom.js sendiri tidak butuh jQuery;
     * ini hanya relevan kalau developer set 'jquery_cdn' di config karena
     * ada kode custom lain di project yang masih bergantung pada jQuery.
     */
    protected function assumeJqueryPresent(): bool
    {
        return false;
    }

    /**
     * Realtime hanya di-inject kalau developer secara eksplisit belum
     * mematikannya DAN koneksi broadcasting "reverb" sudah terisi key-nya
     * (config/broadcasting.php). Kalau Reverb belum di-setup, skip diam-diam
     * supaya tidak muncul error JS "Echo is not defined" dkk di project yang
     * belum butuh realtime.
     */
    protected function shouldInjectRealtime(): bool
    {
        if (!config('livedomjs.auto_inject_realtime', true)) {
            return false;
        }

        return (bool) config('broadcasting.connections.reverb.key');
    }

    protected function buildRealtimeTags(Request $request): string
    {
        $csrfToken = $request->session()->token() ?? csrf_token();
        $userId = $request->user()?->getAuthIdentifier();

        $key = config('broadcasting.connections.reverb.key');
        $host = config('broadcasting.connections.reverb.options.host');
        $port = (int) config('broadcasting.connections.reverb.options.port', 80);
        $tlsPort = (int) config('broadcasting.connections.reverb.options.port', 443);
        $useTLS = config('broadcasting.connections.reverb.options.useTLS', true) ? 'true' : 'false';

        $tags = "<script>\n";
        $tags .= "if(!document.querySelector('meta[name=\"csrf-token\"]')){var m=document.createElement('meta');m.name='csrf-token';m.content=" . json_encode($csrfToken) . ";document.head.appendChild(m);}\n";
        $tags .= 'window.userGlobal=' . json_encode($userId) . ";\n";
        $tags .= "</script>\n";

        $pusherCdn = config('livedomjs.pusher_cdn');
        if ($pusherCdn) {
            $tags .= "<script src=\"{$pusherCdn}\"></script>\n";
        }

        $echoCdn = config('livedomjs.echo_cdn');
        if ($echoCdn) {
            $tags .= "<script src=\"{$echoCdn}\"></script>\n";
        }

        $tags .= "<script>\n";
        $tags .= 'window.Echo=new Echo({broadcaster:"reverb",key:' . json_encode($key)
            . ',wsHost:' . json_encode($host)
            . ",wsPort:{$port},wssPort:{$tlsPort},forceTLS:{$useTLS},enabledTransports:['ws','wss'],"
            . "authEndpoint:'/broadcasting/auth',auth:{headers:{'X-CSRF-TOKEN':" . json_encode($csrfToken) . "}}});\n";
        $tags .= "</script>\n";

        $dynamicBroadcastUrl = $this->resolveAssetUrl('dynamic-broadcast.js');
        $tags .= "<script src=\"{$dynamicBroadcastUrl}\"></script>\n";

        return $tags;
    }

    protected function resolveAssetUrl(string $file): string
    {
        $publishedPath = public_path("vendor/livedomjs/{$file}");

        if (file_exists($publishedPath)) {
            return asset("vendor/livedomjs/{$file}");
        }

        // Belum di-publish — pakai route fallback yang serve langsung dari package.
        return route('livedomjs.asset', ['file' => $file]);
    }
}