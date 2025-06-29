# LiveDomJs for Laravel

LiveDomJs adalah framework JavaScript ringan berbasis DOM dinamis dengan fitur SPA, event binding, AJAX reactivity, dan komponen reaktif. Package ini menyediakan integrasi langsung dengan Laravel untuk auto-binding dan AJAX action handler.

## ✨ Fitur
- SPA (Single Page Application) dengan pushState
- Dynamic event binding
- `live-action`, `live-event`, `live-if`, dan `live-compute`
- AJAX controller handler otomatis (`/ajax/{controller}/{action}`)
- Auto-publish assets ke `public/vendor/livedomjs`

## 📦 Instalasi

### 1. Install via Composer
```bash
composer require gadingrengga/livedomjs

### 2. Jalankan perintah instalasi
```bash
php artisan livedomjs:install

### 3. Tambahkan LiveDomJs ke Blade
```bash
<script src="{{ asset('vendor/livedomjs/livedom.js') }}"></script>

