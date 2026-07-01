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
     | jQuery Source
     |--------------------------------------------------------------------
     | LiveDomJS bergantung pada jQuery. Default pakai CDN supaya tidak
     | perlu build step. Ganti null jika project sudah punya jQuery sendiri
     | (auto-inject akan skip jQuery, tapi tetap inject livedom.js).
     */
    'jquery_cdn' => 'https://code.jquery.com/jquery-3.6.0.min.js',

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
