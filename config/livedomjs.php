<?php

return [

    /*
     |--------------------------------------------------------------------
     | Route Prefix
     |--------------------------------------------------------------------
     | Endpoint dinamis akan terdaftar sebagai: /{prefix}/{controller}/{action}
     */
    'route_prefix' => 'ajax',

    /*
     |--------------------------------------------------------------------
     | Route Middleware
     |--------------------------------------------------------------------
     | Middleware yang dipasang ke route AJAX dinamis (misal: 'web' agar
     | punya akses session/CSRF). Kosongkan array jika tidak perlu.
     */
    'route_middleware' => ['web'],

    /*
     |--------------------------------------------------------------------
     | Auto Inject Assets
     |--------------------------------------------------------------------
     | Jika true, package otomatis menyisipkan <script> jQuery + livedom.js
     | ke setiap response HTML sebelum </body>. Developer tidak perlu edit
     | Blade layout sama sekali. Set false jika ingin kontrol manual
     | (misal lewat <x-livedomjs::livedom-scripts />).
     */
    'auto_inject' => true,

    /*
     |--------------------------------------------------------------------
     | Auto Inject Realtime Assets
     |--------------------------------------------------------------------
     | Jika true DAN broadcasting connection "reverb" terdeteksi terisi
     | (config/broadcasting.php -> connections.reverb.key sudah di-set),
     | middleware otomatis juga menyisipkan: CSRF meta tag, window.userGlobal,
     | Laravel Echo + client Reverb, dan dynamic-broadcast.js. Developer
     | tidak perlu edit layout untuk mengaktifkan fitur live-realtime,
     | cukup install & konfigurasi Reverb saja.
     */
    'auto_inject_realtime' => true,

    /*
     |--------------------------------------------------------------------
     | jQuery Source
     |--------------------------------------------------------------------
     | LiveDomJS bergantung pada jQuery. Default pakai CDN supaya tidak
     | perlu build step. Ganti null jika project sudah punya jQuery sendiri
     | (auto-inject akan skip jQuery, tapi tetap inject livedom.js).
     */
    'jquery_cdn' => 'https://code.jquery.com/jquery-3.6.0.min.js',

    /*
     |--------------------------------------------------------------------
     | Realtime Client CDN (Pusher-JS + Laravel Echo)
     |--------------------------------------------------------------------
     | Reverb kompatibel dengan protokol Pusher, jadi client-nya memakai
     | pusher-js + laravel-echo. Default pakai CDN supaya tidak perlu build
     | step. Ganti null salah satunya jika project sudah punya bundle sendiri
     | (misal via Vite) — auto-inject akan skip script itu saja.
     */
    'pusher_cdn' => 'https://js.pusher.com/8.4.0/pusher.min.js',
    'echo_cdn' => 'https://unpkg.com/laravel-echo@1.16.1/dist/echo.iife.js',

    /*
     |--------------------------------------------------------------------
     | Serve Assets Without Publishing
     |--------------------------------------------------------------------
     | Jika true, livedom.js & dynamic-broadcast.js otomatis di-serve
     | lewat route package (tanpa perlu `vendor:publish`). Kalau file
     | sudah dipublish ke public/vendor/livedomjs, webserver akan serve
     | file statis itu duluan — route ini hanya fallback.
     */
    'serve_assets' => true,

];
