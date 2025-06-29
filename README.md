# ⚡ LiveDomJs for Laravel

**LiveDomJs** adalah framework JavaScript ringan untuk Laravel yang memungkinkan manipulasi DOM dinamis, komunikasi AJAX reaktif, dan SPA (Single Page Application) tanpa konfigurasi rumit. Cocok untuk membuat UI interaktif langsung dari Laravel Blade, tanpa harus menggunakan framework frontend besar seperti Vue atau React.

> 🚀 *Integrasi cepat. Interaksi reaktif. Tanpa ribet.*

---

## ✨ Fitur Unggulan

- 🔁 **SPA Routing** dengan `pushState` tanpa reload  
- ⚡ **Event binding dinamis** (`live-action`, `live-event`, dll)  
- 🔄 **Reaktivitas otomatis** via `live-compute`, `live-if`  
- 🌐 **AJAX handler otomatis** untuk endpoint seperti `/ajax/{controller}/{action}`  
- 📦 **Asset publishing otomatis** ke `public/vendor/livedomjs`  
- 🛠️ **Integrasi langsung ke Laravel** melalui `composer` & `artisan`  

---

## 📦 Instalasi Laravel

### 1. Install package via Composer

```bash
composer require gadingrengga/livedomjs


2. Jalankan perintah instalasi
```bash
php artisan livedomjs:install


3. Tambahkan script ke layout Blade
```blade
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="{{ asset('vendor/livedomjs/livedom.js') }}"></script>

🗂️ Struktur Package
LiveDomJs/
├── composer.json
├── resources/
│   └── js/
│       └── livedom.js
├── src/
│   ├── Console/
│   ├── Http/
│   └── Providers/
├── docs/
│   └── index.html
└── README.md

🚀 Roadmap
 SPA pushState navigation

 AJAX dynamic binding

 Error modal system

📖 Dokumentasi Lengkap
👉 Buka dokumentasi online:
🌐 https://gadingrengga.github.io/LiveDomJs

👤 Author
Gading Rengga
📧 gading.rengga@gmail.com
🐙 github.com/GadingRengga


