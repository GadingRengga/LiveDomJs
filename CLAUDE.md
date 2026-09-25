# LiveDomJS — Context for Claude

## What This Project Is

LiveDomJS (`gadingrengga/livedomjs`) is a Laravel package that adds HTML-attribute-driven reactivity to Blade views — no Vue, React, Alpine, or build step required. Every AJAX interaction, client-side calculation, and real-time update is driven entirely by HTML attributes.

**Do NOT suggest:**
- Vue, React, or Alpine.js as alternatives (this intentionally avoids them)
- Adding extra routes (routes are registered automatically)
- Writing separate JS files for interactions (attributes handle everything)
- `vendor:publish` as a required step (package works without it)

---

## Core Request Flow

```
User triggers live-click="saveUser" inside live-scope="UserController"
    ↓
POST /ajax/UserController/saveUser  (registered automatically by ServiceProvider)
    ↓
AjaxController::handle() validates & resolves → App\Http\Controllers\UserController@saveUser
    ↓
Controller returns response()->json(['success'=>true, 'data'=>'<html>']) or a View
    ↓
livedom.js injects response into live-target="#result"
```

---

## Attribute Quick Reference

```html
<!-- Scope + interaction -->
<div live-scope="Invoice/ItemController">
  <input name="qty" value="1" />
  <input name="price" value="50000" />

  <!-- Client-side calc — no server needed -->
  <input live-compute="qty * price" live-compute-format="idr" readonly />

  <!-- AJAX call on click → injects HTML into #result -->
  <button live-click="save" live-target="#result">Save</button>

  <!-- Same click but broadcasts to ALL users with this scope open -->
  <button live-click="refresh" live-realtime="true" live-target="#panel">Sync All</button>

  <div id="result"></div>
</div>

<!-- Reactive directives (no AJAX) -->
<div live-show="qty > 0">In stock</div>
<div live-class="total > 1000000 ? 'text-green-500' : 'text-red-500'">Total</div>
<div live-style="opacity: qty > 0 ? 1 : 0.4">Preview</div>

<!-- live-attr: multiple attributes, depth-aware parser (commas & colons in expressions are safe) -->
<button live-attr="disabled:qty<1, title:qty<1?'Out of stock':'Add to cart'">Add</button>

<!-- live-bind: one-way mirror (source input → target elements) -->
<input name="title" />
<span live-bind="title"></span>

<!-- SPA navigation -->
<main live-spa-region="main">
  <!-- All links/forms here intercepted as SPA -->
</main>
```

---

## Controller Resolution

`live-scope` value maps to `App\Http\Controllers\{resolved}`:

| live-scope value          | Resolved class                                    |
|---------------------------|---------------------------------------------------|
| `UserController`          | `App\Http\Controllers\UserController`             |
| `Invoice/ItemController`  | `App\Http\Controllers\Invoice\ItemController`     |
| `Admin.UserController`    | `App\Http\Controllers\Admin\UserController`       |

Controllers need NO special trait, interface, or base class — any standard Laravel controller works.

---

## Controller Response Format

```php
// Standard (HTML string in data)
return response()->json([
    'success' => true,
    'message' => 'Saved',
    'data'    => '<span class="text-green-500">Done</span>',
]);

// View (auto-rendered by AjaxController)
return view('partials.table', compact('items'));

// View with error message (AjaxController inspects view data)
return view('partials.result', ['error' => 'Record not found']);
// → response: success:false, message:'Record not found'

// View with success message override
return view('partials.result', compact('items') + ['success' => 'Items loaded']);

// Error
return response()->json([
    'success' => false,
    'message' => 'Validation failed',
], 422);
```

---

## live-compute Aggregate Functions

```html
<!-- Per-row subtotal -->
<input live-compute="qty * price * (1 - discount/100)" live-compute-format="idr" readonly />

<!-- Cross-row sum using wildcard -->
<input live-compute="sum(subtotal_?)" live-compute-format="idr" readonly />

<!-- Available: sum(), avg(), min(), max(), count(), sumif() -->
<!-- sumif: sumif(category_?, 'A', amount_?) — sum amount_? where category_? == 'A' -->

<!-- Formats: "idr" | "usd" | "jpy" | "eur" | "percent" | "plain" | "auto" -->

<!-- Advanced options -->
<input live-compute="qty * price" live-compute-init="false" readonly />       <!-- compute only after first user input -->
<input live-compute="dpp * tax" live-compute-trigger="dpp,tax" readonly />   <!-- only when those fields change -->
<input live-compute="total / qty" live-decimal-max="4" readonly />           <!-- max decimal places -->
<input live-compute="sub * 1.11" live-compute-format="auto" readonly />      <!-- follows LiveDom.setCurrency() -->
```

---

## Real-Time via Reverb

```php
// Manual broadcast from any PHP code
reverbDynamic(
    controller:  'Dashboard/MetricsController',
    function:    'refreshMetrics',
    target:      '#metrics-panel',
    data:        [],
    typeChannel: 'public',          // 'public' | 'private' | 'presence'
    recipients:  ['realtime-updates'] // channel suffix
);
```

Channel naming:
- `public` → `public-{recipient}`
- `private` → `private-user.{userId}`
- `presence` → `presence-{name}`

Realtime stack is auto-injected by middleware ONLY when `REVERB_APP_KEY` is set in `.env`. No errors if not configured.

---

## Key Files to Know

| File | Role |
|------|------|
| `src/Providers/LiveDomServiceProvider.php` | Registers everything automatically |
| `src/Http/Controllers/AjaxController.php` | Dynamic dispatcher — the single entry point |
| `src/Http/Middleware/InjectLiveDomAssets.php` | Injects JS before `</body>` on all HTML responses |
| `src/Helpers/BroadcastHelper.php` | `reverbDynamic()` global helper |
| `resources/js/livedom.js` | Core engine (vanilla JS) |
| `resources/js/dynamic-broadcast.js` | Echo client for realtime |
| `config/livedomjs.php` | All config options |

---

## Common Tasks

**Add a new interactive feature:**
1. Add method to existing controller (no new file needed)
2. Add `live-scope`, `live-click`, and `live-target` to the Blade HTML
3. Done — no route registration, no JS file

**Enable real-time for an action:**
1. Add `live-realtime="true"` to the trigger element
2. Ensure Reverb is configured (`php artisan install:broadcasting` on L11/L12)
3. Run `php artisan reverb:start` and `php artisan queue:work`

**Change the AJAX route prefix from `/ajax/` to `/live/`:**
```php
'route_prefix' => 'live',  // config/livedomjs.php
```

**Disable auto-injection (manual control):**
```php
'auto_inject' => false,
// Then add manually in Blade layout: <x-livedomjs::livedom-scripts />
```

**Register a custom number format:**
```js
window.LiveDom.registerFormat('myr', {
    kind: 'currency', locale: 'ms-MY',
    thousandSep: ',', decimalSep: '.', defaultDecimals: 2
});
```

**Switch currency at runtime (only affects `live-compute-format="auto"` elements):**
```js
window.LiveDom.setCurrency('usd');
```

---

## Known Behaviors & Gotchas

- `live-bind` is **one-way** (source input → target elements), not two-way. The target updates when source changes; editing the target does not update the source.
- `live-attr` accepts multiple `attr:expression` pairs separated by commas. The parser is depth-aware — commas inside `()`, `[]`, `{}`, or string literals are not treated as separators.
- `live-poll` requires the polling element to have an `id` attribute (target defaults to `#id`). Intervals are automatically cleared when the element leaves the DOM via SPA navigation.
- `live-compute` scope is global (`document`) — all `[live-compute]` elements share one engine instance. Avoid duplicate `name` attributes across independent forms on the same page.
- `live-compute` is NOT re-initialized on SPA swap (intentional — would create double instances). The internal MutationObserver handles new elements injected via AJAX/SPA automatically.
- `live-callback-after` only accepts a bare function **name** (`window[name](el, response)`). Dynamic payloads must come from the server response (`{message}`, `{redirect}`, `{query}`).
- `live-callback-before` accepts either a function name or a full expression with arguments. Return `true` (or a Promise resolving to `true`) to proceed; `false` cancels the request.
- Debug logs (`console.log`) in `livedom.js` are guarded by `IS_DEBUG` (from `<meta name="app-debug" content="true">`). Production console is clean.

---

## Additional Attributes (Beyond README)

### Loading & Callbacks
```html
<!-- Show element during request -->
<button live-click="save" live-loading="#my-spinner">Save</button>
<button live-click="save" live-loading-indicator>Save</button>  <!-- hides this button -->

<!-- Run JS before action (return true to proceed, false to cancel, or Promise) -->
<button live-click="delete" live-callback-before="confirmDelete">Delete</button>

<!-- Run JS after response -->
<button live-click="save" live-callback-after="afterSave">Save</button>
```

### DOM Action Control
```html
<!-- Default is "html" (innerHTML). Options: -->
<button live-click="loadMore" live-dom="append" live-target="#list">Load More</button>
<!-- append, prepend, before, after, value/val, text, html, toggle, show, hide, remove -->
```

### live-compute Advanced
```html
<!-- Skip initial calculation (calculate only after user types) -->
<input live-compute="qty * price" live-compute-init="false" readonly />

<!-- Only recalculate when specific inputs change -->
<input live-compute="dpp * tax_rate" live-compute-trigger="dpp,tax_rate" readonly />

<!-- Max decimal places -->
<input live-compute="total / qty" live-decimal-max="4" readonly />

<!-- Auto-follow global currency -->
<input live-compute="subtotal * 1.11" live-compute-format="auto" readonly />
```

### live-click with Arguments
```html
<!-- Scope data extraction to a specific element -->
<button live-click="update('#tr-1')">Save</button>

<!-- Pass static value -->
<button live-click="delete({{ $item->id }})">Delete</button>

<!-- Multiple comma-separated actions with multiple targets -->
<button live-click="loadHeader, loadBody" live-target="#header, #body">Refresh</button>
```

### live-target Extended Selectors
```html
<button live-click="remove" live-target="closest(tr)">Remove Row</button>
<button live-click="preview" live-target="next">Preview Below</button>
<button live-click="toggle" live-target="siblings">Toggle Siblings</button>
<button live-click="update" live-target="self">Update Self</button>
```

---

## Global JS API

```js
// Switch currency format for all live-compute-format="auto" elements
window.LiveDom.setCurrency('usd');

// Register a custom format
window.LiveDom.registerFormat('myr', {
    kind: 'currency', locale: 'ms-MY',
    thousandSep: ',', decimalSep: '.', defaultDecimals: 2
});

// Remove pinned format from an element
window.LiveDom.unpin(document.querySelector('#my-input'));
```

---

## DOM Events to Hook Into

```js
// After any AJAX DOM update
document.addEventListener('live-dom:afterUpdate', () => { /* reinit plugins */ });

// After SPA navigation
document.addEventListener('live-dom:afterSpa', (e) => { /* e.detail.url */ });

// After initLiveDom() runs
document.addEventListener('live-dom:init', () => { });

// After currency changes
document.addEventListener('livedom:currencychange', (e) => {
    console.log(e.detail.from, '->', e.detail.to);
});
```

---

## SPA Exclusion

```js
// In a script tag before livedom.js, or after:
window.liveDomConfig = {
    spaExcludePrefixes: ['/admin', '/api', '/logout']
};
```

---

## Error Handling

Debug mode is detected via `<meta name="app-debug" content="true">`.
- **Debug ON**: Full modal with Laravel stack trace + "Ask ChatGPT" button
- **Debug OFF**: Simple toast with error message only

Controllers can trigger the error modal by returning `success: false`.

---

## autoBindDomFromResponse

When a controller returns a plain JSON object (not a string in `data`), livedom.js automatically maps each key to DOM elements:
- Looks for `#key`, `.key`, plus camelCase/kebab-case/snake_case variants
- Form fields → `.value` is set + `input`/`change` events fired
- Other elements → `.innerHTML` is set

```php
// This response auto-fills #total, #tax, .subtotal elements
return response()->json([
    'success' => true,
    'data' => [
        'total' => 150000,
        'tax' => 15000,
        'subtotal' => 135000,
    ]
]);
```
