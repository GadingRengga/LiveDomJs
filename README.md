# ⚡ LiveDomJs

> Framework JavaScript ringan yang menghadirkan reaktivitas alami di dalam Laravel Blade tanpa harus menggunakan framework frontend besar seperti Vue, React, atau Alpine.  
> *Integrasi cepat. Interaksi reaktif. Tanpa ribet.*

---

## 🧠 Filosofi

LiveDomJs diciptakan untuk *developer Laravel* yang ingin membangun antarmuka reaktif tanpa memisahkan dunia backend dan frontend.  
Alih-alih menulis API REST, state management, dan routing JavaScript, LiveDomJs memanfaatkan Blade dan Controller langsung dengan pendekatan **HTML-reaktif**.

Tujuan akhirnya sederhana:
- Tidak ada *build step*, *webpack*, atau *npm run dev*.
- Tidak ada konfigurasi kompleks.
- Cukup tulis kode Laravel biasa dan tambahkan atribut `live-*`.

---

## ✨ Fitur Utama

- 🔁 **SPA Routing** dengan dukungan `pushState`
- ⚡ **Reaktivitas alami** menggunakan atribut:
  - `live-compute`
  - `live-show`, `live-class`, `live-style`, `live-attr`
  - `live-event(click|change|input|...)`
- 🔄 **Komunikasi AJAX dinamis** dengan caching dan debounce
- 🧩 **Auto-binding data response ke DOM**
- 🛠️ **Integrasi langsung ke Laravel** via `composer` & `artisan`
- 📦 **Publikasi asset otomatis** ke `public/vendor/livedomjs`
- 💡 **Tanpa dependensi berat** — hanya butuh jQuery

---

## 📦 Instalasi

### 1. Install package via Composer

```bash
composer require gadingrengga/livedomjs
```

### 2. Jalankan perintah instalasi

```bash
php artisan livedomjs:install
```

### 3. Tambahkan script ke layout Blade

```html
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="{{ asset('vendor/livedomjs/livedom.js') }}"></script>
```

---

## 🗂️ Struktur Package

```
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
```

---

## 🚀 Contoh Penggunaan

```html
<div live-scope="UserController">
    <input name="username" placeholder="Masukkan nama..." />

    <button live-click="saveUser" live-target="#result">Simpan</button>

    <div id="result"></div>
</div>
```

Contoh controller di Laravel:

```php
class UserController extends Controller {
    public function saveUser(Request $request)
    {
        return response()->json([
            'success' => true,
            'data' => 'User ' . $request->username . ' berhasil disimpan!'
        ]);
    }
}
```

---

## 🧩 Direktif Reaktif

| Atribut | Fungsi | Contoh |
|----------|---------|--------|
| `live-compute` | Menghitung nilai otomatis dari input lain | `<input live-compute="harga * qty">` |
| `live-show` | Menampilkan elemen jika ekspresi benar | `<div live-show="qty > 0">Stok tersedia</div>` |
| `live-class` | Menambah kelas dinamis | `<div live-class="qty > 10 ? 'bg-green' : 'bg-red'">` |
| `live-event(click)` | Menjalankan fungsi AJAX pada event | `<button live-click="addToCart">Tambah</button>` |

---

## 🧮 Live Compute

Gunakan `live-compute` untuk menghitung nilai otomatis berdasarkan input lain:

```html
<input name="harga" value="10000">
<input name="qty" value="2">
<input live-compute="harga * qty" live-compute-format="idr">
```

Hasilnya akan otomatis berubah saat harga atau qty diperbarui.

---

## 🌍 SEO & Dokumentasi Online

Untuk dokumentasi lengkap, panduan lanjutan, dan demo:

👉 **[https://gadingrengga.github.io/LiveDomJs](https://gadingrengga.github.io/LiveDomJs)**


## 🧭 Roadmap

- [ ] SPA pushState navigation  
- [ ] AJAX dynamic binding per-scope  
- [ ] Error modal system  
- [ ] DevTools inspector  

---

## 🤝 Kontribusi

Pull request, saran, dan bug report selalu diterima.

1. Fork repository ini  
2. Buat branch baru  
3. Commit perubahan  
4. Kirim pull request ke branch `main`

---

## 👤 Author

**Gading Rengga**  
📧 [gading.rengga@gmail.com](mailto:gading.rengga@gmail.com)  
🐙 [github.com/GadingRengga](https://github.com/GadingRengga)  

---

## 📜 Lisensi

Dilisensikan di bawah [MIT License](LICENSE).  
Gunakan bebas untuk proyek pribadi dan komersial.

---

## 🧩 Kata Kunci

`laravel reactive`, `laravel live dom`, `laravel spa`, `reactive dom`, `ajax dynamic`,  
`live compute`, `laravel frontend bridge`, `no-build laravel js`, `livewire alternative`,  
`jquery reactive framework`, `laravel dom reactivity`, `html reactive`
