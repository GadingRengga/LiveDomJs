<div align="center">

<h1>⚡ LiveDomJS</h1>

<p><strong>HTML-native reactivity for Laravel — no build tools, no boilerplate, no learning curve.</strong></p>

<p>
  <a href="https://packagist.org/packages/gadingrengga/livedomjs"><img src="https://img.shields.io/packagist/v/gadingrengga/livedomjs?style=flat-square&color=6366f1" alt="Packagist Version"></a>
  <a href="https://packagist.org/packages/gadingrengga/livedomjs"><img src="https://img.shields.io/packagist/dt/gadingrengga/livedomjs?style=flat-square&color=10b981" alt="Total Downloads"></a>
  <a href="https://github.com/GadingRengga/LiveDomJs/blob/main/LICENSE"><img src="https://img.shields.io/github/license/GadingRengga/LiveDomJs?style=flat-square&color=f59e0b" alt="License"></a>
  <a href="https://github.com/GadingRengga/LiveDomJs"><img src="https://img.shields.io/github/stars/GadingRengga/LiveDomJs?style=flat-square&color=ec4899" alt="Stars"></a>
</p>

<p>
  <a href="https://gadingrengga.github.io/LiveDomJs">Documentation</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-examples">Examples</a> ·
  <a href="#-features">Features</a>
</p>

<br/>

```html
<!-- Before LiveDomJS: write controllers, register routes, set up components, manage state... -->

<!-- With LiveDomJS: just add an attribute. -->
<button live-click="saveUser" live-realtime="true">Save</button>
```

</div>

---

## What is LiveDomJS?

LiveDomJS is a lightweight JavaScript framework that brings reactivity directly to Laravel Blade — without Vue, React, Alpine, or any build pipeline.

Instead of creating separate API endpoints, writing JavaScript state management, or setting up frontend components, LiveDomJS lets you call your **existing Laravel controllers directly from HTML attributes**. The result is a reactive, real-time interface with almost zero additional code.

```html
<!-- This is all you need for a reactive form -->
<div live-scope="Invoice/ItemController">
  <input name="qty">
  <input name="price">
  <input live-compute="qty * price" live-compute-format="idr" readonly>
  <button live-click="save" live-target="#result">Save</button>
  <div id="result"></div>
</div>
```

No component class. No state management. No route registration. **Just HTML.**

---

## ✨ Features

### 🎯 Attribute-Driven Interactions
Bind any user interaction to your Laravel controller methods with a single HTML attribute. No JavaScript required.

```html
<button live-click="store">Create</button>
<input live-change="search">
<form live-submit="processForm">
<div live-hover="preview">
```

### 🔒 Scope-Based Data Isolation
`live-scope` defines a boundary — only inputs within that scope are sent with the request. Essential for tables with multiple rows of independent data.

```html
<!-- Row 1 — only sends its own inputs -->
<tr live-scope="Order/ItemController">
  <td><input name="qty"></td>
  <td><input name="price"></td>
  <td><button live-click="update">Update</button></td>
</tr>

<!-- Row 2 — completely isolated -->
<tr live-scope="Order/ItemController">
  <td><input name="qty"></td>
  <td><input name="price"></td>
  <td><button live-click="update">Update</button></td>
</tr>
```

### 🧮 Live Compute — Spreadsheet in HTML
Reactive calculations that run entirely in the browser — no server round trips, zero latency. Perfect for invoices, quotes, and financial forms.

```html
<input name="qty"           value="10">
<input name="price"         value="25000">
<input name="discount"      value="10">

<!-- Calculates instantly as user types -->
<input live-compute="qty * price * (1 - discount / 100)"
       live-compute-format="idr"
       readonly>

<!-- Aggregate across all rows -->
<input live-compute="sum(subtotal)" live-compute-format="idr" readonly>
```

Supports: `sum()`, `avg()`, `min()`, `max()`, `count()`, `sumif()` — and both IDR (`1.000.000,00`) and USD (`1,000,000.00`) number formats.

### ⚡ Real-Time Updates — One Attribute
Enable WebSocket broadcasting powered by [Laravel Reverb](https://reverb.laravel.com) by adding a single attribute. All channel management, event listening, and DOM updates are handled automatically.

```html
<!-- Without live-realtime: standard AJAX request -->
<button live-click="refresh">Refresh</button>

<!-- With live-realtime: broadcasts to all relevant open pages -->
<button live-click="refresh" live-realtime="true">Refresh</button>
```

When `live-realtime="true"` is set, the server broadcasts the event to all users who have a matching `live-scope` open — they all receive the update simultaneously without polling.

### 🔀 Reactive Directives
Reactively control visibility, classes, styles, and attributes based on input values — no JavaScript needed.

```html
<div live-show="qty > 0">In stock</div>
<div live-class="total > 1000000 ? 'text-green-500' : 'text-red-500'">Total</div>
<div live-style="opacity: qty > 0 ? 1 : 0.4">Preview</div>
```

### 🗺️ SPA Navigation
Turn any region into a Single Page Application area. Links and forms inside `live-spa-region` are intercepted automatically — no configuration needed.

```html
<main live-spa-region="main">
  <!-- All navigation here works as SPA -->
  <!-- Browser back/forward buttons work correctly -->
  <!-- Page scripts re-execute on each navigation -->
</main>
```

### 🔄 Smart AJAX Engine
- Automatic request cancellation — no stale responses
- Single-use response caching
- Debounced requests for `live-input` and `live-keyup`
- `live-poll` for automatic polling at any interval
- Detailed error modals in development, clean toasts in production

---

## 📦 Installation

**Requirements:** Laravel 9+, PHP 8.1+

```bash
# 1. Install the package
composer require gadingrengga/livedomjs

# 2. Run the install command
php artisan livedomjs:install
```

Add to your Blade layout:

```html
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="{{ asset('vendor/livedomjs/livedom.js') }}"></script>
```

That's it. No webpack. No npm. No build step.

---

## 🚀 Quick Start

### Basic AJAX Interaction

```html
<div live-scope="UserController">
  <input name="username" placeholder="Enter username...">
  <button live-click="checkAvailability" live-target="#status">
    Check
  </button>
  <div id="status"></div>
</div>
```

```php
// app/Http/Controllers/UserController.php
// No new routes or files needed — it just works.

public function checkAvailability(Request $request)
{
    $exists = User::where('username', $request->username)->exists();

    return response()->json([
        'success' => true,
        'data'    => $exists
            ? '<span class="text-red-500">Username taken</span>'
            : '<span class="text-green-500">Username available</span>',
    ]);
}
```

### Invoice Form with Auto-Calculation

```html
<div live-scope="Invoice/ItemController">
  <table>
    <tr>
      <td><input name="qty"      value="1"></td>
      <td><input name="price"    value="150000"></td>
      <td><input name="discount" value="0"></td>
      <td>
        <input live-compute="qty * price * (1 - discount / 100)"
               live-compute-format="idr" readonly>
      </td>
      <td><button live-click="removeItem">Remove</button></td>
    </tr>
  </table>

  <div>
    Total: <strong><input live-compute="sum(subtotal)"
                          live-compute-format="idr" readonly></strong>
  </div>

  <button live-click="submit" live-target="#response">Submit Invoice</button>
  <div id="response"></div>
</div>
```

### Real-Time Dashboard

```html
<!-- All users on this page will see updates simultaneously -->
<div live-scope="Dashboard/MetricsController">
  <div id="metrics-panel">
    <!-- Loaded initially by the controller -->
  </div>

  <!-- Clicking this broadcasts an update to all open dashboards -->
  <button live-click="refreshMetrics"
          live-realtime="true"
          live-target="#metrics-panel">
    Sync All
  </button>
</div>
```

---

## 📖 Directive Reference

### Interaction Attributes

| Attribute | Trigger | Example |
|---|---|---|
| `live-click` | Click | `<button live-click="store">` |
| `live-change` | Change | `<select live-change="filterList">` |
| `live-input` | Input (debounced) | `<input live-input="search">` |
| `live-keyup` | Key up | `<input live-keyup="suggest">` |
| `live-submit` | Form submit | `<form live-submit="processForm">` |
| `live-hover` | Mouse enter/leave | `<div live-hover="loadPreview">` |
| `live-poll` | Interval (ms) | `<div live-poll="5000" live-click="refresh">` |

### Reactive Directives

| Attribute | Function | Example |
|---|---|---|
| `live-compute` | Client-side calculation | `live-compute="qty * price"` |
| `live-show` | Conditional visibility | `live-show="stock > 0"` |
| `live-class` | Dynamic class | `live-class="valid ? 'green' : 'red'"` |
| `live-style` | Dynamic style | `live-style="opacity: active ? 1 : 0"` |
| `live-attr` | Dynamic attribute | `live-attr="disabled: qty < 1"` |
| `live-bind` | Two-way binding | `live-bind="username"` |

### Target & Scope Attributes

| Attribute | Function | Example |
|---|---|---|
| `live-scope` | Define request boundary | `<div live-scope="UserController">` |
| `live-target` | DOM update target | `live-target="#result"` |
| `live-realtime` | Enable WebSocket broadcast | `live-realtime="true"` |
| `live-compute-format` | Number format | `live-compute-format="idr"` |

---

## 🆚 How It Compares

| | LiveDomJS | Livewire | HTMX |
|---|---|---|---|
| New files per feature | **0** | 2+ (PHP class + Blade) | 0 |
| Route registration required | **No** | No | Yes |
| Client-side calculations | **Built-in** | Server round-trip | Manual JS |
| Real-time (WebSocket) | **One attribute** | Complex setup | Extension required |
| Laravel-native | **Yes** | Yes | No |
| Build step required | **No** | No | No |
| jQuery dependency | Yes | No | No |

> **When to choose LiveDomJS:** Data-heavy Laravel applications (ERP, CRM, admin panels) where you want reactive UIs without the overhead of a component-based framework.

---

## 🏗️ How It Works

LiveDomJS routes all AJAX requests through a single dynamic controller:

```
GET/POST /ajax/{controller}/{action}
```

This means your existing Laravel controllers work without any modification — no new routes, no new files.

```
User clicks [live-click="saveUser"]
    ↓
POST /ajax/UserController/saveUser
    ↓
AjaxController dispatches to UserController@saveUser
    ↓
Response rendered into [live-target="#result"]
```

For real-time requests (`live-realtime="true"`), the server broadcasts via Laravel Reverb to all users with a matching `live-scope` open, who then each fetch the updated content independently.

---

## 📂 Package Structure

```
LiveDomJs/
├── resources/
│   └── js/
│       └── livedom.js          # Core engine
├── src/
│   ├── Console/                # Artisan install command
│   ├── Http/
│   │   └── Controllers/
│   │       └── AjaxController.php  # Dynamic router
│   ├── Events/
│   │   └── DynamicBroadcastEvent.php
│   ├── Helpers/
│   │   └── BroadcastHelper.php
│   └── Providers/
│       └── LiveDomServiceProvider.php
└── README.md
```

---

## 🗺️ Roadmap

- [x] Attribute-driven AJAX interactions
- [x] Scope-based data isolation
- [x] Live compute with aggregate functions
- [x] Real-time broadcasting via Laravel Reverb
- [x] SPA navigation with pushState
- [x] Reactive directives (show, class, style, attr)
- [ ] DevTools browser extension
- [ ] Remove jQuery dependency
- [ ] VSCode extension for attribute autocomplete
- [ ] Official testing utilities

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome.

Before submitting changes, please be prepared to explain:
- **What** you're changing and why
- **What could break** as a result
- **How it affects** the framework's long-term direction

```bash
# Clone and set up
git clone https://github.com/GadingRengga/LiveDomJs
cd LiveDomJs

# Create a branch
git checkout -b feature/your-feature-name

# Make your changes, then open a pull request
```

---

## 👤 Author

**Gading Rengga**
- GitHub: [@GadingRengga](https://github.com/GadingRengga)
- Email: [gading.rengga@gmail.com](mailto:gading.rengga@gmail.com)

---

## 📜 License

Licensed under the [MIT License](LICENSE). Free to use in personal and commercial projects.

---

<div align="center">

**If LiveDomJS saves you time, consider giving it a ⭐ on GitHub.**

[Documentation](https://gadingrengga.github.io/LiveDomJs) · [Packagist](https://packagist.org/packages/gadingrengga/livedomjs) · [Issues](https://github.com/GadingRengga/LiveDomJs/issues)

</div>
