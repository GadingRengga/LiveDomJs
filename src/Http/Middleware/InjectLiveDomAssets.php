<?php

namespace GadingRengga\LiveDomJS\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InjectLiveDomAssets
{
    /**
     * Sisipkan <script> jQuery + livedom.js ke response HTML sebelum
     * </body>, supaya developer tidak perlu edit Blade layout sama sekali.
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

        $tags = $this->buildAssetTags();

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

    protected function buildAssetTags(): string
    {
        $tags = '';

        $jqueryCdn = config('livedomjs.jquery_cdn');
        if ($jqueryCdn && !$this->assumeJqueryPresent()) {
            $tags .= "<script src=\"{$jqueryCdn}\"></script>\n";
        }

        $livedomUrl = $this->resolveAssetUrl('livedom.js');
        $tags .= "<script src=\"{$livedomUrl}\"></script>\n";

        return $tags;
    }

    /**
     * Placeholder hook — bisa dikembangkan untuk deteksi jQuery yang sudah
     * di-load manual oleh developer. Untuk saat ini selalu inject kecuali
     * jquery_cdn di-set null di config.
     */
    protected function assumeJqueryPresent(): bool
    {
        return false;
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
