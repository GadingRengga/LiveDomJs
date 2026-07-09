(function () {
    "use strict";

    /*==============================
        VANILLA JS DOM HELPERS
        (pengganti jQuery — dipakai internal saja, tidak mengubah
        API atribut live-* sedikit pun)
    ==============================*/
    function qs(selector, root = document) {
        return root.querySelector(selector);
    }
    function qsa(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }
    // Normalisasi "target" yang di versi lama bisa berupa selector string,
    // Element, atau NodeList/Array — selalu kembalikan array of Element.
    function toElements(target) {
        if (!target) return [];
        if (target instanceof Element) return [target];
        if (target instanceof NodeList || Array.isArray(target)) {
            return Array.from(target).filter((t) => t instanceof Element);
        }
        if (typeof target === "string") return qsa(target);
        return [];
    }
    function showEl(el) {
        if (!el) return;
        if (el.dataset._liveDisplay === undefined) {
            const current = el.style.display;
            el.dataset._liveDisplay = current && current !== "none" ? current : "";
        }
        el.style.display = el.dataset._liveDisplay || "";
    }
    function hideEl(el) {
        if (!el) return;
        if (el.dataset._liveDisplay === undefined) {
            const current = el.style.display;
            el.dataset._liveDisplay = current && current !== "none" ? current : "";
        }
        el.style.display = "none";
    }
    function toggleEl(el, force) {
        if (!el) return;
        const shouldShow = typeof force === "boolean" ? force : el.style.display === "none";
        if (shouldShow) showEl(el);
        else hideEl(el);
    }
    function closestAncestor(el, selector) {
        return el && el.closest ? el.closest(selector) : null;
    }
    function isEl(el, selector) {
        return !!(el && el.matches && el.matches(selector));
    }
    function csrfToken() {
        const meta = qs('meta[name="csrf-token"]');
        return meta ? meta.getAttribute("content") : "";
    }

    // Replikasi PERSIS algoritma jQuery.param() (mode default, traditional:false)
    // — ini yang dipakai $.ajax secara internal untuk mengubah object `data`
    // jadi query string saat method GET. Ditulis ulang manual karena
    // URLSearchParams + JSON.stringify (versi lama) menghasilkan format
    // berbeda untuk array/nested object dibanding jQuery:
    //   jQuery : { a: [1,2] }        -> "a%5B%5D=1&a%5B%5D=2"   (a[]=1&a[]=2)
    //   jQuery : { a: { b: 1 } }     -> "a%5Bb%5D=1"             (a[b]=1)
    //   jQuery : { a: [{x:1}] }      -> "a%5B0%5D%5Bx%5D=1"      (a[0][x]=1)
    //   jQuery : { a: null }         -> "a="
    // Semua kasus di atas SEKARANG identik hasilnya dengan versi jQuery.
    const rbracket = /\[\]$/;

    function jqType(obj) {
        if (obj == null) return obj + "";
        return typeof obj === "object" || typeof obj === "function"
            ? Object.prototype.toString.call(obj).slice(8, -1).toLowerCase()
            : typeof obj;
    }

    function jqParam(data) {
        const s = [];

        const add = (key, value) => {
            const v = typeof value === "function" ? value() : value;
            s.push(
                encodeURIComponent(key) +
                    "=" +
                    encodeURIComponent(v == null ? "" : v),
            );
        };

        const buildParams = (prefix, obj) => {
            if (Array.isArray(obj)) {
                obj.forEach((v, i) => {
                    if (rbracket.test(prefix)) {
                        // prefix sudah diakhiri "[]" -> jangan di-bracket lagi (nested array)
                        add(prefix, v);
                    } else {
                        buildParams(
                            prefix +
                                "[" +
                                (typeof v === "object" && v != null ? i : "") +
                                "]",
                            v,
                        );
                    }
                });
            } else if (jqType(obj) === "object") {
                for (const name in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, name)) {
                        buildParams(prefix + "[" + name + "]", obj[name]);
                    }
                }
            } else {
                add(prefix, obj);
            }
        };

        for (const prefix in data) {
            if (Object.prototype.hasOwnProperty.call(data, prefix)) {
                buildParams(prefix, data[prefix]);
            }
        }

        return s.join("&");
    }

    /*==============================
        AJAX DYNAMIC
    ==============================*/
    const ajaxDynamicControllers = {};
    // Di bagian atas file / sebelum fungsi ajaxDynamic
    const IS_DEBUG = document.querySelector('meta[name="app-debug"]')?.content === "true";
    /**
     * Performs an AJAX request with dynamic content loading capabilities.
     * Supports abortion of previous requests for the same target.
     *
     * @param {string} method - HTTP method (e.g., 'POST', 'GET').
     * @param {string} controller - The controller name for the URL.
     * @param {string} action - The action name for the URL.
     * @param {object|FormData} data - Data to be sent with the request.
     * @param {string} [target='html'] - How the response data should be handled ('html', 'value', or a function name).
     * @param {string} [targetId='#'] - The CSS selector for the target element.
     * @param {boolean} [loading=true] - Whether to show a loading indicator.
     * @param {function} [callback=null] - A custom callback function to handle the response.
     */

    // Simpan cache response sementara (single-use)
    const ajaxCache = new Map();

    // FIX (live-loading): show/hide berbasis refcount, supaya kalau 2 request
    // beririsan menunjuk target loading yang sama, elemen itu tidak ke-hide
    // prematur oleh request pertama yang selesai duluan sementara request
    // kedua masih berjalan. `loadingTarget` bisa berupa:
    //   - satu selector string (mis. dari live-loading="#id")
    //   - array campuran selector string / elemen DOM (live-loading DAN
    //     live-loading-indicator digabung jadi satu array di handleLiveEvent())
    //   - null/undefined (tidak ada loading indicator)
    const loadingRefCount = new Map();

    function toLoadingList(loadingTarget) {
        if (!loadingTarget) return [];
        return Array.isArray(loadingTarget) ? loadingTarget : [loadingTarget];
    }

    function showLoading(loadingTarget) {
        toLoadingList(loadingTarget).forEach((target) => {
            loadingRefCount.set(target, (loadingRefCount.get(target) || 0) + 1);
            toElements(target).forEach(showEl);
        });
    }

    function hideLoading(loadingTarget) {
        toLoadingList(loadingTarget).forEach((target) => {
            const remaining = Math.max(
                0,
                (loadingRefCount.get(target) || 0) - 1,
            );
            loadingRefCount.set(target, remaining);
            if (remaining === 0) toElements(target).forEach(hideEl);
        });
    }

    function ajaxDynamic(
        method = "POST",
        controller,
        action,
        data = {},
        target = "html",
        targetId = "#",
        loading = null,
        callback = null,
        useCache = false,
    ) {
        const key =
            targetId ||
            `${controller}_${action}_${method}_${JSON.stringify(data)}`;

        // ✅ Batalkan request sebelumnya untuk target yang sama
        if (ajaxDynamicControllers[key]) {
            ajaxDynamicControllers[key].abort();
        }

        // ✅ Gunakan cache sekali pakai (optional)
        if (useCache && ajaxCache.has(key)) {
            const response = ajaxCache.get(key);
            ajaxCache.delete(key);
            if (typeof callback === "function") callback(response);
            else callBackAjaxDynamic(target, targetId, response);
            return;
        }

        const abortController = new AbortController();
        ajaxDynamicControllers[key] = abortController;

        showLoading(loading);

        const isFormData = data instanceof FormData;

        // 🔥 Deteksi elemen pemicu LiveDOM
        const triggerEl = closestAncestor(
            document.activeElement,
            "[live-click], [live-change]",
        );
        const isRealtime = triggerEl?.getAttribute("live-realtime") === "true";
        const liveTarget =
            triggerEl?.getAttribute("live-target") || targetId || "auto";

        // ✅ Tambahkan metadata ke data (untuk AjaxController)
        if (!isFormData) {
            data = {
                ...data,
                live_target: liveTarget,
                realtime: isRealtime ? true : false,
            };
        } else if (isRealtime) {
            data.append("realtime", true);
            data.append("live_target", liveTarget);
        }

        let url = `/ajax/${controller}/${action}`;
        const fetchOptions = {
            method,
            signal: abortController.signal,
            headers: {
                ...(method !== "GET" && { "X-CSRF-TOKEN": csrfToken() }),
                ...(isRealtime && { "X-Live-Reverb": "true" }),
            },
        };

        if (method === "GET") {
            // FIX (serialisasi GET): dulu pakai URLSearchParams + JSON.stringify
            // untuk value object, yang formatnya BEDA dari jQuery ($.ajax
            // menyerialisasi `data` object via $.param() secara internal).
            // Sekarang pakai jqParam() supaya query string yang dihasilkan
            // identik persis dengan versi jQuery (termasuk array & nested object).
            const queryString = jqParam(data || {});
            if (queryString) url += `?${queryString}`;
        } else if (isFormData) {
            fetchOptions.body = data;
        } else {
            fetchOptions.headers["Content-Type"] = "application/json";
            fetchOptions.body = JSON.stringify(data);
        }

        console.log("🚀 Sending fetch to", url);

        fetch(url, fetchOptions)
            .then(async (res) => {
                const contentType = res.headers.get("content-type") || "";
                let parsed = null;
                let rawText = null;

                if (contentType.includes("application/json")) {
                    parsed = await res.json();
                } else {
                    rawText = await res.text();
                    try {
                        parsed = JSON.parse(rawText);
                    } catch {
                        parsed = null;
                    }
                }

                if (!res.ok) {
                    const err = new Error(`HTTP ${res.status}`);
                    err.contentType = contentType;
                    err.rawText = rawText;
                    err.parsed = parsed;
                    throw err;
                }

                console.log("✅ SUCCESS fired", parsed);
                delete ajaxDynamicControllers[key];
                if (useCache) ajaxCache.set(key, parsed);

                // ⚡ Jika server sudah melakukan broadcast realtime → skip render lokal
                if (
                    parsed?.message?.includes(
                        "Broadcasted via ReverbDynamic",
                    ) ||
                    parsed?.realtime === true
                ) {
                    console.log(
                        "[ReverbDynamic] Broadcasted realtime — skip local DOM update.",
                    );
                    return;
                }

                if (typeof callback === "function") callback(parsed);
                else callBackAjaxDynamic(target, targetId, parsed);
            })
            .catch((err) => {
                // (hide loading indicator sudah ditangani oleh `.finally` di bawah)
                delete ajaxDynamicControllers[key];

                if (err.name === "AbortError") return;

                // ✅ Debug mode → langsung toast, skip modal detail
                if (!IS_DEBUG) {
                    const msg = err.parsed?.message || "Terjadi kesalahan.";
                    showProductionErrorToast(msg);
                    return;
                }

                // 🛠️ Development mode → tampilkan detail error
                const contentType = err.contentType || "";

                if (contentType.includes("text/html")) {
                    showErrorModal(err.rawText);
                    return;
                }

                let json = err.parsed;
                if (!json) {
                    json = { message: "Unparsable response", raw: err.rawText };
                }

                if (json.production_error) {
                    showProductionErrorToast(json.message || "Terjadi kesalahan.");
                    return;
                }

                showErrorModal(json);
            })
            .finally(() => {
                hideLoading(loading);
            });
    }

    /**
     * Handles the callback logic for ajaxDynamic, updating the DOM or calling a global function.
     * @param {string} target - The type of target handling ('html', a global function name).
     * @param {string} targetId - The ID or selector of the target element.
     * @param {object} response - The AJAX response object.
     */
    function callBackAjaxDynamic(target, targetId, response) {
        if (response.success) {
            if (
                typeof target === "string" &&
                target !== "html" &&
                window[target]
            ) {
                window[target](response.data, targetId);
            } else if (target === "html") {
                qsa(`${targetId}`).forEach((el) => {
                    el.innerHTML = response.data;
                });
            } else if (typeof target == "function") {
                target(response.data, targetId);
            }
        } else {
            // ✅ Tampilkan modal error, bukan hanya console.error
            showErrorModal({
                message: response.message || "Unknown error",
                exception: response.exception || "",
                file: response.file || "",
                line: response.line || "",
                trace: response.trace || {},
            });
        }
    }

    /*==============================
      UTILITIES
    ==============================*/

    const debounceMap = new Map();

    /**
     * Executes an AJAX dynamic call with a debounce mechanism to prevent rapid-fire requests.
     * @param {string} methodType - HTTP method (e.g., 'POST', 'GET').
     * @param {string} controller - The controller name.
     * @param {string} method - The method name.
     * @param {object|FormData} data - Data to send.
     * @param {string} target - How the response data should be handled.
     * @param {string} targetId - The CSS selector for the target element.
     * @param {boolean} loading - Whether to show a loading indicator.
     * @param {function} callback - Custom callback function.
     */
    function debouncedAjaxDynamic(
        methodType,
        controller,
        method,
        data,
        target,
        targetId,
        loading,
        callback,
    ) {
        const key = `${controller}::${method}`;

        if (debounceMap.has(key)) {
            clearTimeout(debounceMap.get(key));
        }

        const timer = setTimeout(() => {
            ajaxDynamic(
                methodType,
                controller,
                method,
                data,
                target,
                targetId,
                loading,
                callback,
            );
            debounceMap.delete(key);
        }, 400);

        debounceMap.set(key, timer);
    }

    /**
     * Converts a camelCase string to kebab-case.
     * @param {string} str - The input string.
     * @returns {string} The kebab-case string.
     */
    function camelToKebab(str) {
        return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    }

    /**
     * Converts a camelCase string to snake_case.
     * @param {string} str - The input string.
     * @returns {string} The snake_case string.
     */
    function camelToSnake(str) {
        return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    }

    /**
     * Sanitizes an HTML input name attribute to a valid JavaScript variable name.
     * @param {string} name - The input name attribute.
     * @returns {string} The sanitized JavaScript variable name.
     */
    function sanitizeInputNameToJSVariable(name) {
        return name.replace(/\]\[|\[|\]/g, "_").replace(/_+$/, "");
    }

    /**
     * Automatically binds response data to DOM elements based on their ID or class name.
     * Supports camelCase, kebab-case, and snake_case matching.
     * @param {object} data - The data object from the AJAX response.
     */
    function autoBindDomFromResponse(data) {
        if (!data || typeof data !== "object") return;

        Object.entries(data).forEach(([key, value]) => {
            const selectors = [
                `#${key}`,
                `.${key}`,
                `#${camelToKebab(key)}`,
                `.${camelToKebab(key)}`,
                `#${camelToSnake(key)}`,
                `.${camelToSnake(key)}`,
            ];

            for (const selector of selectors) {
                const els = qsa(selector);
                if (!els.length) continue;

                const isFormField = els.some((el) =>
                    isEl(el, "input, textarea, select"),
                );

                if (isFormField) {
                    if (els[0].value !== String(value)) {
                        els.forEach((el) => {
                            el.value = value;
                            el.dispatchEvent(
                                new Event("input", { bubbles: true }),
                            );
                            el.dispatchEvent(
                                new Event("change", { bubbles: true }),
                            );
                        });
                    }
                } else {
                    els.forEach((el) => {
                        el.innerHTML = value;
                    });
                }
            }
        });
    }

    /**
     * Resolves the HTTP method type based on the element and event.
     * @param {Element} el - The triggering element.
     * @param {string} eventType - The event type (e.g., 'submit').
     * @param {Element} formEl - The closest form element.
     * @returns {string} The resolved HTTP method.
     */
    function resolveMethodType(el, eventType, formEl) {
        let methodType = "POST";
        if (eventType === "submit" && formEl) {
            methodType = (formEl.getAttribute("method") || "POST").toUpperCase();
        }
        if (el.getAttribute("live-method")) {
            methodType = el.getAttribute("live-method").toUpperCase();
        }
        return methodType;
    }

    function extractData(el, formEl, selector = null) {
        const formData = new FormData();
        const appended = new Set();

        const appendSafe = (inputEl) => {
            if (!inputEl.name || appended.has(inputEl)) return;
            appendInputToFormData(formData, inputEl);
            appended.add(inputEl);
        };

        let roots;

        // SKENARIO A: Jika ada selector spesifik (misal: live-click="updateDimension('#tr-1')")
        // Catatan: selector class (mis. ".row") bisa cocok ke LEBIH DARI SATU elemen
        // sekaligus — persis seperti jQuery $(selector) yang mengembalikan koleksi,
        // jadi di sini pakai querySelectorAll (bukan querySelector) supaya semua
        // root ikut diproses, bukan cuma yang pertama ditemukan.
        if (
            selector &&
            typeof selector === "string" &&
            (selector.startsWith("#") || selector.startsWith("."))
        ) {
            roots = qsa(selector);
        }
        // SKENARIO B: Tanpa parameter, ambil scope terdekat (Konsep Lama)
        else {
            const scopeEl = closestAncestor(el, "[live-scope]");
            roots = scopeEl ? [scopeEl] : [];
        }

        if (!roots.length) return formData;

        // AMBIL DATA HANYA DARI ROOT YANG TERPILIH
        // querySelectorAll mencari input di dalam elemen tersebut; kalau root
        // itu sendiri adalah input, ikut dimasukkan juga (setara .addBack()).
        const inputSelector = "input[name], select[name], textarea[name]";
        roots.forEach((root) => {
            const inputs = qsa(inputSelector, root);
            if (isEl(root, inputSelector)) inputs.unshift(root);
            inputs.forEach(appendSafe);
        });

        return formData;
    }

    function appendInputToFormData(fd, el) {
        const name = el.getAttribute("name");
        if (!name) return;

        if (el.type === "file") {
            const files = el.files;
            for (let i = 0; i < files.length; i++) {
                fd.append(name, files[i]);
            }
        } else if (el.type === "checkbox") {
            if (el.checked) {
                fd.append(name, el.value);
            }
        } else if (el.type === "radio") {
            if (el.checked) {
                fd.append(name, el.value);
            }
        } else {
            fd.append(name, el.value);
        }
    }

    /**
     * Live conditionals: show, class, style, attr
     */
    function evaluateExpr(expr, el) {
        const scope = closestAncestor(el, "[live-scope]");
        const inputs = {};

        if (scope) {
            qsa("input[name], select[name], textarea[name]", scope).forEach(
                (inputEl) => {
                    const name = inputEl.getAttribute("name");
                    if (!name) return;
                    let val;
                    if (inputEl.type === "checkbox") {
                        val = inputEl.checked ? inputEl.value : null;
                    } else if (inputEl.type === "radio") {
                        if (inputEl.checked) val = inputEl.value;
                    } else {
                        val = inputEl.value;
                    }

                    const safeName = name
                        .replace(/\]\[|\[|\]/g, "_")
                        .replace(/_+$/, "");
                    const numVal = parseFloat(
                        String(val).replace(/[^\d.-]/g, ""),
                    );
                    inputs[safeName] = isNaN(numVal) ? val : numVal;
                },
            );
        }

        // biar ekspresi kayak dpp_[1] tetap bisa dipakai
        expr = expr.replace(/\[\s*(\w+)\s*\]/g, "_$1");

        try {
            return Function("ctx", `with(ctx){ return (${expr}) }`)(inputs);
        } catch (e) {
            console.warn("Eval error:", expr, e);
            return null;
        }
    }

    // util debounce biar gak spam CPU
    function debounce(fn, delay) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // cache parsing live-attr biar sekali aja
    const liveAttrCache = new WeakMap();

    function parseLiveAttr(el) {
        if (liveAttrCache.has(el)) {
            return liveAttrCache.get(el);
        }
        const expr = el.getAttribute("live-attr");
        if (!expr) return [];
        const parsed = expr.split(",").map((pair) => {
            const [attr, js] = pair.split(":");
            return { attr: attr.trim(), js: js.trim() };
        });
        liveAttrCache.set(el, parsed);
        return parsed;
    }

    function handleLiveDirectives(scope) {
        const root = scope || document;

        qsa("[live-show]", root).forEach((el) => {
            const expr = el.getAttribute("live-show");
            const result = evaluateExpr(expr, el);
            toggleEl(el, !!result);
        });

        qsa("[live-class]", root).forEach((el) => {
            const expr = el.getAttribute("live-class");
            const result = evaluateExpr(expr, el);
            if (typeof result === "string") {
                el.setAttribute(
                    "class",
                    (el.getAttribute("class-base") || "") + " " + result,
                );
            }
        });

        qsa("[live-style]", root).forEach((el) => {
            const expr = el.getAttribute("live-style");
            const result = evaluateExpr(expr, el);
            if (typeof result === "string") {
                el.setAttribute("style", result);
            }
        });

        qsa("[live-attr]", root).forEach((el) => {
            const parsed = parseLiveAttr(el);
            parsed.forEach(({ attr, js }) => {
                const result = evaluateExpr(js, el);
                if (result === false || result == null) {
                    el.removeAttribute(attr);
                } else {
                    el.setAttribute(attr, result === true ? attr : result);
                }
            });
        });
    }

    /**
     * Extracts content from an element (e.g., its value for inputs, or HTML content).
     * @param {Element} el - The element.
     * @returns {string} The extracted content.
     */
    function extractElementContent(el) {
        if (isEl(el, "input, textarea, select")) {
            return el.value;
        }
        return el.innerHTML;
    }

    /**
     * Resolves target elements based on a selector string, supporting various
     * traversal methods (setara jQuery .closest()/.find()/.parent()/dst).
     * @param {Element} el - The reference element.
     * @param {string} targetSelector - The selector string (e.g., 'closest(.parent-class)', '#my-id', 'self').
     * @returns {Element[]} Array elemen target yang cocok.
     */
    function liveTarget(el, targetSelector) {
        const targets = [];
        const selectors = targetSelector.split(",").map((s) => s.trim());

        for (let sel of selectors) {
            let found = [];

            const match = sel.match(/^(\w+)(\(([^)]+)\))?$/);
            if (match) {
                const method = match[1];
                const param = match[3] ? match[3].trim() : null;

                switch (method) {
                    case "closest": {
                        if (param) {
                            const t = closestAncestor(el, param);
                            if (t) found = [t];
                        }
                        break;
                    }
                    case "find":
                        if (param) found = qsa(param, el);
                        break;
                    case "parent":
                        if (el.parentElement) found = [el.parentElement];
                        break;
                    case "children":
                        found = Array.from(el.children).filter(
                            (c) => !param || c.matches(param),
                        );
                        break;
                    case "next": {
                        const n = el.nextElementSibling;
                        if (n && (!param || n.matches(param))) found = [n];
                        break;
                    }
                    case "prev": {
                        const p = el.previousElementSibling;
                        if (p && (!param || p.matches(param))) found = [p];
                        break;
                    }
                    case "siblings":
                        if (el.parentElement) {
                            found = Array.from(el.parentElement.children).filter(
                                (c) => c !== el && (!param || c.matches(param)),
                            );
                        }
                        break;
                    case "self":
                        found = [el];
                        break;
                    default:
                        found = qsa(sel);
                        break;
                }
            } else {
                found = qsa(sel);
            }

            if (found.length) {
                targets.push(...found);
            }
        }
        return targets;
    }

    /**
     * Handles live events (click, hover, change, etc.) by triggering AJAX calls or local DOM updates.
     * @param {Element} el - The triggering element.
     * @param {string} eventType - The type of event (e.g., 'click', 'change').
     */
    function handleLiveEvent(el, eventType) {
        const rawMethods = el.getAttribute(`live-${eventType}`);
        const rawTargets = el.getAttribute("live-target") || "";
        const domAction = el.getAttribute("live-dom") || "auto";
        const formEl = closestAncestor(el, "form");
        const scopeEl = closestAncestor(el, "[live-scope]");
        const controller = scopeEl ? scopeEl.getAttribute("live-scope") : null;
        if (!controller && rawMethods) {
            console.warn(
                `[Live Event] Element with live-${eventType} needs a live-scope attribute on an ancestor.`,
                el,
            );
            return;
        }

        // FIX (live-loading): dulu hanya menerima literal "true" dan mengabaikan
        // nilai lain sepenuhnya (mis. live-loading="#loading-button" dibaca sama
        // seperti tidak ada atribut sama sekali — selector-nya tidak pernah
        // dipakai). Sekarang nilai atribut DIPAKAI sebagai selector target:
        //   live-loading="#id"   -> tampilkan/sembunyikan elemen #id
        //   live-loading="true"  -> tetap didukung, fallback ke overlay global ".loading"
        //   tidak ada / "false"  -> tidak ada indikator loading
        const loadingAttr = el.getAttribute("live-loading");
        const resolvedLoading =
            !loadingAttr || loadingAttr === "false"
                ? null
                : loadingAttr === "true"
                    ? ".loading"
                    : loadingAttr;

        // FIX (live-loading-indicator): dulu SELALU di-`.show()` di execute()
        // di bawah, tanpa pasangan `.hide()` di mana pun di seluruh file —
        // begitu tampil, elemen ini nyangkut selamanya. Sekarang digabung ke
        // lifecycle show/hide yang sama dengan live-loading (lihat
        // showLoading()/hideLoading() + `.finally()` callback di ajaxDynamic()).
        // Mendukung dua bentuk pemakaian:
        //   live-loading-indicator="#selector" -> tampilkan elemen #selector
        //   live-loading-indicator (tanpa nilai) -> tampilkan elemen ini (el) sendiri
        const hasLoadingIndicatorAttr = el.hasAttribute("live-loading-indicator");
        const loadingIndicatorAttr = el.getAttribute("live-loading-indicator");
        const loadingIndicatorTarget = hasLoadingIndicatorAttr
            ? loadingIndicatorAttr || el
            : null;

        const loadingList = [resolvedLoading, loadingIndicatorTarget].filter(
            Boolean,
        );
        const loading = loadingList.length ? loadingList : null;
        const dataArgs = el.getAttribute("live-data");

        const beforeCallback = el.getAttribute("live-callback-before");
        const execute = () => {
            const methodType = resolveMethodType(el, eventType, formEl);

            // Jangan jalankan extractData di sini!
            // Kita pindahkan ke dalam loop agar lebih spesifik.

            if (!rawMethods) {
                return runLocalUpdate(el, domAction, rawTargets);
            }

            // const methods = rawMethods.split(',').map(m => m.trim()).filter(Boolean);
            const methods = [];
            let depth = 0,
                current = "";
            for (const c of rawMethods) {
                if (c === "(" || c === "{" || c === "[") depth++;
                if (c === ")" || c === "}" || c === "]") depth--;
                if (c === "," && depth === 0) {
                    methods.push(current.trim());
                    current = "";
                } else {
                    current += c;
                }
            }
            if (current.trim()) methods.push(current.trim());
            const parsedMethods = methods.map((m) => {
                const match = m.match(/^(\w+)(\((.*)\))?$/);
                if (!match)
                    return {
                        method: m,
                        args: null,
                    };

                const [, name, , argsStr] = match;
                if (!argsStr)
                    return {
                        method: name,
                        args: null,
                    };

                try {
                    let argsRaw = [];

                    try {
                        const safeArgStr = argsStr.replace(/\bthis\b/g, "__el");
                        // deteksi jika argumen berbentuk objek literal, bungkus dengan tanda kurung
                        let fixedArgStr = safeArgStr.trim();
                        if (/^{[\s\S]*}$/.test(fixedArgStr)) {
                            fixedArgStr = `(${fixedArgStr})`;
                        }
                        argsRaw = Function(
                            "__el",
                            `return [${fixedArgStr}]`,
                        )(el);

                        // Jika hanya ada satu argumen dan itu array string (nested), coba parse manual
                        if (
                            argsRaw.length === 1 &&
                            typeof argsRaw[0] === "string" &&
                            argsRaw[0].startsWith("[") &&
                            argsRaw[0].endsWith("]")
                        ) {
                            try {
                                const parsed = JSON.parse(
                                    argsRaw[0].replace(/'/g, '"'),
                                ); // convert ' to " dulu
                                if (Array.isArray(parsed)) {
                                    argsRaw = [parsed]; // ganti isinya jadi array asli
                                }
                            } catch (e) {
                                console.warn(
                                    "Failed to parse stringified array literal:",
                                    argsRaw[0],
                                );
                            }
                        }
                    } catch (e) {
                        console.warn(
                            `[Live Event] Error parsing arguments: ${argsStr}`,
                            e.message,
                        );
                    }

                    // Sanitize nilai untuk serialisasi aman
                    const argsSanitized = argsRaw.map((arg) => {
                        if (arg instanceof Element) {
                            return isEl(arg, "input, select, textarea")
                                ? arg.value
                                : arg.textContent.trim();
                        }

                        // Hindari window atau objek global
                        if (typeof arg === "object" && arg === window) {
                            return null;
                        }

                        return arg;
                    });

                    return {
                        method: name,
                        args: argsSanitized,
                    };
                } catch (e) {
                    console.warn(
                        `[Live Event] Error parsing arguments for method "${name}":`,
                        e.message,
                    );
                    return {
                        method: name,
                        args: null,
                    };
                }
            });

            // ... kode parsing methods di atas ...

            const targets = rawTargets.split(",").map((t) => t.trim());
            const targetFor = (i) =>
                targets.length === 1 ? targets[0] : targets[i] || "";

            parsedMethods.forEach(({ method, args }, i) => {
                const targetSel = targetFor(i);
                const targetEls = targetSel ? liveTarget(el, targetSel) : [el];

                let postData;

                // Ambil argumen pertama jika ada
                const firstArg = args && args.length > 0 ? args[0] : null;

                // Deteksi selector: harus string dan dimulai dengan # atau .
                const isSelector =
                    typeof firstArg === "string" &&
                    (firstArg.startsWith("#") || firstArg.startsWith("."));

                if (dataArgs) {
                    postData = { data: dataArgs };
                } else if (isSelector) {
                    // PAKSA hanya ambil dari selector, jangan kirim formEl agar tidak bocor
                    postData = extractData(el, null, firstArg);
                } else if (args && args.length > 0) {
                    const dataPayload = args.length === 1 ? args[0] : args;
                    postData = { data: dataPayload };
                } else {
                    // Ambil semua (default)
                    postData = extractData(el, formEl);
                }

                runAjaxRequest(
                    methodType,
                    controller,
                    method,
                    postData,
                    domAction,
                    targetEls,
                    loading,
                    el,
                );
            });
        };

        if (beforeCallback) {
            try {
                let result;
                if (beforeCallback.includes("(")) {
                    // Kalau ada () => evaluasi sebagai function expression dengan __el sebagai elemen
                    const safeCallback = beforeCallback.replace(
                        /\bthis\b/g,
                        "__el",
                    );
                    result = Function(
                        "__el",
                        `
            try {
              return (${safeCallback});
            } catch (e) {
              console.warn('[LiveDomJs] Error evaluating beforeCallback:', e);
              return undefined;
            }
          `,
                    )(el);
                } else {
                    // Kalau hanya nama fungsi, panggil window[fnName](el)
                    const fn = window[beforeCallback.trim()];
                    if (typeof fn === "function") {
                        result = fn(el);
                    } else {
                        console.warn(
                            `[LiveDomJs] live-callback-before function "${beforeCallback}" not found.`,
                        );
                        result = undefined;
                    }
                }

                if (result && typeof result.then === "function") {
                    result
                        .then((ok) => {
                            if (ok === true) execute();
                        })
                        .catch((err) => {
                            console.warn("Before callback rejected:", err);
                        });
                } else if (result === true) {
                    execute();
                }
            } catch (e) {
                console.warn(
                    "[LiveDomJs] live-callback-before error:",
                    beforeCallback,
                    e,
                );
                return;
            }
        } else {
            execute();
        }
    }

    /**
     * Executes an AJAX request triggered by a live event.
     * @param {string} methodType - HTTP method.
     * @param {string} controller - Controller name.
     * @param {string} method - Method name.
     * @param {object|FormData} data - Data to send.
     * @param {string} domAction - How to apply the response to the DOM.
     * @param {Element[]} targetEls - Array elemen target.
     * @param {boolean} loading - Whether to show loading.
     * @param {Element} el - The original triggering element.
     */
    function runAjaxRequest(
        methodType,
        controller,
        method,
        data,
        domAction,
        targetEls,
        loading,
        el = null,
    ) {
        const callback = function (response) {
            let responseData =
                response && typeof response === "object" && "data" in response
                    ? response.data
                    : response;

            if (typeof responseData === "object") {
                autoBindDomFromResponse(responseData);
            }

            if (typeof responseData === "string") {
                toElements(targetEls).forEach((t) => {
                    applyDomAction(t, domAction, responseData);
                });
            }

            if (el && el.getAttribute) {
                const afterCallback = el.getAttribute("live-callback-after");
                if (
                    afterCallback &&
                    typeof window[afterCallback] === "function"
                ) {
                    window[afterCallback](el, response);
                }
            }

            document.dispatchEvent(new CustomEvent("live-dom:afterUpdate"));
        };
        debouncedAjaxDynamic(
            methodType,
            controller,
            method,
            data,
            "",
            "",
            loading,
            callback,
        );
    }

    /**
     * Performs a local DOM update without an AJAX request.
     * @param {Element} el - The triggering element.
     * @param {string} domAction - How to apply the content to the DOM.
     * @param {string} rawTargets - Raw target selector string.
     */
    function runLocalUpdate(el, domAction, rawTargets) {
        const targetSel = rawTargets || "";
        const targetEls = targetSel ? liveTarget(el, targetSel) : [el];
        if (domAction === "remove") {
            targetEls.forEach((t) => t.remove());
            // initLiveDom();
            return;
        }

        const content = extractElementContent(el);
        targetEls.forEach((t) => {
            applyDomAction(t, domAction, content);
        });
    }

    /**
     * Applies content to a target element using a specified DOM action.
     * @param {Element|Element[]} targets - The target element(s).
     * @param {string} actions - The DOM action (e.g., 'html', 'append', 'value').
     * @param {string} contents - The content to apply.
     */
    function applyDomAction(targets, actions, contents) {
        const targetEls = toElements(targets);

        // Split actions dan contents jika berupa string multiple
        const actionList =
            typeof actions === "string" ? actions.split(",") : [actions];
        const contentList =
            typeof contents === "object" && !Array.isArray(contents)
                ? [contents]
                : Array.isArray(contents)
                    ? contents
                    : [contents];

        targetEls.forEach((currentTarget) => {
            actionList.forEach((action, actionIndex) => {
                const content =
                    contentList[actionIndex] || contentList[0] || "";
                const trimmedAction = action.trim();

                switch (trimmedAction) {
                    case "append":
                        currentTarget.insertAdjacentHTML("beforeend", content);
                        break;
                    case "prepend":
                        currentTarget.insertAdjacentHTML("afterbegin", content);
                        break;
                    case "before":
                        currentTarget.insertAdjacentHTML("beforebegin", content);
                        break;
                    case "after":
                        currentTarget.insertAdjacentHTML("afterend", content);
                        break;
                    case "value":
                    case "val":
                        currentTarget.value = content;
                        currentTarget.dispatchEvent(new Event("change", { bubbles: true }));
                        currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
                        currentTarget.dispatchEvent(new Event("change", { bubbles: true }));
                        break;
                    case "text":
                        currentTarget.textContent = content;
                        break;
                    case "html":
                        currentTarget.innerHTML = content;
                        break;
                    case "toggle":
                        toggleEl(currentTarget, !!content);
                        break;
                    case "show":
                        showEl(currentTarget);
                        break;
                    case "hide":
                        hideEl(currentTarget);
                        break;
                    case "remove":
                        currentTarget.remove();
                        break;
                    default:
                        if (
                            !actions ||
                            actions.trim() === "" ||
                            actions.trim() === "auto"
                        ) {
                            if (isEl(currentTarget, "input, textarea, select")) {
                                currentTarget.value = content;
                                currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
                                currentTarget.dispatchEvent(new Event("change", { bubbles: true }));
                            } else {
                                currentTarget.innerHTML = content;
                            }
                            break;
                        }

                        // fallback: anggap text/html
                        if (isEl(currentTarget, "input, textarea, select")) {
                            currentTarget.value = content;
                            currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
                            currentTarget.dispatchEvent(new Event("change", { bubbles: true }));
                        } else {
                            currentTarget.innerHTML = content;
                        }
                        break;
                }
            });
        });
    }

    /*==============================
      POLLERS
    ==============================*/

    /**
     * Initializes polling for elements with 'live-poll' attribute.
     */
    const pollIntervalStore = new WeakMap();

    function handlePollers() {
        qsa("[live-poll]").forEach((el) => {
            const interval = parseInt(el.getAttribute("live-poll"), 10);
            const controller = el.getAttribute("live-scope");
            const method = el.getAttribute("live-click") || "poll";
            const target = "#" + el.getAttribute("id");

            // Clear existing interval to prevent duplicates on re-init
            if (pollIntervalStore.has(el)) {
                clearInterval(pollIntervalStore.get(el));
            }

            const pollInterval = setInterval(() => {
                ajaxDynamic("GET", controller, method, {}, "html", target);
            }, interval);

            pollIntervalStore.set(el, pollInterval); // Store interval ID
        });
    }

    /*==============================
      LIVE COMPUTE — FORMAT REGISTRY
      (shared across every handleLiveComputeUnified() instance)
    ==============================*/
    const LIVE_COMPUTE_FORMAT_REGISTRY = {
        idr: { kind: "currency", locale: "id-ID", thousandSep: ".", decimalSep: ",", defaultDecimals: 0 },
        usd: { kind: "currency", locale: "en-US", thousandSep: ",", decimalSep: ".", defaultDecimals: 2 },
        jpy: { kind: "currency", locale: "ja-JP", thousandSep: ",", decimalSep: ".", defaultDecimals: 0 },
        eur: { kind: "currency", locale: "de-DE", thousandSep: ".", decimalSep: ",", defaultDecimals: 2 },
        percent: { kind: "percent", thousandSep: ",", decimalSep: ".", defaultDecimals: 1 },
        plain: { kind: "plain", locale: "en-US", thousandSep: ",", decimalSep: ".", defaultDecimals: 0 },
    };

    function getLiveComputeFormat(key) {
        if (!key) return null;
        return LIVE_COMPUTE_FORMAT_REGISTRY[String(key).toLowerCase()] || null;
    }

    // every mounted handleLiveComputeUnified() scope registers itself here so
    // LiveDom.setCurrency()/unpin() can reach all of them, not just the last one.
    const liveComputeInstances = [];

    window.LiveDom = window.LiveDom || {};

    // Global default currency. Elements only follow this when they explicitly
    // opt in with live-compute-format="auto" — everything else is untouched.
    window.LiveDom.config = window.LiveDom.config || { currency: "idr" };

    /**
     * Register a custom currency/format (e.g. "gbp", "cny") without touching
     * this file. Existing keys can be overridden the same way.
     */
    window.LiveDom.registerFormat = function (key, cfg) {
        if (!key || !cfg) return;
        LIVE_COMPUTE_FORMAT_REGISTRY[String(key).toLowerCase()] = cfg;
    };

    /**
     * Instantly switch the active global currency. Only elements with
     * live-compute-format="auto" react; pinned elements (idr/usd/... written
     * literally) and non-currency kinds (percent/plain) are never touched.
     * This never converts values — 1 juta stays 1 juta, only the notation
     * (grouping/decimal separators, decimals) changes.
     */
    window.LiveDom.setCurrency = function (code) {
        const cfg = getLiveComputeFormat(code);
        if (!cfg || cfg.kind !== "currency") {
            console.warn(`[LiveDom] "${code}" is not a registered currency format. setCurrency() ignored.`);
            return;
        }

        const previous = window.LiveDom.config.currency;
        if (previous === code) return;

        window.LiveDom.config.currency = code;
        liveComputeInstances.forEach((instance) => instance.refresh());

        document.dispatchEvent(
            new CustomEvent("livedom:currencychange", {
                detail: { from: previous, to: code },
            }),
        );
    };

    /**
     * Remove a pinned format from an element, letting it fall back to
     * whatever live-compute-format="auto" elements are currently using.
     */
    window.LiveDom.unpin = function (element) {
        if (!element) return;
        element.removeAttribute("live-compute-format");
        liveComputeInstances.forEach((instance) => instance.refresh());
    };

    /*==============================
      LIVE COMPUTE
    ==============================*/

    function handleLiveComputeUnified(scope) {
        const rootScope = scope || document;

        // 🔥 OPTIMIZED FOR 1000++ INPUTS
        const TIME_BUDGET_MS = 16;
        const INPUT_DEBOUNCE = 200;
        // ✅ Jendela proteksi untuk field bidirectional (lihat displayResult()):
        // cukup untuk menutupi INPUT_DEBOUNCE + beberapa pass konvergensi normal,
        // tapi tidak permanen — lihat komentar di displayResult().
        const OWNERSHIP_WINDOW_MS = INPUT_DEBOUNCE + 400;
        // ✅ FIX: dulu di-hardcode `false` sehingga warning/error live-compute
        // TIDAK PERNAH muncul di console, bahkan saat app.debug=true. Sekarang
        // ikut flag global IS_DEBUG (meta[name="app-debug"]) yang sama dipakai
        // di seluruh file, supaya formula yang gagal di-parse kelihatan lagi.
        const DEBUG_MODE = IS_DEBUG;
        const MAX_ITERATIONS = 10; // Increased from 5 to 10 for better convergence
        const BATCH_SIZE = 50;
        const PRECISION_TOLERANCE = 0.0001;
        // (STABILITY_THRESHOLD dihapus — dulu dideklarasikan "0.1% dianggap
        // stabil" tapi tidak pernah benar-benar dipakai di isValueConverged();
        // toleransi konvergensi yang aktif adalah tingkatan absolut di bawah.)

        // --- STATE MANAGEMENT ---
        const elementData = new WeakMap();
        let cachedComputeElements = [];
        let cachedInputElements = [];
        let inputValueCache = new Map();
        let rowIndicesCache = null;
        let isCacheDirty = true;
        let processingPromise = null;
        let debounceTimer;
        let isInternalUpdate = false;
        let aggregateFunctionCache = new Map();

        // --- HELPER DATA ---
        function getData(el, key) {
            return (elementData.get(el) || {})[key];
        }
        function setData(el, key, val) {
            const d = elementData.get(el) || {};
            d[key] = val;
            elementData.set(el, d);
        }

        // --- DOM HELPER ---
        const attr = (el, a) => el.getAttribute(a);
        const val = (el, v) =>
            v !== undefined ? (el.value = v) : el.value || "";

        function sanitizeName(name) {
            if (!name) return "";
            return name
                .replace(/\[/g, "")
                .replace(/\]/g, "")
                .replace(/_+/g, "_")
                .replace(/_$/g, "");
        }

        // --- FORMAT RESOLUTION ---
        // Two different questions, resolved separately on purpose:
        //   1) "how should I READ the numbers inside this formula?"   -> parsing format
        //   2) "should I even FORMAT my own output, and how?"          -> display format
        // (1) always resolves to *some* convention (falls back to the active
        // global currency) because a decimal/thousand separator convention is
        // needed to read numbers correctly regardless of display intent.
        // (2) is strictly opt-in: no live-compute-format attribute = never
        // formatted, on purpose — this is what keeps percent/plain/id fields
        // safe from ever being mangled into currency notation.
        function resolveParsingFormat(element) {
            const raw = attr(element, "live-compute-format");
            if (raw === "auto") return window.LiveDom.config.currency;
            if (raw && getLiveComputeFormat(raw)) return raw;
            return window.LiveDom.config.currency;
        }

        function resolveDisplayFormat(element) {
            const raw = attr(element, "live-compute-format");
            if (raw === null || raw === "") return null; // opt-out: never formatted
            if (raw === "auto") return window.LiveDom.config.currency;
            return raw; // pinned literal key (idr/usd/percent/plain/...), may be unknown -> formatResult degrades safely
        }

        // --- 1. GENERIC NUMBER PARSER (config-driven, no whole-string guessing) ---
        function toNumber(rawVal, formatKey) {
            if (rawVal === null || rawVal === undefined || rawVal === "") return 0;

            let strVal = String(rawVal).trim();
            if (strVal === "" || strVal === "-") return 0;

            const isPercentageLiteral = strVal.includes("%");
            strVal = strVal.replace(/%/g, "");

            const isNegative = /^-/.test(strVal);
            strVal = strVal.replace(/^-/, "");

            // strip anything that isn't a digit or a separator (currency symbols, spaces, etc.)
            strVal = strVal.replace(/[^\d.,]/g, "");
            if (strVal === "") return 0;

            const cfg =
                getLiveComputeFormat(formatKey) ||
                getLiveComputeFormat(window.LiveDom.config.currency) ||
                getLiveComputeFormat("idr");

            const escapeRe = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            let cleaned = strVal;

            // thousand separator is never meaningful for the value itself — drop it entirely
            if (cfg.thousandSep) {
                cleaned = cleaned.split(new RegExp(escapeRe(cfg.thousandSep), "g")).join("");
            }
            // normalize whatever this format's decimal separator is to a plain "."
            if (cfg.decimalSep && cfg.decimalSep !== ".") {
                cleaned = cleaned.replace(new RegExp(escapeRe(cfg.decimalSep)), ".");
            }
            // anything left over that isn't a digit or the standardized "." is noise
            cleaned = cleaned.replace(/[^\d.]/g, "");

            let result = parseFloat(cleaned);
            if (isNaN(result)) result = 0;
            if (isNegative) result = -result;
            // ✅ FIX: dulu SEMUA format (idr/usd/plain/...) yang kebetulan
            // mengandung karakter "%" akan dibagi 100, bukan cuma format
            // "percent". Sekarang hanya format berjenis "percent" yang
            // diperlakukan begitu, supaya angka currency/plain yang tidak
            // sengaja mengandung "%" tidak ikut rusak.
            if (isPercentageLiteral && cfg.kind === "percent") result = result / 100;

            // parseFloat with fixed precision to avoid floating point artifacts
            return parseFloat(result.toFixed(10));
        }

        // --- 2. NUMBER NORMALIZATION (from version 2) ---
        function normalizeNumber(num, precision = 0) {
            if (num === null || num === undefined || isNaN(num)) return 0;
            if (!isFinite(num)) return 0;
            if (isNaN(precision)) precision = 0;

            const magnitude = Math.floor(Math.log10(Math.abs(num || 1)));
            if (magnitude >= 15) return Math.round(num);

            const safePrecision = Math.max(6, magnitude + 6);
            const rounded = parseFloat(num.toPrecision(safePrecision));

            // Rounding logic
            const multiplier = Math.pow(10, precision);
            const final = Math.round(rounded * multiplier) / multiplier;

            return isFinite(final) ? final : 0;
        }

        // --- 3. VALUE CONVERGENCE CHECK (from version 2) ---
        function isValueConverged(oldValue, newValue, formatKey) {
            if (oldValue == null && newValue == null) return true;
            if (oldValue == null || newValue == null) return false;
            if (oldValue === newValue) return true;

            const oldNum = toNumber(oldValue, formatKey);
            const newNum = toNumber(newValue, formatKey);

            if (isNaN(oldNum) || isNaN(newNum)) {
                return String(oldValue).trim() === String(newValue).trim();
            }

            const absoluteDiff = Math.abs(newNum - oldNum);

            // Tolerance for large numbers (> 1,000,000)
            if (Math.abs(oldNum) > 1000000 || Math.abs(newNum) > 1000000) {
                return absoluteDiff < 1.5;
            }

            // Tolerance for medium numbers (1,000 - 1,000,000)
            if (Math.abs(oldNum) > 1000 || Math.abs(newNum) > 1000) {
                return absoluteDiff < 0.01;
            }

            // Tolerance for small numbers
            return absoluteDiff < PRECISION_TOLERANCE;
        }

        // --- SAFE MATH OPERATIONS ---
        function safeAdd(a, b) {
            const numA = toNumber(a);
            const numB = toNumber(b);
            const result = numA + numB;
            return isFinite(result) ? result : 0;
        }

        function safeDivide(a, b) {
            const numA = toNumber(a);
            const numB = toNumber(b);
            if (numB === 0) {
                if (DEBUG_MODE) console.warn("[SafeDivide] Division by zero");
                return 0;
            }
            const result = numA / numB;
            return isFinite(result) ? result : 0;
        }

        // --- 4a. SHARED: nilai cache untuk satu input, konsisten dipakai oleh
        // rebuildDomCache() (build awal) MAUPUN oleh proses re-cache di setiap
        // iterasi konvergensi (process()). Sebelumnya kedua tempat itu punya
        // logic terpisah yang gampang divergen: iterasi ke-2+ dulu langsung
        // baca `el.value` mentah walau elemennya masked-input, sehingga string
        // tampilan (mis. "1.234.567") ikut dianggap "nilai" tanpa dikonversi
        // balik ke angka canonical — kalau format input beda dari format
        // parsing formula yang membacanya, hasilnya bisa salah total.
        function computeInputCacheValue(el) {
            const isCheckbox = el.type === "checkbox";
            if (isCheckbox) {
                return el.checked ? el.value : 0;
            }
            if (isMaskableInput(el)) {
                if (getData(el, "canonical") === undefined) {
                    primeMaskedInputFromDom(el, resolveParsingFormat(el));
                    renderMaskedInput(el, resolveDisplayFormat(el));
                }
                return getData(el, "canonical");
            }
            return el.value;
        }

        // --- 4a-bis. FIX: "unlock" untuk elemen [live-compute][live-compute-init="false"].
        // Sebelumnya, satu-satunya kode yang menghapus attribute ini menyasar
        // `e.target` di event input/change — yaitu elemen <input> yang lagi
        // diketik user. Untuk elemen OUTPUT read-only (<span>/<div>, yang justru
        // pemakaian paling umum dari live-compute-init="false"), attribute-nya
        // tidak pernah ada yang menghapus, sehingga rebuildDomCache() TERUS
        // membuang elemen itu dari cache selamanya — formula-nya tidak pernah
        // dihitung sama sekali, walau user sudah mengedit semua input terkait.
        // Fungsi ini dipanggil sekali di awal setiap interaksi manual (input/
        // change): buka kunci SEMUA elemen live-compute-init="false" yang masih
        // terkunci dalam rootScope ini. Dijaga dengan flag `hasLockedInitOutputs`
        // supaya setelah semuanya terbuka, tidak ada lagi querySelectorAll yang
        // sia-sia di setiap keystroke.
        let hasLockedInitOutputs = null; // null = belum pernah dicek
        function unlockLiveComputeInitOutputs() {
            if (hasLockedInitOutputs === false) return; // fast path

            const locked = rootScope.querySelectorAll(
                '[live-compute][live-compute-init="false"]',
            );

            if (locked.length === 0) {
                hasLockedInitOutputs = false;
                return;
            }

            locked.forEach((el) => el.removeAttribute("live-compute-init"));
            hasLockedInitOutputs = false;
            isCacheDirty = true; // elemen yang baru dibuka harus ikut masuk cache lagi
        }

        // --- 4. OPTIMIZED CACHE BUILDER ---
        function rebuildDomCache() {
            if (!isCacheDirty) return;

            const startTime = performance.now();

            const rawElements = Array.from(
                rootScope.querySelectorAll("[live-compute]"),
            );
            cachedComputeElements = rawElements.filter((el) => {
                if (!el.isConnected) return false;

                const initAttr = attr(el, "live-compute-init");
                if (initAttr === "false") return false;

                return true;
            });

            cachedComputeElements.sort((a, b) => {
                return a.compareDocumentPosition(b) &
                    Node.DOCUMENT_POSITION_FOLLOWING
                    ? 1
                    : -1;
            });

            cachedInputElements = Array.from(
                rootScope.querySelectorAll(
                    "input[name], select[name], textarea[name]",
                ),
            );
            inputValueCache.clear();
            rowIndicesCache = new Set();

            const regex = /\[(\d+)\]$/;
            const regexAlt = /_(\d+)$/;

            for (let i = 0; i < cachedInputElements.length; i++) {
                const el = cachedInputElements[i];
                const name = el.name;
                if (name) {
                    const sanitized = sanitizeName(name);
                    const cacheValue = computeInputCacheValue(el);

                    inputValueCache.set(sanitized, cacheValue);

                    let match = name.match(regex) || name.match(regexAlt);
                    if (match) rowIndicesCache.add(parseInt(match[1], 10));
                }
            }

            isCacheDirty = false;

            if (DEBUG_MODE) {
                console.log(
                    `[Cache] Rebuilt in ${(performance.now() - startTime).toFixed(2)}ms - ${cachedComputeElements.length} compute, ${cachedInputElements.length} inputs`,
                );
            }
        }

        // --- 5. FAST INPUT READER ---
        function getGlobalInputs() {
            return inputValueCache;
        }

        function updateInputCache(name, value) {
            if (name) {
                inputValueCache.set(sanitizeName(name), value);
            }
        }

        function getRowIndices() {
            return rowIndicesCache || new Set();
        }

        // --- 6. OPTIMIZED MAIN PROCESSOR ---
        function process() {
            if (processingPromise) return processingPromise;

            processingPromise = new Promise((resolve) => {
                if (isCacheDirty) rebuildDomCache();

                let globalInputs = getGlobalInputs();
                const indices = getRowIndices();
                const formulaCache = new Map();
                aggregateFunctionCache.clear();

                let index = 0;
                let hasChanges = false;
                let iterationCount = 0;
                let consecutiveStableCount = 0;
                const MAX_STABLE_CYCLES = 3;
                const totalElements = cachedComputeElements.length;

                function processChunk() {
                    const startTime = performance.now();
                    let processed = 0;
                    let batchHasChanges = false;

                    while (
                        index < totalElements &&
                        processed < BATCH_SIZE &&
                        performance.now() - startTime < TIME_BUDGET_MS
                    ) {
                        const element = cachedComputeElements[index];
                        index++;
                        processed++;

                        if (!element.isConnected) continue;

                        const expr =
                            attr(element, "live-compute")?.trim() || "";
                        if (!expr) continue;

                        // parsing format: how THIS element reads the variables in its own formula.
                        // (may differ from its own display format on purpose — see resolveDisplayFormat)
                        const parsingFormat = resolveParsingFormat(element);
                        const formulaCacheKey = `${expr}::${parsingFormat}`;

                        try {
                            if (
                                attr(element, "live-compute-skip") === "true" &&
                                document.activeElement === element
                            )
                                continue;
                            if (getData(element, "updating") === true) continue;

                            // Check trigger conditions
                            const triggerAttr =
                                attr(element, "live-compute-trigger") || "";
                            if (triggerAttr.trim()) {
                                const triggers = triggerAttr
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                let anyRecent = false;
                                const now = Date.now();
                                const THRESHOLD_MS = 1500;

                                for (const t of triggers) {
                                    const inputs = cachedInputElements;
                                    for (const inp of inputs) {
                                        const nameAttr = attr(inp, "name");
                                        if (!nameAttr) continue;
                                        const sanitized =
                                            sanitizeName(nameAttr);
                                        if (sanitized === t) {
                                            const last =
                                                getData(
                                                    inp,
                                                    "lastManualInput",
                                                ) || 0;
                                            if (now - last < THRESHOLD_MS) {
                                                anyRecent = true;
                                                break;
                                            }
                                        }
                                    }
                                    if (anyRecent) break;
                                }

                                if (!anyRecent) continue;
                            }

                            let result;

                            if (
                                iterationCount === 0 &&
                                formulaCache.has(formulaCacheKey)
                            ) {
                                result = formulaCache.get(formulaCacheKey);
                            } else {
                                result = evaluateExpression(
                                    expr,
                                    globalInputs,
                                    indices,
                                    parsingFormat,
                                );

                                if (isNaN(result) || !isFinite(result)) {
                                    if (DEBUG_MODE)
                                        console.warn(
                                            `[Process] Invalid result for "${expr}": ${result}`,
                                        );
                                    result = 0;
                                }

                                if (iterationCount === 0)
                                    formulaCache.set(formulaCacheKey, result);
                            }

                            const changed = displayResult(element, result);
                            if (changed) {
                                batchHasChanges = true;
                                hasChanges = true;
                                consecutiveStableCount = 0;
                                if (element.name) {
                                    updateInputCache(element.name, result);
                                }
                            }
                        } catch (e) {
                            if (DEBUG_MODE)
                                console.warn(`[Process] Error: "${expr}"`, e);
                            displayResult(element, 0);
                        }
                    }

                    if (index < totalElements) {
                        requestAnimationFrame(processChunk);
                    } else {
                        if (!batchHasChanges) {
                            consecutiveStableCount++;
                        }

                        if (consecutiveStableCount >= MAX_STABLE_CYCLES) {
                            if (DEBUG_MODE)
                                console.log(
                                    `🛑 Live compute stable after ${iterationCount} iterations`,
                                );
                            finishProcessing();
                            resolve();
                            return;
                        }

                        if (hasChanges && iterationCount < MAX_ITERATIONS) {
                            iterationCount++;
                            if (DEBUG_MODE)
                                console.log(
                                    `[LiveCompute] Pass ${iterationCount}/${MAX_ITERATIONS}`,
                                );

                            index = 0;
                            hasChanges = false;
                            formulaCache.clear();
                            aggregateFunctionCache.clear();

                            for (
                                let i = 0;
                                i < cachedInputElements.length;
                                i++
                            ) {
                                const el = cachedInputElements[i];
                                if (el.name) {
                                    // ✅ FIX: dulu di sini langsung baca `el.value`
                                    // mentah untuk semua input non-checkbox,
                                    // termasuk masked-input. Itu artinya, dari
                                    // iterasi konvergensi ke-2 dan seterusnya,
                                    // formula lain membaca STRING TAMPILAN
                                    // (mis. "1.234,56") alih-alih angka
                                    // canonical-nya. Kalau format masked-input
                                    // itu beda dari format parsing formula yang
                                    // membacanya (mis. input "usd" dibaca oleh
                                    // formula ber-format "idr"), pemisah ribuan/
                                    // desimal salah dibaca dan angkanya rusak.
                                    // computeInputCacheValue() menyamakan lagi
                                    // dengan logic rebuildDomCache().
                                    const cachedValue = computeInputCacheValue(el);
                                    updateInputCache(el.name, cachedValue);
                                }
                            }

                            requestAnimationFrame(processChunk);
                        } else {
                            if (DEBUG_MODE && iterationCount > 0) {
                                console.log(
                                    `[LiveCompute] ✓ Converged in ${iterationCount} passes`,
                                );
                            }
                            finishProcessing();
                            resolve();
                        }
                    }
                }

                function finishProcessing() {
                    processingPromise = null;
                }

                requestAnimationFrame(processChunk);
            });

            return processingPromise;
        }

        // --- 7. ENHANCED DOM UPDATER (with normalization) ---
        function displayResult(element, result) {
            // ✅ FIX (bidirectional A<->B pairs, e.g. discountPercent <-> discountAmount):
            // dulu proteksi ini pakai flag boolean permanen ("userOwned") yang di-set
            // true saat user mengetik dan TIDAK PERNAH kembali false dengan sendirinya.
            // Akibatnya field yang pernah diedit manual TERKUNCI SELAMANYA dari update
            // formula berikutnya — termasuk saat nilai dasarnya berubah lewat cara lain
            // (broadcast realtime, AJAX, atau field lain yang di-update programatik),
            // yang semuanya tidak memicu event "input" asli sehingga tidak pernah ada
            // kesempatan untuk melepas kuncinya. Flag itu juga di-reset secara BLANKET
            // ke SEMUA elemen live-compute di halaman pada setiap keystroke (O(n) per
            // ketikan — mahal untuk halaman dengan banyak elemen), padahal seharusnya
            // hanya relevan untuk field yang benar-benar sedang diketik.
            //
            // Sekarang: field dilindungi dari overwrite formula HANYA selama beberapa
            // ratus ms setelah terakhir diketik (cukup menutupi debounce + siklus
            // konvergensi yang sedang berjalan). Begitu user berhenti mengetik field
            // itu, ia otomatis "lepas kunci" dan formula bisa meng-update-nya lagi —
            // tidak perlu event dari field lain, dan tidak ada loop O(n) sama sekali.
            const lastManualInput = getData(element, "lastManualInput") || 0;
            if (Date.now() - lastManualInput < OWNERSHIP_WINDOW_MS) return false;

            const lastValue = getData(element, "lastValue");
            const lastDisplayFormat = getData(element, "lastDisplayFormat");

            const parsingFormat = resolveParsingFormat(element);
            const displayFormat = resolveDisplayFormat(element); // null = never formatted, on purpose

            let rawValue = toNumber(result, parsingFormat);

            if (isNaN(rawValue) || !isFinite(rawValue)) {
                if (DEBUG_MODE)
                    console.warn(
                        "[Display] Invalid value, defaulting to 0:",
                        rawValue,
                    );
                rawValue = 0;
            }

            // Read live-decimal-max attribute
            const decimalAttr = attr(element, "live-decimal-max");
            let maxDecimals =
                decimalAttr === null || decimalAttr === ""
                    ? null // null = let the format's own defaultDecimals decide
                    : parseInt(decimalAttr, 10);

            if (maxDecimals !== null && (isNaN(maxDecimals) || maxDecimals < 0))
                maxDecimals = 0;
            if (maxDecimals !== null && maxDecimals > 20) maxDecimals = 20;

            // Normalize the number with proper precision
            rawValue = normalizeNumber(rawValue, maxDecimals === null ? 0 : maxDecimals);

            if (isNaN(rawValue) || !isFinite(rawValue)) {
                rawValue = 0;
            }

            // Check for live-compute-init="false"
            if (
                lastValue === undefined &&
                attr(element, "live-compute-init") === "false"
            ) {
                setData(element, "lastValue", rawValue);
                setData(element, "lastDisplayFormat", displayFormat);

                // Get server value and format it
                let serverValue = element.matches("input, textarea, select")
                    ? val(element)
                    : element.innerHTML;
                let formattedServerValue = displayFormat
                    ? formatResult(serverValue, displayFormat, maxDecimals)
                    : serverValue;

                // Update display only if not formatted yet
                if (serverValue !== formattedServerValue) {
                    if (element.matches("input, textarea, select")) {
                        val(element, formattedServerValue);
                    } else {
                        element.innerHTML = formattedServerValue;
                    }
                }

                return false;
            }

            // A live-compute-format="auto" element resolves to a different real
            // format whenever LiveDom.setCurrency() runs — detect that here so a
            // pure format switch (no value change at all) still re-renders.
            const formatChanged = displayFormat !== lastDisplayFormat;

            // Use enhanced convergence check
            if (formatChanged || !isValueConverged(lastValue, rawValue, parsingFormat)) {
                setData(element, "lastValue", rawValue);
                setData(element, "lastDisplayFormat", displayFormat);

                let displayValue = displayFormat
                    ? formatResult(rawValue, displayFormat, maxDecimals)
                    : rawValue.toString();

                updateElementValue(element, displayValue);
                return true;
            }

            return false;
        }

        function updateElementValue(element, displayValue) {
            setData(element, "updating", true);
            isInternalUpdate = true;

            if (element.matches("input, textarea, select")) {
                if (val(element) !== displayValue) {
                    val(element, displayValue);
                    element.dispatchEvent(
                        new Event("input", { bubbles: true }),
                    );
                    element.dispatchEvent(
                        new Event("change", { bubbles: true }),
                    );
                }
            } else {
                if (element.innerHTML !== displayValue)
                    element.innerHTML = displayValue;
            }

            isInternalUpdate = false;
            setData(element, "updating", false);
        }

        // --- 8. SAFE MATH ENGINE ---
        function evaluateExpression(expr, globalInputs, indices, parsingFormat) {
            if (expr.includes("range")) {
                const m = expr.match(
                    /(rangeDate|rangeMonth|rangeYear|rangeWeek)\(([^)]+)\)/,
                );
                if (m) return 0;
            }

            // ✅ FIX: lookbehind (?<![\w.]) memastikan "min(", "max(", dst hanya
            // dianggap fungsi agregat LiveDom kalau BUKAN didahului huruf/angka/
            // underscore atau titik. Tanpa ini, `Math.max(a, b)` ikut tertangkap
            // (karena mengandung substring "max("), lalu diganti jadi angka hasil
            // agregat sehingga expr berubah jadi "Math.<angka>" — sintaks JS yang
            // tidak valid — dan formula selalu gagal senyap, hasilnya selalu 0.
            if (/(?<![\w.])(sum|avg|min|max|count|sumif)\(/.test(expr)) {
                expr = processAggregateFunctions(
                    expr,
                    globalInputs,
                    indices,
                    parsingFormat,
                );
            }

            const vars = extractVariables(expr);
            const vals = vars.map((v) =>
                toNumber(globalInputs.get(v) || 0, parsingFormat),
            );

            try {
                const result = safeFunctionEvaluation(vars, vals, expr);

                if (isNaN(result) || !isFinite(result)) {
                    if (DEBUG_MODE)
                        console.warn(
                            `[Eval] Invalid result for "${expr}": ${result}`,
                        );
                    return 0;
                }

                return result;
            } catch (e) {
                if (DEBUG_MODE) console.error("[Eval] Error:", expr, e);
                return 0;
            }
        }

        // --- 9. ENHANCED AGGREGATE FUNCTIONS (with normalization) ---
        function processAggregateFunctions(
            expr,
            globalInputs,
            indices,
            parsingFormat,
        ) {
            // ✅ FIX: guard yang sama seperti di evaluateExpression() — jangan
            // sentuh "sumif(" yang didahului huruf/angka/underscore/titik
            // (mis. "Math." atau bagian dari identifier lain).
            expr = expr.replace(
                /(?<![\w.])sumif\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi,
                (match, r1, c, r2) => {
                    const cacheKey = `sumif:${r1}:${c}:${r2}:${parsingFormat}`;

                    if (aggregateFunctionCache.has(cacheKey)) {
                        return aggregateFunctionCache.get(cacheKey);
                    }

                    const vals = getSumIfValues(
                        r1,
                        c,
                        r2,
                        globalInputs,
                        indices,
                    );
                    const result = safeAggregate("sum", vals, parsingFormat);

                    aggregateFunctionCache.set(cacheKey, result);
                    return result;
                },
            );

            return expr.replace(
                /(?<![\w.])(sum|avg|min|max|count)\(([^()]+)\)/gi,
                (match, fn, arg) => {
                    const cacheKey = `${fn}:${arg}:${parsingFormat}`;

                    if (aggregateFunctionCache.has(cacheKey)) {
                        return aggregateFunctionCache.get(cacheKey);
                    }

                    const vals = getAggregateValues(arg, globalInputs, indices);
                    const result = safeAggregate(
                        fn.toLowerCase(),
                        vals,
                        parsingFormat,
                    );

                    aggregateFunctionCache.set(cacheKey, result);
                    return result;
                },
            );
        }

        function safeAggregate(fn, vals, parsingFormat) {
            if (!vals || vals.length === 0) return 0;

            const validVals = vals
                .filter((v) => {
                    const num = toNumber(v, parsingFormat);
                    return isFinite(num) && !isNaN(num);
                })
                .map((v) => toNumber(v, parsingFormat));

            if (validVals.length === 0) return 0;

            let result = 0;

            try {
                if (fn === "sum") {
                    // Use reduce with proper accumulation to avoid floating point errors
                    result = validVals.reduce((acc, val) => {
                        const sum = acc + val;
                        return isFinite(sum) ? sum : acc;
                    }, 0);
                    // Normalize the sum to avoid floating point errors
                    result = normalizeNumber(result, 10);
                } else if (fn === "count") {
                    result = validVals.length;
                } else if (fn === "avg") {
                    const sum = validVals.reduce((acc, val) => {
                        const s = acc + val;
                        return isFinite(s) ? s : acc;
                    }, 0);
                    result = safeDivide(sum, validVals.length);
                    result = normalizeNumber(result, 10);
                } else if (fn === "min") {
                    result = Math.min(...validVals);
                } else if (fn === "max") {
                    result = Math.max(...validVals);
                }

                if (isNaN(result) || !isFinite(result)) {
                    if (DEBUG_MODE)
                        console.warn(
                            `[Aggregate] Invalid ${fn} result:`,
                            result,
                        );
                    return 0;
                }

                return result;
            } catch (e) {
                if (DEBUG_MODE) console.error(`[Aggregate] Error in ${fn}:`, e);
                return 0;
            }
        }

        function getAggregateValues(arg, globalInputs, indices) {
            arg = arg.trim();
            const vals = [];

            if (arg.includes("?")) {
                const parts = arg.split("?");
                indices.forEach((i) => {
                    const key = sanitizeName(parts.join(i));
                    const val = globalInputs.get(key);
                    if (val !== undefined) vals.push(val);
                });
            } else {
                // ⚠️ Catatan desain: fungsi agregat di sini hanya menerima SATU
                // nama field (opsional dengan wildcard "?" untuk row), bukan
                // daftar eksplisit seperti "a, b, c". Kalau argumennya mengandung
                // koma, itu tanda umum salah pakai (developer mengira ini bisa
                // menjumlahkan beberapa variabel sekaligus) — beri warning di
                // debug mode alih-alih diam-diam mengembalikan 0.
                if (DEBUG_MODE && arg.includes(",")) {
                    console.warn(
                        `[LiveCompute] Argumen agregat "${arg}" mengandung koma — ini dibaca sebagai SATU nama field (dan kemungkinan besar tidak ketemu, hasil jadi 0), bukan daftar variabel terpisah. Gunakan pola wildcard, mis. sum(price_?), untuk menjumlahkan beberapa baris.`,
                    );
                }

                const key = sanitizeName(arg);
                const val = globalInputs.get(key);
                if (val !== undefined) vals.push(val);
            }

            return vals;
        }

        function getSumIfValues(
            critRange,
            crit,
            sumRange,
            globalInputs,
            indices,
        ) {
            const vals = [];
            crit = crit.replace(/['"]/g, "").trim();
            const isWildcard =
                critRange.includes("?") || sumRange.includes("?");

            if (isWildcard) {
                indices.forEach((i) => {
                    const kC = sanitizeName(critRange.replace(/\?/g, i));
                    const valC = globalInputs.get(kC);

                    if (String(valC) == String(crit)) {
                        const kS = sanitizeName(sumRange.replace(/\?/g, i));
                        const valS = globalInputs.get(kS);
                        if (valS !== undefined) vals.push(valS);
                    }
                });
            }

            return vals;
        }

        // --- 10. SAFE UTILITIES ---
        const MAX_EXPR_CACHE = 200;
        const exprFuncCache = new Map();

        function safeFunctionEvaluation(vars, vals, expr) {
            if (!exprFuncCache.has(expr)) {

                // FIX: Batasi ukuran cache agar tidak tumbuh tak terbatas
                // Map di JS menjaga insertion order, jadi .keys().next().value
                // selalu mengembalikan entry paling lama
                if (exprFuncCache.size >= MAX_EXPR_CACHE) {
                    const oldestKey = exprFuncCache.keys().next().value;
                    exprFuncCache.delete(oldestKey);
                }

                const funcBody = `
                    const safeDivide = (a, b) => {
                        const numB = typeof b === 'number' ? b : parseFloat(b) || 0;
                        if (numB === 0) return 0;
                        const result = (typeof a === 'number' ? a : parseFloat(a) || 0) / numB;
                        return isFinite(result) ? result : 0;
                    };
                    const safeAdd = (a, b) => {
                        const result = (typeof a === 'number' ? a : parseFloat(a) || 0) +
                                    (typeof b === 'number' ? b : parseFloat(b) || 0);
                        return isFinite(result) ? result : 0;
                    };
                    const round = (num, digits=0) => {
                        const f = Math.pow(10, digits);
                        const result = Math.round(num * f) / f;
                        return isFinite(result) ? result : 0;
                    };
                    try {
                        const result = ${expr};
                        return (isNaN(result) || !isFinite(result)) ? 0 : result;
                    } catch(e) {
                        return 0;
                    }
                `;

                const func = new Function(...vars, "Math", funcBody);
                exprFuncCache.set(expr, func);
            }

            try {
                const result = exprFuncCache.get(expr)(...vals, Math);
                return isNaN(result) || !isFinite(result) ? 0 : result;
            } catch (e) {
                if (DEBUG_MODE) console.error("[SafeEval] Error:", e);
                return 0;
            }
        }

        function extractVariables(expr) {
            const vars = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
            const reserved = [
                "sum",
                "avg",
                "min",
                "max",
                "count",
                "sumif",
                "round",
                "Math",
                "safeDivide",
                "safeAdd",
                // ✅ FIX: literal JS yang mungkin dipakai langsung di ekspresi,
                // mis. `active == true ? 1 : 0`. Tanpa ini, "true" ikut
                // diekstrak sebagai nama variabel lalu dijadikan nama parameter
                // di `new Function(...)` — tapi "true"/"false"/"null" adalah
                // reserved word JS dan TIDAK BOLEH jadi nama parameter, jadi
                // `new Function()` throw SyntaxError dan formula diam-diam
                // selalu bernilai 0.
                "true",
                "false",
                "null",
                "undefined",
                "NaN",
                "Infinity",
            ];
            return [...new Set(vars.filter((v) => !reserved.includes(v)))];
        }

        // formatKey here is always a resolved key (never "auto") coming from
        // resolveDisplayFormat(). Unknown keys degrade to the raw string instead
        // of throwing, so a typo in live-compute-format never breaks the page.
        // ✅ PERF: Intl.NumberFormat itu lumayan berat untuk dibuat, dan biasanya
        // cuma ada segelintir kombinasi (locale, decimals) yang benar-benar dipakai
        // di satu halaman walau elemen live-compute-nya ribuan. Cache instance-nya
        // supaya formatResult() tidak bikin objek baru tiap kali ada nilai berubah.
        const numberFormatCache = new Map();
        function getNumberFormat(locale, decimals) {
            const key = `${locale}:${decimals}`;
            let fmt = numberFormatCache.get(key);
            if (!fmt) {
                fmt = new Intl.NumberFormat(locale, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                });
                numberFormatCache.set(key, fmt);
            }
            return fmt;
        }

        function formatResult(result, formatKey, maxDecimals) {
            const cfg = getLiveComputeFormat(formatKey);
            if (!cfg) return String(result);

            const num = parseFloat(result);
            if (isNaN(num) || !isFinite(num)) return "0";

            let decimals =
                maxDecimals === null || maxDecimals === undefined || isNaN(parseInt(maxDecimals))
                    ? cfg.defaultDecimals
                    : parseInt(maxDecimals, 10);
            if (isNaN(decimals) || decimals < 0) decimals = 0;

            if (cfg.kind === "percent") {
                return num.toFixed(decimals) + "%";
            }

            // "currency" and "plain" both render through Intl using the config's locale
            try {
                return getNumberFormat(cfg.locale || "en-US", decimals).format(num);
            } catch (e) {
                return num.toFixed(decimals);
            }
        }

        // --- 12. REAL-TIME INPUT MASKING ---
        // Applies to plain <input name="..." live-compute-format="..."> fields —
        // i.e. fields the USER types into directly, as opposed to [live-compute]
        // output elements (those are already handled by displayResult above).
        // Strictly opt-in: an <input> without live-compute-format is never
        // touched, exactly like output elements without the attribute.
        function isMaskableInput(element) {
            return !!(
                element &&
                element.tagName === "INPUT" &&
                element.type !== "checkbox" &&
                element.type !== "radio" &&
                element.hasAttribute("live-compute-format")
            );
        }

        function resolveMaxDecimals(element, cfg) {
            const decimalAttr = attr(element, "live-decimal-max");
            let maxDecimals =
                decimalAttr !== null && decimalAttr !== ""
                    ? parseInt(decimalAttr, 10)
                    : cfg.defaultDecimals;
            if (isNaN(maxDecimals) || maxDecimals < 0)
                maxDecimals = cfg.defaultDecimals;
            return maxDecimals;
        }

        // Pure formatting: canonical number -> grouped string. No cursor math —
        // used for static (re)renders (hydration, currency switch).
        function buildMaskedDisplay(canonical, cfg, maxDecimals) {
            const isNegative = canonical < 0;
            const fixed = Math.abs(canonical).toFixed(maxDecimals);
            const [intStr, fracStr] = fixed.split(".");
            const groupedInt = cfg.thousandSep
                ? intStr.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousandSep)
                : intStr;

            let display = (isNegative ? "-" : "") + groupedInt;
            if (fracStr && maxDecimals > 0) display += cfg.decimalSep + fracStr;
            return display;
        }

        // Re-render a masked input from its stored canonical value. Used on
        // hydration and on currency switch — never re-parses the *displayed*
        // string, so it can't misread it under a different locale's rules.
        function renderMaskedInput(element, formatKey) {
            const cfg = getLiveComputeFormat(formatKey);
            const canonical = getData(element, "canonical");
            if (!cfg || canonical === undefined) return;

            const maxDecimals = resolveMaxDecimals(element, cfg);
            const display = buildMaskedDisplay(canonical, cfg, maxDecimals);

            isInternalUpdate = true;
            val(element, display);
            isInternalUpdate = false;

            setData(element, "lastMaskFormat", formatKey);
        }

        // First-sight hydration: read whatever the DOM/server already has into
        // a canonical number, without writing back yet (renderMaskedInput does
        // the actual write, right after, in the caller).
        function primeMaskedInputFromDom(element, formatKey) {
            const canonical = toNumber(val(element), formatKey);
            setData(element, "canonical", canonical);
            return canonical;
        }

        // Live, cursor-safe reformatting while the user is actively typing.
        // Splits on the format's OWN decimal separator (never guesses which
        // character means what), strips everything else, regroups thousands,
        // and repositions the caret by DIGIT COUNT rather than character
        // index — so inserting a separator mid-type never jumps the cursor.
        function applyLiveMask(element, formatKey) {
            const cfg = getLiveComputeFormat(formatKey);
            if (!cfg) return toNumber(val(element), formatKey);

            const raw = val(element);
            const cursorPos = element.selectionStart ?? raw.length;

            const isNegative = raw.trim().charAt(0) === "-";
            const body = raw.replace(/-/g, "");

            const sepIndex = cfg.decimalSep ? body.indexOf(cfg.decimalSep) : -1;
            let intPart, fracPart;
            if (sepIndex === -1) {
                intPart = body;
                fracPart = null;
            } else {
                intPart = body.slice(0, sepIndex);
                fracPart = body.slice(sepIndex + 1);
            }

            intPart = intPart.replace(/\D/g, "");
            if (fracPart !== null) {
                fracPart = fracPart.replace(/\D/g, "");
                fracPart = fracPart.slice(0, resolveMaxDecimals(element, cfg));
            }

            // digits sitting to the LEFT of the caret, before reformatting
            const digitsBeforeCursor = raw
                .slice(0, cursorPos)
                .replace(/\D/g, "").length;

            // Special case: the character the user just typed IS the decimal
            // separator itself (no fraction digits yet). Pure digit-counting
            // would place the caret one step BEHIND it (back on the last whole
            // digit), pushing the next keystroke in front of the separator
            // instead of after it. Detect that and pin the caret to the end.
            const charBeforeCursor = raw.charAt(cursorPos - 1);
            const justTypedDecimalSep =
                !!cfg.decimalSep &&
                charBeforeCursor === cfg.decimalSep &&
                fracPart === "";

            const groupedInt = cfg.thousandSep
                ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousandSep)
                : intPart;

            let display = (isNegative ? "-" : "") + groupedInt;
            if (fracPart !== null) display += cfg.decimalSep + fracPart;

            isInternalUpdate = true;
            element.value = display;
            isInternalUpdate = false;

            // walk the freshly-built string until the same digit count is passed
            let seen = 0;
            let newPos = display.length;
            if (justTypedDecimalSep) {
                newPos = display.length;
            } else if (digitsBeforeCursor === 0) {
                newPos = isNegative ? 1 : 0;
            } else {
                for (let i = 0; i < display.length; i++) {
                    if (/\d/.test(display[i])) seen++;
                    if (seen >= digitsBeforeCursor) {
                        newPos = i + 1;
                        break;
                    }
                }
            }
            try {
                element.setSelectionRange(newPos, newPos);
            } catch (e) {
                // some input types (e.g. type="number") don't support selection ranges
            }

            const canonicalStr =
                (isNegative ? "-" : "") +
                (intPart || "0") +
                (fracPart !== null ? "." + fracPart : "");
            let canonical = parseFloat(canonicalStr);
            if (isNaN(canonical)) canonical = 0;

            setData(element, "canonical", canonical);
            setData(element, "lastMaskFormat", formatKey);
            return canonical;
        }

        // Re-render every masked input that follows the global currency (i.e.
        // pinned with live-compute-format="auto") from its stored canonical
        // value. Pinned literals (idr/usd/...) and non-currency kinds
        // (percent/plain) are untouched — mirrors reformatting behavior of
        // live-compute output elements in displayResult.
        function remaskAutoInputs() {
            cachedInputElements.forEach((element) => {
                if (!isMaskableInput(element)) return;
                if (attr(element, "live-compute-format") !== "auto") return;
                if (getData(element, "canonical") === undefined) return;

                const formatKey = resolveDisplayFormat(element); // "auto" -> current global
                renderMaskedInput(element, formatKey);
                if (element.name) {
                    updateInputCache(element.name, getData(element, "canonical"));
                }
            });
        }

        // --- 11. OPTIMIZED SCHEDULER & INIT ---
        function scheduleProcess(delay = 0) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => process(), delay);
        }

        function init() {
            const observer = new MutationObserver((mutations) => {
                if (isInternalUpdate) return;

                let shouldRebuild = false;
                for (const m of mutations) {
                    if (
                        m.target &&
                        m.target.hasAttribute &&
                        m.target.hasAttribute("live-compute")
                    )
                        continue;
                    if (m.type === "childList") {
                        shouldRebuild = true;
                        break;
                    }
                }

                if (shouldRebuild) {
                    isCacheDirty = true;
                    scheduleProcess(300);
                }
            });

            observer.observe(rootScope, {
                childList: true,
                subtree: true,
                attributes: false,
            });

            rootScope.addEventListener(
                "input",
                (e) => {
                    if (isInternalUpdate) return;

                    if (
                        e.target &&
                        e.target.matches &&
                        e.target.matches("input, select, textarea")
                    ) {
                        // Real-time masking: only for a plain <input> that opted in
                        // with live-compute-format. Reformats as-you-type and
                        // returns the canonical number (never the display string).
                        let maskedCanonical;
                        if (isMaskableInput(e.target)) {
                            maskedCanonical = applyLiveMask(
                                e.target,
                                resolveDisplayFormat(e.target),
                            );
                        }

                        if (e.target.name) {
                            const isCheckbox = e.target.type === "checkbox";
                            // ✅ Checkbox: store el.value when checked, 0 when unchecked
                            const cachedValue = isCheckbox
                                ? (e.target.checked ? e.target.value : 0)
                                : (maskedCanonical !== undefined ? maskedCanonical : e.target.value);
                            updateInputCache(e.target.name, cachedValue);
                            // ✅ FIX: ini sekarang SATU-SATUNYA hal yang perlu dicatat
                            // untuk proteksi bidirectional (lihat displayResult()) —
                            // O(1), bukan lagi forEach ke semua elemen live-compute.
                            setData(e.target, "lastManualInput", Date.now());
                        }

                        // Unlock init attribute on manual input (self-computing
                        // input case: this element itself carries the attribute)
                        if (e.target.hasAttribute("live-compute-init")) {
                            e.target.removeAttribute("live-compute-init");
                        }

                        // ✅ FIX: juga buka kunci elemen OUTPUT read-only yang
                        // masih live-compute-init="false" di scope ini — lihat
                        // penjelasan di unlockLiveComputeInitOutputs().
                        unlockLiveComputeInitOutputs();

                        scheduleProcess(INPUT_DEBOUNCE);
                    }
                },
                { passive: true },
            );

            // ✅ Checkbox fires "change", not "input" — handle separately
            rootScope.addEventListener(
                "change",
                (e) => {
                    if (isInternalUpdate) return;

                    if (
                        e.target &&
                        e.target.matches &&
                        e.target.type === "checkbox" &&
                        e.target.name
                    ) {
                        // ✅ Store el.value when checked, 0 when unchecked
                        const checkboxValue = e.target.checked ? e.target.value : 0;
                        updateInputCache(e.target.name, checkboxValue);
                        setData(e.target, "lastManualInput", Date.now());

                        if (e.target.hasAttribute("live-compute-init")) {
                            e.target.removeAttribute("live-compute-init");
                        }

                        // ✅ FIX: sama seperti di handler "input" — buka kunci
                        // elemen output live-compute-init="false" di scope ini.
                        unlockLiveComputeInitOutputs();

                        scheduleProcess(INPUT_DEBOUNCE);
                    }
                },
                { passive: true },
            );

            rebuildDomCache();
            process();
        }

        init();

        // Expose this scope to the global format registry so
        // LiveDom.setCurrency()/unpin() can trigger a refresh here too.
        const instanceApi = {
            rootScope,
            refresh: () => {
                remaskAutoInputs();
                scheduleProcess(0);
            },
        };
        liveComputeInstances.push(instanceApi);
        return instanceApi;
    }


    /*==============================
      SPA ROUTER INTEGRATION
    ==============================*/

    /**
     * FIX (bug #3): sebelumnya ada 3 mekanisme request berbeda untuk SPA
     * (ajaxSpa via fetch+AbortController, ajaxSpaFormSubmit via $.ajax tanpa
     * abort, dan fetch polos untuk form GET/redirect tanpa abort & tanpa
     * loading bar) — jadi hanya sebagian yang bisa saling membatalkan
     * request lama dan loading bar tidak konsisten muncul. Helper ini
     * dipakai bersama supaya semua jalur GET SPA berbagi controller yang
     * sama dan selalu menampilkan loading bar.
     * @param {string} url
     * @returns {Promise<string>} response body sebagai text
     */
    function spaFetchGet(url) {
        if (currentSpaController) {
            currentSpaController.abort();
        }
        currentSpaController = new AbortController();
        const signal = currentSpaController.signal;

        showLoadingBar();

        return fetch(url, {
            headers: { "X-Requested-With": "XMLHttpRequest" },
            signal,
        })
            .then((res) => res.text())
            .finally(() => {
                hideLoadingBar();
                currentSpaController = null;
            });
    }

    /**
     * Dispatch pasangan event afterUpdate + afterSpa setelah region SPA
     * diperbarui.
     * @param {string} url
     */
    function dispatchSpaEvents(url) {
        document.dispatchEvent(new CustomEvent("live-dom:afterUpdate"));
        document.dispatchEvent(
            new CustomEvent("live-dom:afterSpa", { detail: { url } }),
        );
    }

    let currentSpaController = null;

    /**
     * Performs an AJAX request for SPA navigation.
     * @param {string} method - HTTP method.
     * @param {string} url - URL to fetch.
     * @param {object|FormData} [data=null] - Data to send.
     * @param {function} callback - Success callback.
     * @param {function} errorCallback - Error callback.
     */
    function ajaxSpa(method, url, data = null, callback, errorCallback) {
        if (currentSpaController) {
            currentSpaController.abort();
        }

        currentSpaController = new AbortController();
        const signal = currentSpaController.signal;

        showLoadingBar();

        const headers = {
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": csrfToken(),
        };

        const fetchOptions = {
            method,
            headers,
            signal,
        };

        if (method !== "GET" && data) {
            fetchOptions.body =
                data instanceof FormData ? data : new URLSearchParams(data);
        }

        fetch(url, fetchOptions)
            .then(async (response) => {
                const html = await response.text();
                if (!response.ok) {
                    showErrorModal(html);
                    throw new Error(
                        `[${response.status}] ${response.statusText}`,
                    );
                }
                callback?.(html);
            })
            .catch((error) => {
                if (error.name === "AbortError") {
                    console.log("[SPA] Request dibatalkan:", url);
                    return;
                }
                console.error("ajaxSpa error:", error);
                errorCallback?.(error);
            })
            .finally(() => {
                hideLoadingBar();
                currentSpaController = null; // Clear controller after request completes
            });
    }

    /**
     * Updates SPA regions with new HTML content.
     * @param {string} responseHtml - The HTML response to parse.
     */
    function updateSpaRegions(responseHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(responseHtml, "text/html");
        const regions = document.querySelectorAll("[live-spa-region]");
        regions.forEach((region) => {
            const regionName = region.getAttribute("live-spa-region");
            const newRegion = doc.querySelector(
                `[live-spa-region="${regionName}"]`,
            );
            if (newRegion) {
                region.innerHTML = newRegion.innerHTML;
                executeScripts(region);
            }
        });
    }

    /**
     * Loads SPA content into regions.
     * @param {string} url - The URL to load.
     * @param {boolean} [pushState=true] - Whether to push the URL to browser history.
     */
    function loadSpaContent(url, pushState = true) {
        const mainRegion = document.querySelector('[live-spa-region="main"]');
        if (mainRegion) {
            mainRegion.innerHTML =
                '<div class="text-center p-4 text-gray-400">Loading...</div>';
        }

        ajaxSpa(
            "GET",
            url,
            null,
            (res) => {
                updateSpaRegions(res);
                dispatchSpaEvents(url);
                if (pushState)
                    history.pushState(
                        {
                            spa: true,
                            url,
                        },
                        "",
                        url,
                    );
            },
            () => {
                if (mainRegion) {
                    mainRegion.innerHTML =
                        '<div class="text-red-500 p-4">Failed to load content (network error)</div>';
                }
            },
        );
    }

    /**
     * Handles SPA form submissions via AJAX.
     * @param {HTMLFormElement} form - The form element.
     * @param {function} callbackSuccess - Success callback.
     * @param {function} callbackError - Error callback.
     */
    function ajaxSpaFormSubmit(form, callbackSuccess, callbackError) {
        const url = form.action;
        const method = form.method.toUpperCase() || "POST";
        const formData = new FormData(form);
        const beforeCallbackName = form.getAttribute("live-callback-before");
        const afterCallbackName = form.getAttribute("live-callback-after");

        const safeEvalCallbackExpression = (expr, el) => {
            try {
                const replaced = expr.replace(/\bthis\b/g, "__el");
                return Function(
                    "__el",
                    `
          try {
            return (${replaced});
          } catch (e) {
            console.warn('[LiveDomJs] Error in callback expression:', e);
            return undefined;
          }
        `,
                )(el);
            } catch (e) {
                console.warn(
                    "[LiveDomJs] Failed to evaluate callback expression:",
                    expr,
                    e,
                );
                return undefined;
            }
        };

        const runBeforeCallback = () => {
            if (!beforeCallbackName) return Promise.resolve(true);

            if (beforeCallbackName.includes("(")) {
                const result = safeEvalCallbackExpression(
                    beforeCallbackName,
                    form,
                );
                return Promise.resolve(result);
            }

            const fn = window[beforeCallbackName.trim()];
            if (typeof fn === "function") {
                try {
                    return Promise.resolve(fn(form));
                } catch (e) {
                    console.warn(
                        "[LiveDomJs] Error in live-callback-before:",
                        e,
                    );
                    return Promise.resolve(true);
                }
            } else {
                console.warn(
                    `[LiveDomJs] Function "${beforeCallbackName}" not found.`,
                );
                return Promise.resolve(true);
            }
        };

        const runAfterCallback = (response, isError = false) => {
            if (
                afterCallbackName &&
                typeof window[afterCallbackName] === "function"
            ) {
                try {
                    window[afterCallbackName](response, form, isError);
                } catch (e) {
                    console.warn(
                        "[LiveDomJs] Error in live-callback-after:",
                        e,
                    );
                }
            }
        };

        runBeforeCallback()
            .then((result) => {
                if (result === false) {
                    console.log(
                        "Form submit cancelled by live-callback-before.",
                    );
                    return;
                }

                clearFormErrors(form);

                // FIX (bug #3): sebelumnya pakai $.ajax dan tidak terhubung
                // ke currentSpaController sama sekali, jadi request submit
                // form tidak bisa dibatalkan kalau user buru-buru navigasi
                // lagi (race condition). Sekarang pakai fetch + controller
                // yang sama dengan request SPA lainnya.
                if (currentSpaController) {
                    currentSpaController.abort();
                }
                currentSpaController = new AbortController();
                const signal = currentSpaController.signal;

                showLoadingBar();

                fetch(url, {
                    method,
                    body: formData,
                    signal,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        "X-CSRF-TOKEN": csrfToken(),
                    },
                })
                    .then(async (response) => {
                        const contentType =
                            response.headers.get("content-type") || "";
                        const isJson = contentType.includes("application/json");
                        const body = isJson
                            ? await response.json()
                            : await response.text();

                        if (!response.ok) {
                            if (response.status === 422 && isJson) {
                                showFormErrors(form, body?.errors || {});
                            } else {
                                showErrorModal(body);
                            }
                            runAfterCallback(body, true);
                            callbackError?.(body);
                            return;
                        }

                        const redirectUrl = isJson ? body?.redirect : null;

                        if (redirectUrl) {
                            return spaFetchGet(redirectUrl)
                                .then((html) => {
                                    updateSpaRegions(html);
                                    dispatchSpaEvents(redirectUrl);
                                    history.pushState(
                                        { spa: true, url: redirectUrl },
                                        "",
                                        redirectUrl,
                                    );
                                    runAfterCallback(body, false);
                                    callbackSuccess?.(body);
                                })
                                .catch((err) => {
                                    console.error(
                                        "SPA redirect fetch error:",
                                        err,
                                    );
                                    runAfterCallback(body, true);
                                    callbackError?.(err);
                                });
                        }

                        runAfterCallback(body, false);
                        callbackSuccess?.(body);
                    })
                    .catch((error) => {
                        if (error.name === "AbortError") {
                            console.log(
                                "[SPA] Form submit dibatalkan:",
                                url,
                            );
                            return;
                        }
                        console.error("Form submit error:", error);
                        runAfterCallback(error, true);
                        callbackError?.(error);
                    })
                    .finally(() => {
                        hideLoadingBar();
                        currentSpaController = null;
                    });
            })
            .catch((error) => {
                console.error("Error in before callback chain:", error);
            });
    }

    /**
     * Clears form validation errors.
     * @param {HTMLFormElement} form - The form element.
     */
    function clearFormErrors(form) {
        qsa(".is-invalid", form).forEach((el) => el.classList.remove("is-invalid"));
        qsa(".invalid-feedback", form).forEach((el) => el.remove());
    }

    /**
     * Displays form validation errors.
     * @param {HTMLFormElement} form - The form element.
     * @param {object} errors - An object where keys are field names and values are arrays of error messages.
     */
    function showFormErrors(form, errors) {
        for (const [field, messages] of Object.entries(errors)) {
            const inputs = qsa(`[name="${field}"]`, form);
            inputs.forEach((inputEl) => {
                inputEl.classList.add("is-invalid");
                const next = inputEl.nextElementSibling;
                const alreadyHasFeedback =
                    next && next.classList.contains("invalid-feedback");
                if (!alreadyHasFeedback) {
                    const errorHtml = `<div class="invalid-feedback text-red-600 text-sm mt-1">${messages.join("<br>")}</div>`;
                    inputEl.insertAdjacentHTML("afterend", errorHtml);
                }
            });
        }
    }

    /**
     * Checks if a URL should be excluded from SPA handling.
     * @param {string} url - The URL to check.
     * @returns {boolean} True if the URL should be excluded.
     */
    function isSpaExcluded(url) {
        const excludes = (
            window.liveDomConfig?.spaExcludePrefixes || []
        ).filter(Boolean);
        if (excludes.length === 0) return false;

        let path;
        try {
            path = new URL(url, window.location.origin).pathname;
        } catch (e) {
            // FIX (bug #5): fallback ini dulu membandingkan url MENTAH
            // (termasuk origin/query/hash) terhadap prefix, sementara jalur
            // normal di atas membandingkan pathname saja — jadi hasilnya
            // bisa beda antara kedua jalur untuk url yang sama persis.
            // Sekarang fallback juga menormalkan ke pathname supaya
            // konsisten dengan jalur utama.
            console.warn(
                "Error parsing URL for SPA exclusion, falling back:",
                e,
            );
            path = String(url).split("#")[0].split("?")[0];
            if (path.startsWith(window.location.origin)) {
                path = path.slice(window.location.origin.length);
            }
        }

        return excludes.some((prefix) => path.startsWith(prefix));
    }

    /*==============================
      LOADING BAR
    ==============================*/

    /** Initializes the global loading bar element. */
    function initLoadingBar() {
        if (!qs("#loading-bar")) {
            const bar = document.createElement("div");
            bar.id = "loading-bar";
            Object.assign(bar.style, {
                position: "fixed",
                top: "0",
                left: "0",
                height: "3px",
                width: "0%",
                backgroundColor: "#2563eb",
                zIndex: "99999",
                transition: "width 0.3s ease, opacity 0.2s ease",
                willChange: "width",
                display: "none",
                opacity: "1",
            });
            document.body.appendChild(bar);
        }
    }

    let loadingBarHideTimer = null;

    /** Shows the loading bar animation (CSS transition, bukan jQuery .animate()). */
    function showLoadingBar() {
        const bar = qs("#loading-bar");
        if (!bar) return;

        clearTimeout(loadingBarHideTimer);

        // reset instan tanpa transisi (setara .stop(true))
        bar.style.transition = "none";
        bar.style.opacity = "1";
        bar.style.width = "0%";
        bar.style.display = "block";

        // paksa reflow supaya browser menganggap perubahan width berikut ini transisi baru
        void bar.offsetWidth;

        bar.style.transition = "width 0.8s ease";
        bar.style.width = "80%";
    }

    /** Hides the loading bar animation (CSS transition, bukan jQuery .animate()/.fadeOut()). */
    function hideLoadingBar() {
        const bar = qs("#loading-bar");
        if (!bar) return;

        clearTimeout(loadingBarHideTimer);

        bar.style.transition = "width 0.3s ease";
        bar.style.width = "100%";

        loadingBarHideTimer = setTimeout(() => {
            bar.style.transition = "opacity 0.2s ease";
            bar.style.opacity = "0";

            loadingBarHideTimer = setTimeout(() => {
                bar.style.transition = "none";
                bar.style.display = "none";
                bar.style.width = "0%";
                bar.style.opacity = "1";
            }, 200);
        }, 300);
    }

    // ============================================================
    //  showErrorModal — redesigned UI, GPT only
    //  Support: Laravel HTML (dd/Ignition), JSON exception, plain text
    // ============================================================

    function showProductionErrorToast(message, title = "Oops! Something went wrong") {
        const existing = document.getElementById("spa-prod-modal");
        if (existing) existing.remove();

        const wrapper = document.createElement("div");
        wrapper.id = "spa-prod-modal";
        wrapper.setAttribute("role", "alertdialog");
        wrapper.setAttribute("aria-modal", "true");
        wrapper.innerHTML = `
        <style>
            #spa-prod-modal {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                background: rgba(0, 0, 0, 0.45);
                backdrop-filter: blur(2px);
                animation: _spm-backdrop-in 0.2s ease forwards;
            }
            @keyframes _spm-backdrop-in {
                from { opacity: 0; }
                to   { opacity: 1; }
            }
            #_spm-box {
                background: #fff;
                border-radius: 16px;
                padding: 40px 32px 32px;
                max-width: 420px;
                width: 100%;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                animation: _spm-box-in 0.25s cubic-bezier(.22,.68,0,1.2) forwards;
            }
            @keyframes _spm-box-in {
                from { opacity: 0; transform: scale(0.88) translateY(12px); }
                to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            #_spm-icon-wrap {
                width: 80px;
                height: 80px;
                margin: 0 auto 20px;
                border-radius: 50%;
                background: #fee2e2;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: _spm-icon-pop 0.35s 0.1s cubic-bezier(.22,.68,0,1.4) both;
            }
            @keyframes _spm-icon-pop {
                from { transform: scale(0.5); opacity: 0; }
                to   { transform: scale(1);   opacity: 1; }
            }
            #_spm-title {
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 22px;
                font-weight: 700;
                color: #111827;
                margin: 0 0 10px;
                line-height: 1.3;
            }
            #_spm-msg {
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 15px;
                color: #6b7280;
                line-height: 1.6;
                margin: 0 0 28px;
            }
            #_spm-btn {
                display: inline-block;
                background: #fc4b4b;
                color: #fff;
                border: none;
                border-radius: 10px;
                padding: 12px 40px;
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s, transform 0.1s;
                min-width: 140px;
            }
            #_spm-btn:hover  { background: #b91c1c; }
            #_spm-btn:active { transform: scale(0.97); }
        </style>

        <div id="_spm-box">
            <div id="_spm-icon-wrap">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                     stroke="#fc4b4b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <circle cx="12" cy="16" r="0.5" fill="#fc4b4b"/>
                </svg>
            </div>
            <h2 id="_spm-title">${title}</h2>
            <p id="_spm-msg">${message}</p>
            <button id="_spm-btn">OK</button>
        </div>
    `;

        document.body.appendChild(wrapper);

        const close = () => {
            wrapper.style.transition = "opacity 0.2s";
            wrapper.style.opacity = "0";
            setTimeout(() => wrapper.remove(), 200);
        };

        wrapper.querySelector("#_spm-btn").onclick = close;

        // Klik di luar box untuk menutup
        wrapper.addEventListener("click", (e) => {
            if (e.target === wrapper) close();
        });

        // Tekan Escape untuk menutup
        const onKey = (e) => {
            if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
        };
        document.addEventListener("keydown", onKey);

        // Auto-dismiss setelah 8 detik
        setTimeout(close, 8000);
    }

    const _errorHistory = [];

    function showErrorModal(rawHtmlOrJson) {
        _errorHistory.push({
            time: new Date().toLocaleTimeString("id-ID"),
            raw: rawHtmlOrJson,
        });

        const existing = document.getElementById("spa-error-modal");
        if (existing) existing.remove();

        let parsedJson = null;
        try {
            parsedJson =
                typeof rawHtmlOrJson === "string"
                    ? JSON.parse(rawHtmlOrJson)
                    : rawHtmlOrJson;
        } catch {
            parsedJson = null;
        }

        const isJson =
            parsedJson && typeof parsedJson === "object" && parsedJson.message;

        // Breadcrumb: extract short label for header
        function buildBreadcrumb() {
            if (!isJson) return "Laravel Error";
            const file = parsedJson.file || "";
            const line = parsedJson.line || "";
            const short = file.split("/").pop() || file;
            return `${short}${line ? " — line " + line : ""}`;
        }

        function buildAiPrompt() {
            if (isJson) {
                return (
                    `Tolong jelaskan error Laravel berikut dan berikan solusinya:\n\n` +
                    `Message: ${parsedJson.message}\n` +
                    `Exception: ${parsedJson.exception || "-"}\n` +
                    `File: ${parsedJson.file || "-"} : line ${parsedJson.line || "-"}\n\n` +
                    `Stack Trace (5 frames teratas):\n` +
                    Object.values(parsedJson.trace || {})
                        .slice(0, 5)
                        .map(
                            (f, i) =>
                                `#${i} ${f.class || ""}${f.type || ""}${f.function || ""}() — ${f.file || ""}:${f.line || ""}`,
                        )
                        .join("\n")
                );
            }
            const tmp = document.createElement("div");
            tmp.innerHTML = typeof rawHtmlOrJson === "string" ? rawHtmlOrJson : "";
            return (
                `Tolong jelaskan error Laravel berikut dan berikan solusinya:\n\n` +
                (tmp.textContent || tmp.innerText || "").slice(0, 2000)
            );
        }

        async function copyToClipboard(btn) {
            const orig = btn.innerHTML;
            try {
                await navigator.clipboard.writeText(buildAiPrompt());
                btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
                btn.style.cssText += ";background:#EAF3DE;border-color:#97C459;color:#3B6D11";
                showToast("Error disalin ke clipboard — paste di ChatGPT (Ctrl+V)");
                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.style.background = btn.style.borderColor = btn.style.color = "";
                }, 2000);
            } catch {
                btn.textContent = "Gagal";
                setTimeout(() => (btn.innerHTML = orig), 2000);
            }
        }

        async function openGPT(btn) {
            const prompt = buildAiPrompt();
            const orig = btn.innerHTML;
            try { await navigator.clipboard.writeText(prompt); } catch { }
            btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied! Opening…`;
            btn.disabled = true;
            showToast("Membuka ChatGPT… error sudah tersalin, tinggal Ctrl+V");
            setTimeout(() => {
                window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, "_blank");
                btn.innerHTML = orig;
                btn.disabled = false;
            }, 700);
        }

        // ── Build modal ───────────────────────────────────────────
        const modal = document.createElement("div");
        modal.id = "spa-error-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-label", "Laravel error details");

        const historyCount = _errorHistory.length;
        const historyBadge = historyCount > 1
            ? `<span style="
            background:#F09595;color:#501313;
            border-radius:99px;font-size:10px;padding:1px 7px;
            font-weight:600;margin-left:6px;vertical-align:middle">
            ${historyCount}
          </span>`
            : "";

        modal.innerHTML = `
    <style>
        #spa-error-modal {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.55);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            animation: _sem-in 0.15s ease;
        }
        @keyframes _sem-in {
            from { opacity:0; }
            to   { opacity:1; }
        }
        #_sem-box {
            background: var(--color-background-primary, #fff);
            color: var(--color-text-primary, #111);
            border-radius: 12px;
            width: 95%;
            max-width: 860px;
            max-height: 88vh;
            border: 0.5px solid var(--color-border-secondary, #e5e7eb);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: _sem-rise 0.18s cubic-bezier(.22,.68,0,1.18);
        }
        @keyframes _sem-rise {
            from { transform: translateY(14px) scale(.98); opacity:0; }
            to   { transform: translateY(0) scale(1);     opacity:1; }
        }

        /* Header */
        #_sem-header {
            padding: 11px 16px;
            border-bottom: 0.5px solid var(--color-border-tertiary, #f0f0f0);
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
            background: var(--color-background-primary, #fff);
        }
        #_sem-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: var(--color-background-danger, #fef2f2);
            border: 0.5px solid var(--color-border-danger, #fca5a5);
            border-radius: 6px;
            padding: 3px 10px;
            font-size: 11.5px;
            font-weight: 500;
            color: var(--color-text-danger, #b91c1c);
            white-space: nowrap;
            flex-shrink: 0;
        }
        #_sem-breadcrumb {
            font-size: 12px;
            color: var(--color-text-tertiary, #9ca3af);
            font-family: 'Consolas', 'Menlo', monospace;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        ._sem-btn-close-hd {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            border-radius: 6px;
            border: none;
            background: transparent;
            color: var(--color-text-tertiary, #9ca3af);
            font-size: 17px;
            cursor: pointer;
            transition: background .1s, color .1s;
            flex-shrink: 0;
        }
        ._sem-btn-close-hd:hover {
            background: var(--color-background-danger, #fef2f2);
            color: var(--color-text-danger, #b91c1c);
        }

        /* Body */
        #_sem-body {
            flex: 1;
            overflow-y: auto;
            padding: 16px 18px;
        }

        /* Message block */
        ._sem-msg {
            background: var(--color-background-danger, #fef2f2);
            border: 0.5px solid var(--color-border-danger, #fecaca);
            border-radius: 8px;
            padding: 11px 14px;
            margin-bottom: 14px;
            font-size: 13px;
            color: var(--color-text-danger, #7f1d1d);
            font-weight: 500;
            line-height: 1.55;
        }

        /* Meta grid */
        ._sem-meta {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 3px 14px;
            margin-bottom: 14px;
        }
        ._sem-meta-label {
            font-size: 11px;
            color: var(--color-text-tertiary, #9ca3af);
            padding: 3px 0;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
            text-transform: uppercase;
            letter-spacing: .05em;
        }
        ._sem-meta-val {
            font-size: 12px;
            color: var(--color-text-primary, #111);
            padding: 3px 0;
            font-family: 'Consolas', 'Menlo', monospace;
            word-break: break-all;
        }
        ._sem-meta-val.is-line {
            color: var(--color-text-danger, #fc4b4b);
            font-weight: 600;
        }

        ._sem-divider {
            height: 0.5px;
            background: var(--color-border-tertiary, #f3f4f6);
            margin: 2px 0 14px;
        }

        /* Stack trace */
        ._sem-trace-head {
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: .06em;
            color: var(--color-text-tertiary, #9ca3af);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        ._sem-frame {
            display: flex;
            gap: 10px;
            padding: 7px 8px;
            border-radius: 6px;
            margin-bottom: 2px;
            border: 0.5px solid transparent;
            transition: background .1s, border-color .1s;
        }
        ._sem-frame:hover {
            background: var(--color-background-secondary, #f9fafb);
            border-color: var(--color-border-tertiary, #e5e7eb);
        }
        ._sem-frame-num {
            font-size: 11px;
            color: var(--color-text-tertiary, #d1d5db);
            min-width: 22px;
            padding-top: 1px;
            font-family: 'Consolas', 'Menlo', monospace;
            user-select: none;
        }
        ._sem-frame-info { flex: 1; min-width: 0; }
        ._sem-frame-fn {
            font-size: 12px;
            color: var(--color-text-info, #1d4ed8);
            font-family: 'Consolas', 'Menlo', monospace;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 1px;
        }
        ._sem-frame-file {
            font-size: 11px;
            color: var(--color-text-tertiary, #9ca3af);
            font-family: 'Consolas', 'Menlo', monospace;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        ._sem-frame-line { color: var(--color-text-danger, #fc4b4b); font-weight: 600; }

        /* Footer */
        #_sem-footer {
            padding: 11px 18px;
            border-top: 0.5px solid var(--color-border-tertiary, #f0f0f0);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-shrink: 0;
            background: var(--color-background-secondary, #f9fafb);
        }
        #_sem-footer-left {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            color: var(--color-text-tertiary, #9ca3af);
            white-space: nowrap;
            flex-shrink: 0;
        }
        ._sem-actions {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        }
        ._sem-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 14px;
            border-radius: 8px;
            font-size: 12.5px;
            font-weight: 500;
            cursor: pointer;
            border: 0.5px solid var(--color-border-secondary, #d1d5db);
            background: var(--color-background-primary, #fff);
            color: var(--color-text-primary, #111);
            transition: background .12s, border-color .12s;
            white-space: nowrap;
            line-height: 1.3;
        }
        ._sem-btn:hover { background: var(--color-background-secondary, #f3f4f6); }
        ._sem-btn:active { transform: scale(.98); }
        ._sem-btn:disabled { opacity: .5; cursor: default; }
        ._sem-btn-gpt {
            background: var(--color-background-success, #f0fdf4);
            border-color: var(--color-border-success, #86efac);
            color: var(--color-text-success, #166534);
        }
        ._sem-btn-gpt:hover { filter: brightness(.96); }

        ._sem-toast-inline {
            display: none;
            align-items: center;
            gap: 5px;
            font-size: 11.5px;
            color: var(--color-text-secondary, #6b7280);
            animation: _sem-in .15s ease;
        }
        ._sem-toast-inline.show { display: flex; }

        @media (max-width: 640px) {
            #_sem-box { width: 99%; max-height: 96vh; border-radius: 10px; }
            #_sem-breadcrumb { display: none; }
            #_sem-footer { flex-wrap: wrap; gap: 10px; }
        }
    </style>

    <div id="_sem-box">
        <div id="_sem-header">
            <span id="_sem-badge">
                ⚠ Exception${historyBadge}
            </span>
            <span id="_sem-breadcrumb">${buildBreadcrumb()}</span>
            <button class="_sem-btn-close-hd" id="_sem-close" aria-label="Close">&times;</button>
        </div>

        <div id="_sem-body">
            <!-- content injected below -->
        </div>

        <div id="_sem-footer">
            <div id="_sem-footer-left">
                <span id="_sem-hint" style="display:flex;align-items:center;gap:5px">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
                    Esc untuk menutup
                    &nbsp;·&nbsp;
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    ${new Date().toLocaleTimeString("id-ID")}
                </span>
                <span id="_sem-toast" class="_sem-toast-inline" aria-live="polite">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    <span id="_sem-toast-msg"></span>
                </span>
            </div>
            <div class="_sem-actions">
                <button class="_sem-btn" id="_sem-copy">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy error
                </button>
                <button class="_sem-btn _sem-btn-gpt" id="_sem-gpt">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                    Ask ChatGPT
                </button>
            </div>
        </div>
    </div>`;

        document.body.appendChild(modal);

        // ── Inject content ────────────────────────────────────────
        const body = modal.querySelector("#_sem-body");

        if (isJson) {
            const div = document.createElement("div");
            div.innerHTML = formatLaravelError(parsedJson);
            body.appendChild(div);
        } else {
            const iframe = document.createElement("iframe");
            iframe.setAttribute("sandbox", "allow-same-origin allow-scripts");
            iframe.style.cssText = "width:100%;border:none;min-height:400px;flex:1;border-radius:6px";
            body.appendChild(iframe);
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open(); doc.write(rawHtmlOrJson); doc.close();
        }

        // ── Toast (inline in footer left) ────────────────────────
        function showToast(msg) {
            const hint = modal.querySelector("#_sem-hint");
            const toast = modal.querySelector("#_sem-toast");
            const tm = modal.querySelector("#_sem-toast-msg");
            hint.style.display = "none";
            tm.textContent = msg;
            toast.classList.add("show");
            clearTimeout(toast._tid);
            toast._tid = setTimeout(() => {
                toast.classList.remove("show");
                hint.style.display = "flex";
            }, 3000);
        }

        // ── Wire buttons ──────────────────────────────────────────
        modal.querySelector("#_sem-copy").onclick = function () {
            copyToClipboard(this);
        };
        modal.querySelector("#_sem-gpt").onclick = function () {
            openGPT(this);
        };
        modal.querySelector("#_sem-close").onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        const onKey = (e) => {
            if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", onKey); }
        };
        document.addEventListener("keydown", onKey);
    }

    // ── Format JSON exception ─────────────────────────────────────
    function formatLaravelError(err) {
        const message = err.message || "Unknown error";
        const exception = err.exception || "—";
        const file = err.file || "—";
        const line = err.line || "—";
        const trace = err.trace || {};
        const frames = Object.values(trace);

        let framesHtml = "";
        frames.forEach((frame, idx) => {
            const ffile = frame.file || "unknown";
            const fline = frame.line || "";
            const func = frame.function || "";
            const cls = frame.class || "";
            const type = frame.type || "";
            const full = cls ? `${cls}${type}${func}()` : `${func}()`;
            framesHtml += `
            <div class="_sem-frame">
                <span class="_sem-frame-num">#${idx}</span>
                <div class="_sem-frame-info">
                    <div class="_sem-frame-fn">${full}</div>
                    <div class="_sem-frame-file">${ffile}${fline ? `:<span class="_sem-frame-line">${fline}</span>` : ""}</div>
                </div>
            </div>`;
        });

        return `
        <div class="_sem-msg">${message}</div>
        <div class="_sem-meta">
            <span class="_sem-meta-label">Exception</span>
            <span class="_sem-meta-val">${exception}</span>
            <span class="_sem-meta-label">File</span>
            <span class="_sem-meta-val">${file}</span>
            <span class="_sem-meta-label">Line</span>
            <span class="_sem-meta-val is-line">${line}</span>
        </div>
        <div class="_sem-divider"></div>
        <div class="_sem-trace-head">Stack trace &nbsp;·&nbsp; ${frames.length} frames</div>
        ${framesHtml}`;
    }

    /*==============================
    LIVE DOM AUTO EVAL SCRIPT
    ==============================*/

    const scriptCache = new Set();

    /**
     * Executes script tags within a given container. Handles both inline and external scripts.
     * Prevents re-execution of external scripts that have already been loaded.
     * @param {Element} container - The DOM element containing the scripts.
     */
    function executeScripts(container) {
        const scripts = container.querySelectorAll("script");

        scripts.forEach((oldScript) => {
            const isExternal = oldScript.src?.trim() !== "";

            if (isExternal) {
                const src = oldScript.src;

                if (scriptCache.has(src)) return;

                const newScript = document.createElement("script");
                newScript.src = src;
                newScript.async = false;

                for (const attr of oldScript.attributes) {
                    if (attr.name !== "src") {
                        newScript.setAttribute(attr.name, attr.value);
                    }
                }

                document.head.appendChild(newScript);
                scriptCache.add(src);
            } else {
                // For inline scripts, wrap them in an IIFE to ensure isolated execution context
                // and prevent variable leakage or conflicts if re-executed.
                const newScript = document.createElement("script");
                let code = oldScript.textContent || "";
                const trimmed = code.trim();

                // Check if the script is already wrapped in an IIFE or async IIFE
                const isAlreadyWrapped =
                    /^\s*\(?\s*(?:function\s*\(|async\s+function\s*\()/i.test(
                        trimmed,
                    );

                if (!isAlreadyWrapped) {
                    code = `(function () {\n${code}\n})();`;
                }

                newScript.textContent = code;

                for (const attr of oldScript.attributes) {
                    if (attr.name !== "src") {
                        newScript.setAttribute(attr.name, attr.value);
                    }
                }

                document.head.appendChild(newScript);

                // FIX (bug #2): script inline langsung tereksekusi secara
                // synchronous begitu di-append (bukan lewat network seperti
                // script eksternal), jadi elemennya tidak perlu terus
                // menempel di <head>. Kalau dibiarkan, setiap navigasi SPA
                // menambah 1 elemen <script> baru ke <head> selamanya
                // (memory leak yang tumbuh terus seiring lamanya sesi).
                newScript.remove();
            }
        });
    }

    /*==============================
      EVENT DELEGATION REGISTRY
      (pengganti jQuery namespaced .on()/.off() — setiap listener yang
      didaftarkan lewat delegate()/delegateHover() dicatat di sini per
      namespace, supaya undelegateNamespace() bisa melepas semuanya
      sekaligus sebelum initLiveDom() mendaftarkan ulang. Ini yang mencegah
      handler menumpuk setiap kali live-dom:afterUpdate / afterSpa terjadi
      — persis alasan kenapa versi jQuery pakai namespace ".liveDomCore".)
    ==============================*/
    const _liveDomCoreListeners = {};

    function delegate(namespace, type, selector, handler, options) {
        const listener = function (e) {
            const target = e.target && e.target.closest
                ? e.target.closest(selector)
                : null;
            if (!target) return;
            handler.call(target, e, target);
        };
        document.addEventListener(type, listener, options);
        if (!_liveDomCoreListeners[namespace]) _liveDomCoreListeners[namespace] = [];
        _liveDomCoreListeners[namespace].push({ type, listener, options });
    }

    // mouseenter/mouseleave asli tidak bubbling, jadi didelegasikan lewat
    // mouseover/mouseout + pengecekan relatedTarget (persis cara jQuery
    // mensimulasikan delegated mouseenter/mouseleave).
    function delegateHover(namespace, selector, handler) {
        const makeListener = () => (e) => {
            const target = e.target && e.target.closest
                ? e.target.closest(selector)
                : null;
            if (!target) return;
            if (e.relatedTarget && target.contains(e.relatedTarget)) return;
            handler.call(target, e, target);
        };
        const overListener = makeListener();
        const outListener = makeListener();

        document.addEventListener("mouseover", overListener);
        document.addEventListener("mouseout", outListener);

        if (!_liveDomCoreListeners[namespace]) _liveDomCoreListeners[namespace] = [];
        _liveDomCoreListeners[namespace].push(
            { type: "mouseover", listener: overListener },
            { type: "mouseout", listener: outListener },
        );
    }

    function undelegateNamespace(namespace) {
        const entries = _liveDomCoreListeners[namespace] || [];
        entries.forEach(({ type, listener, options }) => {
            document.removeEventListener(type, listener, options);
        });
        _liveDomCoreListeners[namespace] = [];
    }

    function handleLiveBind() {
        // FIX (bug #1): namespaced + off-before-on supaya handler tidak
        // menumpuk setiap kali initLiveDom() dipanggil ulang (live-dom:afterUpdate / afterSpa).
        undelegateNamespace("liveDomBind");

        const bindHandler = (e, target) => {
            const name = target.getAttribute("name");
            if (!name) return;

            const value =
                target.type === "checkbox" ? target.checked : target.value;

            qsa(`[live-bind="${name}"]`).forEach((bindEl) => {
                if (isEl(bindEl, "input, textarea, select")) {
                    bindEl.value = value;
                } else {
                    bindEl.textContent = value;
                }
            });
        };

        delegate(
            "liveDomBind",
            "input",
            "input[name], select[name], textarea[name]",
            bindHandler,
        );
        delegate(
            "liveDomBind",
            "change",
            "input[name], select[name], textarea[name]",
            bindHandler,
        );
    }

    /*==============================
      LIVE DOM HOOKS & INITIALIZATION
    ==============================*/

    /**
     * Binds all initial live DOM event handlers.
     *
     * FIX (bug #1): initLiveDom() dipanggil ulang setiap kali ada event
     * "live-dom:afterUpdate" / "live-dom:afterSpa" (yaitu setiap aksi ajax
     * ATAU setiap navigasi SPA). Karena jQuery `.on()` tidak menggantikan
     * handler lama, tanpa namespace + `.off()` di sini, delegated handler
     * akan MENUMPUK setiap kali fungsi ini terpanggil ulang -> satu klik
     * bisa memicu N request ajax duplikat setelah N kali update/navigasi.
     * Solusinya: pakai namespace ".liveDomCore" dan `.off()` semua handler
     * lama dengan namespace itu sebelum mendaftarkan yang baru.
     */
    function bindLiveDomEvents() {
        undelegateNamespace("liveDomCore");

        delegate("liveDomCore", "click", "[live-click]", (e, target) => {
            handleLiveEvent(target, "click");
        });

        delegateHover("liveDomCore", "[live-hover]", (e, target) => {
            handleLiveEvent(target, "hover");
        });

        delegate("liveDomCore", "change", "[live-change]", (e, target) => {
            handleLiveEvent(target, "change");
        });

        delegate("liveDomCore", "submit", "[live-submit]", (e, target) => {
            e.preventDefault();
            handleLiveEvent(target, "submit");
        });

        delegate("liveDomCore", "keyup", "[live-keyup]", (e, target) => {
            handleLiveEvent(target, "keyup");
        });

        delegate("liveDomCore", "input", "[live-input]", (e, target) => {
            handleLiveEvent(target, "input");
        });

        delegate("liveDomCore", "input", "[live-bind]", (e, target) => {
            handleLiveEvent(target, "input");
        });

        // event binding, pakai debounce
        const debouncedDirectives = debounce((e, target) => {
            const scope = closestAncestor(target, "[live-scope]");
            handleLiveDirectives(scope);
        }, 200); // delay 200ms

        delegate(
            "liveDomCore",
            "input",
            "[live-scope] input, [live-scope] select, [live-scope] textarea",
            debouncedDirectives,
        );
        delegate(
            "liveDomCore",
            "change",
            "[live-scope] input, [live-scope] select, [live-scope] textarea",
            debouncedDirectives,
        );

        delegate(
            "liveDomCore",
            "click",
            '[live-spa-region] a[href]:not([href^="#"]):not([href=""])',
            (e, target) => {
                const url = target.getAttribute("href");
                if (!url || isSpaExcluded(url)) return;
                e.preventDefault();
                loadSpaContent(url);
            },
        );

        delegate(
            "liveDomCore",
            "submit",
            "[live-spa-region] form",
            (e, target) => {
                const form = target;
                const url = form.action || "";
                const method = form.method.toUpperCase() || "GET";

                if (isSpaExcluded(url)) return;
                e.preventDefault();

                if (method === "GET") {
                    const formParams = new URLSearchParams(new FormData(form));
                    const existingUrl = new URL(url, window.location.origin);
                    formParams.forEach((value, key) => {
                        existingUrl.searchParams.set(key, value);
                    });
                    const fullUrl = existingUrl.toString();

                    spaFetchGet(fullUrl)
                        .then((html) => {
                            updateSpaRegions(html);
                            dispatchSpaEvents(fullUrl);
                            history.replaceState(
                                {
                                    spa: true,
                                    url: fullUrl,
                                },
                                "",
                                fullUrl,
                            );
                        })
                        .catch((err) => {
                            if (err.name === "AbortError") return;
                            console.error("SPA GET error:", err);
                        });
                    return;
                }

                ajaxSpaFormSubmit(form, function (response) {
                    if (typeof response === "string") {
                        updateSpaRegions(response);
                        dispatchSpaEvents(url);
                        history.pushState(
                            {
                                spa: true,
                                url,
                            },
                            "",
                            url,
                        );
                    } else if (
                        response &&
                        typeof response === "object" &&
                        response.redirect
                    ) {
                        console.log("SPA redirect handled.");
                    } else {
                        console.log(
                            "Form SPA submit success (non-redirect):",
                            response,
                        );
                    }
                });
            },
        );
    }

    // FIX (bug #4): dulu blok "SPA state awal" ada di dalam initLiveDom() dan
    // history.replaceState() jalan SETIAP kali initLiveDom() dipanggil ulang
    // — padahal itu terjadi di setiap aksi ajax biasa juga (bukan cuma SPA),
    // jadi history state ditimpa berkali-kali tanpa perlu. Cukup jalan sekali.
    let spaHistoryInitialized = false;

    function initLiveDom() {
        initLoadingBar(); // loading bar
        handleLiveBind(); // live-bind
        bindLiveDomEvents(); // event handler utama
        handlePollers(); // pollers (live-poll)
        // handleLiveComputeUnified();     // inisialisasi live-compute
        // handleLiveDirectives();

        // SPA state awal — cukup sekali per page load
        if (
            !spaHistoryInitialized &&
            document.querySelector('[live-spa-region="main"]')
        ) {
            spaHistoryInitialized = true;
            const currentUrl = window.location.href;
            history.replaceState(
                { spa: true, url: currentUrl },
                "",
                currentUrl,
            );
        }

        // Dispatch event agar ekstensi luar bisa ikut hook
        document.dispatchEvent(new CustomEvent("live-dom:init"));
    }

    // Event listener for general DOM updates
    document.addEventListener("live-dom:afterUpdate", function () {
        initLiveDom();
        handleLiveDirectives();
    });

    // Event listener after SPA content loads
    document.addEventListener("live-dom:afterSpa", function () {
        initLiveDom();
    });

    // Handle browser's back/forward buttons for SPA
    window.addEventListener("popstate", function (event) {
        if (event.state && event.state.spa && event.state.url) {
            loadSpaContent(event.state.url, false); // false to prevent pushing state again
        }
    });

    // window.ajaxDynamic = ajaxDynamic;
    window.debouncedAjaxDynamic = debouncedAjaxDynamic;
    window.autoBindDomFromResponse = autoBindDomFromResponse;
    window.runAjaxRequest = runAjaxRequest;

    // Initial setup when the DOM is ready
    function domReady(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    domReady(function () {
        initLiveDom();
        handleLiveComputeUnified();
        handleLiveDirectives();
    });
})();