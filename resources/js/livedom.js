(function ($) {
    "use strict";

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

    function ajaxDynamicOld(
        method = "POST",
        controller,
        action,
        data = {},
        target = "html",
        targetId = "#",
        loading = true,
        callback = null,
        useCache = false, // ✅ opsi baru: default false (fresh data)
    ) {
        const key =
            targetId ||
            `${controller}_${action}_${method}_${JSON.stringify(data)}`;

        // ✅ Jika ada request sebelumnya ke target yang sama → batalkan
        if (ajaxDynamicControllers[key]) {
            ajaxDynamicControllers[key].abort();
        }

        // ✅ Jika ada cache → pakai lalu hapus (single-use)
        if (useCache && ajaxCache.has(key)) {
            const response = ajaxCache.get(key);
            ajaxCache.delete(key); // auto clear setelah dipakai

            if (typeof callback === "function") {
                callback(response);
            } else {
                callBackAjaxDynamic(target, targetId, response);
            }
            return;
        }

        const abortController = new AbortController();
        ajaxDynamicControllers[key] = abortController;

        if (loading) {
            $(".loading").show();
        }

        const isFormData = data instanceof FormData;

        $.ajax({
            url: `/ajax/${controller}/${action}`,
            method: method,
            headers:
                method !== "GET"
                    ? {
                        "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr(
                            "content",
                        ),
                    }
                    : {},

            data:
                method === "GET"
                    ? data
                    : isFormData
                        ? data
                        : JSON.stringify(data),
            contentType:
                method === "GET"
                    ? undefined
                    : isFormData
                        ? false
                        : "application/json",
            processData: isFormData ? false : true,
            cache: false,
            signal: abortController.signal,

            success: function (response) {
                if (loading) {
                    $(".loading").hide();
                }

                delete ajaxDynamicControllers[key];

                // ✅ simpan ke cache sekali saja (auto clear dipakai lagi)
                if (useCache) {
                    ajaxCache.set(key, response);
                }

                if (typeof callback === "function") {
                    callback(response);
                } else {
                    callBackAjaxDynamic(target, targetId, response);
                }
            },

            error: function (jqXHR, textStatus) {
                if (loading) {
                    targetId !== "#"
                        ? hideTargetLoading(targetId)
                        : $(".loading").hide();
                }

                delete ajaxDynamicControllers[key];

                if (textStatus === "abort") {
                    console.log(
                        `[AJAX Dynamic] Request to /ajax/${controller}/${action} was aborted.`,
                    );
                    return;
                }

                const contentType =
                    jqXHR.getResponseHeader("content-type") || "";
                const isHtmlResponse = contentType.includes("text/html");

                if (isHtmlResponse) {
                    showErrorModal(jqXHR.responseText);
                    return;
                }

                let json = {};
                try {
                    json = jqXHR.responseJSON || JSON.parse(jqXHR.responseText);
                } catch (e) {
                    json = {
                        message: "Unparsable response",
                        raw: jqXHR.responseText,
                    };
                }
                showErrorModal(json);
            },
        });
    }

    function ajaxDynamic(
        method = "POST",
        controller,
        action,
        data = {},
        target = "html",
        targetId = "#",
        loading = true,
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

        if (loading) $(".loading").show();

        const isFormData = data instanceof FormData;

        // 🔥 Deteksi elemen pemicu LiveDOM
        const $trigger = $(document.activeElement).closest(
            "[live-click], [live-change]",
        );
        const isRealtime = $trigger.attr("live-realtime") === "true";
        const liveTarget = $trigger.attr("live-target") || targetId || "auto";

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

        console.log("🚀 Sending $.ajax to", `/ajax/${controller}/${action}`);

        $.ajax({
            url: `/ajax/${controller}/${action}`,
            method: method,
            headers: {
                ...(method !== "GET" && {
                    "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr(
                        "content",
                    ),
                }),
                ...(isRealtime && { "X-Live-Reverb": "true" }),
            },
            data:
                method === "GET"
                    ? data
                    : isFormData
                        ? data
                        : JSON.stringify(data),
            contentType:
                method === "GET"
                    ? undefined
                    : isFormData
                        ? false
                        : "application/json",
            processData: isFormData ? false : true,
            cache: false,
            signal: abortController.signal,

            success: function (response) {
                console.log("✅ SUCCESS fired", response);
                if (loading) $(".loading").hide();
                delete ajaxDynamicControllers[key];
                if (useCache) ajaxCache.set(key, response);

                // ⚡ Jika server sudah melakukan broadcast realtime → skip render lokal
                if (
                    response.message?.includes(
                        "Broadcasted via ReverbDynamic",
                    ) ||
                    response.realtime === true
                ) {
                    console.log(
                        "[ReverbDynamic] Broadcasted realtime — skip local DOM update.",
                    );
                    return;
                }

                if (typeof callback === "function") callback(response);
                else callBackAjaxDynamic(target, targetId, response);
            },

            error: function (jqXHR, textStatus) {
                try {
                    if (loading)
                        targetId !== "#"
                            ? hideTargetLoading(targetId)
                            : $(".loading").hide();
                } catch (e) { }

                delete ajaxDynamicControllers[key];

                if (textStatus === "abort") { return; }

                // ✅ Debug mode → langsung toast, skip modal detail
                if (!IS_DEBUG) {
                    const msg = jqXHR.responseJSON?.message || "Terjadi kesalahan.";
                    showProductionErrorToast(msg);
                    return;
                }

                // 🛠️ Development mode → tampilkan detail error
                const contentType = jqXHR.getResponseHeader("content-type") || "";

                if (contentType.includes("text/html")) {
                    showErrorModal(jqXHR.responseText);
                    return;
                }

                let json = {};
                try {
                    json = jqXHR.responseJSON || JSON.parse(jqXHR.responseText);
                } catch {
                    json = { message: "Unparsable response", raw: jqXHR.responseText };
                }

                if (json.production_error) {
                    showProductionErrorToast(json.message || "Terjadi kesalahan.");
                    return;
                }

                showErrorModal(json);
            },
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
                $(`${targetId}`).html(response.data);
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

    /**
     * Displays a loading overlay on the specified target element.
     * @param {string} targetId - The CSS selector of the element to show loading on.
     */
    function showTargetLoading(targetId) {
        const $target = $(targetId);
        if ($target.length === 0) return;

        $target.find(".dynamic-loading-overlay").remove();

        const $overlay = $(`
      <div class="dynamic-loading-overlay" style="
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50;
        border-radius: inherit;
        animation: fadeIn 0.3s ease-in-out;
      ">
        <div class="spinner-glow"></div>
      </div>
    `);

        const spinnerStyle = `
      @keyframes spinnerFade {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }

      .spinner-glow {
        width: 32px;
        height: 32px;
        border-radius: 9999px;
        background: linear-gradient(135deg, #6366f1, #ec4899);
        animation: spinnerFade 1s infinite ease-in-out;
        box-shadow: 0 0 10px rgba(99,102,241,0.4), 0 0 20px rgba(236,72,153,0.3);
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .dynamic-loading-overlay {
        transition: opacity 0.3s ease;
      }
    `;

        if (!$("head").find("#spinner-style").length) {
            $("head").append(
                `<style id="spinner-style">${spinnerStyle}</style>`,
            );
        }

        if ($target.css("position") === "static") {
            $target.css("position", "relative");
        }

        $target.append($overlay);
    }

    /**
     * Hides the loading overlay on the specified target element.
     * @param {string} targetId - The CSS selector of the element to hide loading from.
     */
    function hideTargetLoading(targetId) {
        const $target = $(targetId);
        $target.find(".dynamic-loading-overlay").fadeOut(300, function () {
            $(this).remove();
        });
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
                const $el = $(selector);
                // if ($el.is('input, textarea, select')) {
                //     $el.val(value);
                //     $el.each(function () {
                //         this.dispatchEvent(new Event('input', {
                //             bubbles: true
                //         }));
                //         this.dispatchEvent(new Event('change', {
                //             bubbles: true
                //         }));
                //     });
                // } else {
                //     $el.html(value);
                // }

                if ($el.is("input, textarea, select")) {
                    if ($el.val() !== String(value)) {
                        $el.val(value);
                        $el.each(function () {
                            this.dispatchEvent(
                                new Event("input", { bubbles: true }),
                            );
                            this.dispatchEvent(
                                new Event("change", { bubbles: true }),
                            );
                        });
                    }
                } else {
                    $el.html(value);
                }
            }
        });
    }

    /**
     * Resolves the HTTP method type based on the element and event.
     * @param {jQuery} $el - The jQuery object of the triggering element.
     * @param {string} eventType - The event type (e.g., 'submit').
     * @param {jQuery} formSelector - The jQuery object of the closest form.
     * @returns {string} The resolved HTTP method.
     */
    function resolveMethodType($el, eventType, formSelector) {
        let methodType = "POST";
        if (eventType === "submit" && formSelector) {
            methodType = (
                $(formSelector).attr("method") || "POST"
            ).toUpperCase();
        }
        if ($el.attr("live-method")) {
            methodType = $el.attr("live-method").toUpperCase();
        }
        return methodType;
    }

    /**
     * Extracts data from the closest form or live-scope.
     * @param {jQuery} $el - The jQuery object of the triggering element.
     * @param {jQuery} formSelector - The jQuery object of the closest form.
     * @returns {object|FormData} The extracted data.
     */

    // function extractData($el, $form) {
    //     let formData = new FormData();

    //     if ($form && $form.length) {
    //         // Jika event berasal dari sebuah form → ambil form tersebut
    //         $form.find('input[name], select[name], textarea[name]').each(function () {
    //             appendInputToFormData(formData, this);
    //         });

    //     } else {
    //         console.log('test');
    //         // Jika TIDAK ADA form → ambil SEMUA form di dalam live-scope
    //         const $scope = $el.closest('[live-scope]');
    //         const $forms = $scope.find('form');

    //         if ($forms.length > 0) {
    //             // Loop semua form dalam scope
    //             $forms.each(function () {
    //                 $(this)
    //                     .find('input[name], select[name], textarea[name]')
    //                     .each(function () {
    //                         appendInputToFormData(formData, this);
    //                     });
    //             });
    //         } else {
    //             // Jika scope memang tidak punya form sama sekali → fallback:
    //             $scope.find('input[name], select[name], textarea[name]').each(function () {
    //                 appendInputToFormData(formData, this);
    //             });
    //         }
    //     }

    //     return formData;
    // }

    // function extractData($el, $form) {
    //     const formData = new FormData();
    //     const $scope = $el.closest('[live-scope]');

    //     if (!$scope.length) return formData;

    //     const appended = new Set(); // cegah duplicate

    //     const appendSafe = (el) => {
    //         if (!el.name) return;
    //         if (appended.has(el)) return;

    //         appendInputToFormData(formData, el);
    //         appended.add(el);
    //     };

    //     // 1️⃣ Jika event berasal dari FORM → ambil form tersebut dulu
    //     if ($form && $form.length) {
    //         $form
    //             .find('input[name], select[name], textarea[name]')
    //             .each(function () {
    //                 appendSafe(this);
    //             });
    //     }

    //     // 2️⃣ Ambil SEMUA input di scope (termasuk di form lain & luar form)
    //     $scope
    //         .find('input[name], select[name], textarea[name]')
    //         .each(function () {
    //             appendSafe(this);
    //         });

    //     return formData;
    // }

    function extractData($el, $form, selector = null) {
        const formData = new FormData();
        const appended = new Set();

        const appendSafe = (el) => {
            if (!el.name || appended.has(el)) return;
            appendInputToFormData(formData, el);
            appended.add(el);
        };

        let $root;

        // SKENARIO A: Jika ada selector spesifik (misal: live-click="updateDimension('#tr-1')")
        if (
            selector &&
            typeof selector === "string" &&
            (selector.startsWith("#") || selector.startsWith("."))
        ) {
            $root = $(selector);
        }
        // SKENARIO B: Tanpa parameter, ambil scope terdekat (Konsep Lama)
        else {
            $root = $el.closest("[live-scope]");
        }

        if (!$root || !$root.length) return formData;

        // AMBIL DATA HANYA DARI ROOT YANG TERPILIH
        // .find() akan mencari input di dalam elemen tersebut
        // .addBack() memastikan jika $root itu sendiri adalah input, nilainya tetap terambil
        $root
            .find("input[name], select[name], textarea[name]")
            .addBack("input[name], select[name], textarea[name]")
            .each(function () {
                appendSafe(this);
            });

        return formData;
    }

    function appendInputToFormData(fd, el) {
        const $input = $(el);
        const name = $input.attr("name");
        if (!name) return;

        if ($input.is(":file")) {
            const files = $input[0].files;
            for (let i = 0; i < files.length; i++) {
                fd.append(name, files[i]);
            }
        } else if ($input.is(":checkbox")) {
            if ($input.is(":checked")) {
                fd.append(name, $input.val());
            }
        } else if ($input.is(":radio")) {
            if ($input.is(":checked")) {
                fd.append(name, $input.val());
            }
        } else {
            fd.append(name, $input.val());
        }
    }

    /**
     * Live conditionals: show, class, style, attr
     */
    function evaluateExpr(expr, $el) {
        const $scope = $el.closest("[live-scope]");
        const inputs = {};

        $scope
            .find("input[name], select[name], textarea[name]")
            .each(function () {
                const name = $(this).attr("name");
                if (!name) return;
                let val;
                if ($(this).is(":checkbox")) {
                    val = $(this).is(":checked") ? $(this).val() : null;
                } else if ($(this).is(":radio")) {
                    if ($(this).is(":checked")) val = $(this).val();
                } else {
                    val = $(this).val();
                }

                const safeName = name
                    .replace(/\]\[|\[|\]/g, "_")
                    .replace(/_+$/, "");
                const numVal = parseFloat(String(val).replace(/[^\d.-]/g, ""));
                inputs[safeName] = isNaN(numVal) ? val : numVal;
            });

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

    function parseLiveAttr($el) {
        if (liveAttrCache.has($el[0])) {
            return liveAttrCache.get($el[0]);
        }
        const expr = $el.attr("live-attr");
        if (!expr) return [];
        const parsed = expr.split(",").map((pair) => {
            const [attr, js] = pair.split(":");
            return { attr: attr.trim(), js: js.trim() };
        });
        liveAttrCache.set($el[0], parsed);
        return parsed;
    }

    function handleLiveDirectives(scope) {
        const $scope = scope ? $(scope) : $(document);

        $scope.find("[live-show]").each(function () {
            const expr = $(this).attr("live-show");
            const result = evaluateExpr(expr, $(this));
            $(this).toggle(!!result);
        });

        $scope.find("[live-class]").each(function () {
            const expr = $(this).attr("live-class");
            const result = evaluateExpr(expr, $(this));
            if (typeof result === "string") {
                $(this).attr(
                    "class",
                    ($(this).attr("class-base") || "") + " " + result,
                );
            }
        });

        $scope.find("[live-style]").each(function () {
            const expr = $(this).attr("live-style");
            const result = evaluateExpr(expr, $(this));
            if (typeof result === "string") {
                $(this).attr("style", result);
            }
        });

        $scope.find("[live-attr]").each(function () {
            const parsed = parseLiveAttr($(this));
            parsed.forEach(({ attr, js }) => {
                const result = evaluateExpr(js, $(this));
                if (result === false || result == null) {
                    $(this).removeAttr(attr);
                } else {
                    $(this).attr(attr, result === true ? attr : result);
                }
            });
        });
    }

    /**
     * Extracts content from an element (e.g., its value for inputs, or HTML content).
     * @param {jQuery} $el - The jQuery element.
     * @returns {string} The extracted content.
     */
    function extractElementContent($el) {
        if ($el.is("input, textarea, select")) {
            return $el.val();
        }
        return $el.html();
    }

    /**
     * Resolves target elements based on a selector string, supporting various jQuery traversal methods.
     * @param {jQuery} $el - The reference jQuery element.
     * @param {string} targetSelector - The selector string (e.g., 'closest(.parent-class)', '#my-id', 'self').
     * @returns {jQuery} A jQuery collection of the resolved target elements.
     */
    function liveTarget($el, targetSelector) {
        const targets = [];
        const selectors = targetSelector.split(",").map((s) => s.trim());

        for (let sel of selectors) {
            let $target = null;

            const match = sel.match(/^(\w+)(\(([^)]+)\))?$/);
            if (match) {
                const method = match[1];
                const param = match[3] ? match[3].trim() : null;

                switch (method) {
                    case "closest":
                        if (param) $target = $el.closest(param);
                        break;
                    case "find":
                        if (param) $target = $el.find(param);
                        break;
                    case "parent":
                        $target = $el.parent();
                        break;
                    case "children":
                        $target = $el.children(param || undefined);
                        break;
                    case "next":
                        $target = param ? $el.next(param) : $el.next();
                        break;
                    case "prev":
                        $target = param ? $el.prev(param) : $el.prev();
                        break;
                    case "siblings":
                        $target = param ? $el.siblings(param) : $el.siblings();
                        break;
                    case "self":
                        $target = $el;
                        break;
                    default:
                        $target = $(sel);
                        break;
                }
            } else {
                $target = $(sel);
            }

            if ($target && $target.length) {
                targets.push(...$target.toArray());
            }
        }
        return $(targets);
    }

    /**
     * Handles live events (click, hover, change, etc.) by triggering AJAX calls or local DOM updates.
     * @param {jQuery} $el - The jQuery object of the triggering element.
     * @param {string} eventType - The type of event (e.g., 'click', 'change').
     */
    function handleLiveEvent($el, eventType) {
        const rawMethods = $el.attr(`live-${eventType}`);
        const rawTargets = $el.attr("live-target") || "";
        const domAction = $el.attr("live-dom") || "auto";
        const formSelector = $el.closest("form").length
            ? $el.closest("form")
            : null;
        const controller = $el.closest("[live-scope]").attr("live-scope");
        if (!controller && rawMethods) {
            console.warn(
                `[Live Event] Element with live-${eventType} needs a live-scope attribute on an ancestor.`,
                $el[0],
            );
            return;
        }

        const loading = $el.attr("live-loading") === "true";
        const loadingIndicator = $el.attr("live-loading-indicator");
        const dataArgs = $el.attr("live-data");

        const beforeCallback = $el.attr("live-callback-before");
        const execute = () => {
            const methodType = resolveMethodType($el, eventType, formSelector);

            // Jangan jalankan extractData di sini!
            // Kita pindahkan ke dalam loop agar lebih spesifik.

            if (loadingIndicator) $(loadingIndicator).show();

            if (!rawMethods) {
                return runLocalUpdate($el, domAction, rawTargets);
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
                        )($el[0]);

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
                            return $(arg).is("input, select, textarea")
                                ? $(arg).val()
                                : $(arg).text().trim();
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
                const $targets = targetSel ? liveTarget($el, targetSel) : $el;

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
                    // PAKSA hanya ambil dari selector, jangan kirim formSelector agar tidak bocor
                    postData = extractData($el, null, firstArg);
                } else if (args && args.length > 0) {
                    const dataPayload = args.length === 1 ? args[0] : args;
                    postData = { data: dataPayload };
                } else {
                    // Ambil semua (default)
                    postData = extractData($el, formSelector);
                }

                runAjaxRequest(
                    methodType,
                    controller,
                    method,
                    postData,
                    domAction,
                    $targets,
                    loading,
                    $el,
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
                    )($el[0]);
                } else {
                    // Kalau hanya nama fungsi, panggil window[fnName]($el[0])
                    const fn = window[beforeCallback.trim()];
                    if (typeof fn === "function") {
                        result = fn($el[0]);
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
     * @param {jQuery} $targets - jQuery collection of target elements.
     * @param {boolean} loading - Whether to show loading.
     * @param {jQuery} $el - The original triggering element.
     */
    function runAjaxRequest(
        methodType,
        controller,
        method,
        data,
        domAction,
        $targets,
        loading,
        $el = null,
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
                $targets.each(function () {
                    applyDomAction($(this), domAction, responseData);
                });
            }

            if ($el && $el.attr) {
                const afterCallback = $el.attr("live-callback-after");
                if (
                    afterCallback &&
                    typeof window[afterCallback] === "function"
                ) {
                    window[afterCallback]($el[0], response);
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
     * @param {jQuery} $el - The triggering element.
     * @param {string} domAction - How to apply the content to the DOM.
     * @param {string} rawTargets - Raw target selector string.
     */
    function runLocalUpdate($el, domAction, rawTargets) {
        const targetSel = rawTargets || "";
        const $targets = targetSel ? liveTarget($el, targetSel) : $el;
        if (domAction === "remove") {
            $targets.remove();
            // initLiveDom();
            return;
        }

        const content = extractElementContent($el);
        $targets.each(function () {
            applyDomAction($(this), domAction, content);
        });
    }

    /**
     * Applies content to a target element using a specified DOM action.
     * @param {jQuery} $target - The target element.
     * @param {string} action - The DOM action (e.g., 'html', 'append', 'value').
     * @param {string} content - The content to apply.
     */
    function applyDomAction($targets, actions, contents) {
        // Pastikan $targets adalah jQuery object array
        $targets = $targets instanceof jQuery ? $targets : $($targets);

        // Split actions dan contents jika berupa string multiple
        const actionList =
            typeof actions === "string" ? actions.split(",") : [actions];
        const contentList =
            typeof contents === "object" && !Array.isArray(contents)
                ? [contents]
                : Array.isArray(contents)
                    ? contents
                    : [contents];

        $targets.each(function (targetIndex) {
            const $currentTarget = $(this);

            actionList.forEach((action, actionIndex) => {
                const content =
                    contentList[actionIndex] || contentList[0] || "";
                const trimmedAction = action.trim();

                // console.log(`Applying to target ${targetIndex}:`, {
                //     target: $currentTarget,
                //     action: trimmedAction,
                //     content: content
                // });

                switch (trimmedAction) {
                    case "append":
                        $currentTarget.append(content);
                        break;
                    case "prepend":
                        $currentTarget.prepend(content);
                        break;
                    case "before":
                        $currentTarget.before(content);
                        break;
                    case "after":
                        $currentTarget.after(content);
                        break;
                    case "value":
                    case "val":
                        $currentTarget.val(content).trigger("change");
                        $currentTarget.trigger("input");
                        $currentTarget.trigger("change");
                        break;
                    case "text":
                        $currentTarget.text(content);
                        break;
                    case "html":
                        $currentTarget.html(content);
                        break;
                    case "toggle":
                        $currentTarget.toggle(content);
                        break;
                    case "show":
                        $currentTarget.show();
                        break;
                    case "hide":
                        $currentTarget.hide();
                        break;
                    case "remove":
                        $currentTarget.remove();
                        break;
                    default:
                        // console.warn(`Unknown action: ${trimmedAction}`);
                        // $currentTarget.html(content);
                        // ============================
                        // AUTO MODE → jika tidak ada live-dom (actions = '' atau undefined)
                        // ============================

                        if (
                            !actions ||
                            actions.trim() === "" ||
                            actions.trim() === "auto"
                        ) {
                            if ($currentTarget.is("input, textarea, select")) {
                                $currentTarget
                                    .val(content)
                                    .trigger("input")
                                    .trigger("change");
                            } else {
                                $currentTarget.html(content);
                            }
                            break;
                        }

                        // fallback: anggap text/html
                        if ($currentTarget.is("input, textarea, select")) {
                            $currentTarget
                                .val(content)
                                .trigger("input")
                                .trigger("change");
                        } else {
                            $currentTarget.html(content);
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
    function handlePollers() {
        $("[live-poll]").each(function () {
            const $el = $(this);
            const interval = parseInt($el.attr("live-poll"), 10);
            const controller = $el.attr("live-scope");
            const method = $el.attr("live-click") || "poll";
            const target = "#" + $el.attr("id");

            // Clear existing interval to prevent duplicates on re-init
            if ($el.data("poll-interval")) {
                clearInterval($el.data("poll-interval"));
            }

            const pollInterval = setInterval(() => {
                ajaxDynamic("GET", controller, method, {}, "html", target);
            }, interval);

            $el.data("poll-interval", pollInterval); // Store interval ID
        });
    }

    /*==============================
      LIVE COMPUTE
    ==============================*/

    function handleLiveComputeUnified(scope) {
        const rootScope = scope || document;

        // 🔥 OPTIMIZED FOR 1000++ INPUTS
        const TIME_BUDGET_MS = 16;
        const INPUT_DEBOUNCE = 200;
        const DEBUG_MODE = false;
        const MAX_ITERATIONS = 10; // Increased from 5 to 10 for better convergence
        const BATCH_SIZE = 50;
        const PRECISION_TOLERANCE = 0.0001;
        const STABILITY_THRESHOLD = 0.001; // 0.1% change considered stable

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

        // --- 1. ENHANCED NUMBER PARSER (from version 2) ---
        function toNumber(val, currency = "idr") {
            if (val == null || val === "" || val === undefined) return 0;

            val = String(val).trim();
            if (val === "" || val === "-") return 0;

            // Detect percentage
            const isPercentage = val.includes("%");
            val = val.replace(/%/g, "");

            // Detect negative
            const isNegative = /^-/.test(val);
            val = val.replace(/^-/, "");

            // Remove all non-numeric characters except dots and commas
            val = val.replace(/[^\d.,]/g, "");

            if (val === "") return 0;

            let result = 0;

            const normalizedCurrency = String(currency || "idr").toLowerCase();

            if (normalizedCurrency === "idr") {
                // Indonesian format: 5.000.000 or 5.000.000,25
                if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(val)) {
                    result = parseFloat(val.replace(/\./g, "").replace(",", "."));
                } else if (/^\d+(,\d+)?$/.test(val)) {
                    result = parseFloat(val.replace(",", "."));
                } else if (/^\d+(\.\d+)?$/.test(val)) {
                    result = parseFloat(val);
                } else {
                    result = parseFloat(val.replace(/[^\d]/g, ""));
                }
            } else if (normalizedCurrency === "usd") {
                // US format: 5,000,000 or 5,000,000.25
                if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(val)) {
                    result = parseFloat(val.replace(/,/g, ""));
                } else if (/^\d+(\.\d+)?$/.test(val)) {
                    result = parseFloat(val);
                } else if (/^\d+(,\d+)?$/.test(val)) {
                    result = parseFloat(val.replace(/,/g, ""));
                } else {
                    result = parseFloat(val.replace(/[^\d]/g, ""));
                }
            } else {
                // Auto-detect fallback
                if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(val)) {
                    result = parseFloat(val.replace(/\./g, "").replace(",", "."));
                } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(val)) {
                    result = parseFloat(val.replace(/,/g, ""));
                } else if (/^\d+([.,]\d+)?$/.test(val)) {
                    result = val.includes(",")
                        ? parseFloat(val.replace(",", "."))
                        : parseFloat(val);
                } else {
                    result = parseFloat(val.replace(/[^\d]/g, ""));
                }
            }

            if (isNaN(result)) result = 0;
            if (isNegative) result = -result;
            if (isPercentage) result = result / 100;

            // Use parseFloat with precision to avoid floating point errors
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
        function isValueConverged(oldValue, newValue, currency = "idr") {
            if (oldValue == null && newValue == null) return true;
            if (oldValue == null || newValue == null) return false;
            if (oldValue === newValue) return true;

            const oldNum = toNumber(oldValue, currency);
            const newNum = toNumber(newValue, currency);

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
                    // ✅ Checkbox support: store el.value when checked, 0 when unchecked
                    const isCheckbox = el.type === "checkbox";
                    inputValueCache.set(sanitized, isCheckbox ? (el.checked ? el.value : 0) : el.value);

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
        function process(sourceElement = null) {
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

                        const format =
                            attr(element, "live-compute-format") || "idr";
                        const formulaCacheKey = `${expr}::${format}`;

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
                                    format,
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
                                    const isCheckbox = el.type === "checkbox";
                                    const cachedValue = isCheckbox ? (el.checked ? el.value : 0) : el.value;
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

            if (getData(element, 'userOwned') === true) return false;

            const lastValue = getData(element, "lastValue");
            const format = attr(element, "live-compute-format");
            let rawValue = toNumber(result, format || "idr");

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
                    ? 0
                    : parseInt(decimalAttr, 10);

            if (isNaN(maxDecimals) || maxDecimals < 0) maxDecimals = 0;
            if (maxDecimals > 20) maxDecimals = 20;

            // Normalize the number with proper precision
            rawValue = normalizeNumber(rawValue, maxDecimals);

            if (isNaN(rawValue) || !isFinite(rawValue)) {
                rawValue = 0;
            }

            // Check for live-compute-init="false"
            if (
                lastValue === undefined &&
                attr(element, "live-compute-init") === "false"
            ) {
                setData(element, "lastValue", rawValue);

                // Get server value and format it
                let serverValue = element.matches("input, textarea, select")
                    ? val(element)
                    : element.innerHTML;
                let formattedServerValue = format
                    ? formatResult(serverValue, format, maxDecimals)
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

            // Use enhanced convergence check
            if (!isValueConverged(lastValue, rawValue, format || "idr")) {
                setData(element, "lastValue", rawValue);
                let displayValue = format
                    ? formatResult(rawValue, format, maxDecimals)
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
        function evaluateExpression(expr, globalInputs, indices, currency = "idr") {
            if (expr.includes("range")) {
                const m = expr.match(
                    /(rangeDate|rangeMonth|rangeYear|rangeWeek)\(([^)]+)\)/,
                );
                if (m) return 0;
            }

            if (expr.match(/(sum|avg|min|max|count|sumif)\(/)) {
                expr = processAggregateFunctions(
                    expr,
                    globalInputs,
                    indices,
                    currency,
                );
            }

            const vars = extractVariables(expr);
            const vals = vars.map((v) =>
                toNumber(globalInputs.get(v) || 0, currency),
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
            currency = "idr",
        ) {
            expr = expr.replace(
                /sumif\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi,
                (match, r1, c, r2) => {
                    const cacheKey = `sumif:${r1}:${c}:${r2}:${currency}`;

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
                    const result = safeAggregate("sum", vals, currency);

                    aggregateFunctionCache.set(cacheKey, result);
                    return result;
                },
            );

            return expr.replace(
                /(sum|avg|min|max|count)\(([^()]+)\)/gi,
                (match, fn, arg) => {
                    const cacheKey = `${fn}:${arg}:${currency}`;

                    if (aggregateFunctionCache.has(cacheKey)) {
                        return aggregateFunctionCache.get(cacheKey);
                    }

                    const vals = getAggregateValues(arg, globalInputs, indices);
                    const result = safeAggregate(
                        fn.toLowerCase(),
                        vals,
                        currency,
                    );

                    aggregateFunctionCache.set(cacheKey, result);
                    return result;
                },
            );
        }

        function safeAggregate(fn, vals, currency = "idr") {
            if (!vals || vals.length === 0) return 0;

            const validVals = vals
                .filter((v) => {
                    const num = toNumber(v, currency);
                    return isFinite(num) && !isNaN(num);
                })
                .map((v) => toNumber(v, currency));

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
        //         const exprFuncCache = new Map();
        //         function safeFunctionEvaluation(vars, vals, expr) {
        //             if (!exprFuncCache.has(expr)) {
        //                 const funcBody = `
        //                 const safeDivide = (a, b) => {
        //                     const numB = typeof b === 'number' ? b : parseFloat(b) || 0;
        //                     if (numB === 0) return 0;
        //                     const result = (typeof a === 'number' ? a : parseFloat(a) || 0) / numB;
        //                     return isFinite(result) ? result : 0;
        //                 };
        //                 const safeAdd = (a, b) => {
        //                     const result = (typeof a === 'number' ? a : parseFloat(a) || 0) + 
        //                                    (typeof b === 'number' ? b : parseFloat(b) || 0);
        //                     return isFinite(result) ? result : 0;
        //                 };
        //                 const round = (num, digits=0) => { 
        //                     const f = Math.pow(10, digits); 
        //                     const result = Math.round(num * f) / f;
        //                     return isFinite(result) ? result : 0;
        //                 };
        //                 try {
        //                     const result = ${expr};
        //                     return (isNaN(result) || !isFinite(result)) ? 0 : result;
        //                 } catch(e) {
        //                     return 0;
        //                 }
        //             `;

        //                 const func = new Function(...vars, "Math", funcBody);
        //                 exprFuncCache.set(expr, func);
        //             }

        //             try {
        //                 const result = exprFuncCache.get(expr)(...vals, Math);
        //                 return isNaN(result) || !isFinite(result) ? 0 : result;
        //             } catch (e) {
        //                 if (DEBUG_MODE) console.error("[SafeEval] Error:", e);
        //                 return 0;
        //             }
        //         }

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
            ];
            return [...new Set(vars.filter((v) => !reserved.includes(v)))];
        }

        function formatResult(result, format, maxDecimals = 0) {
            const num = parseFloat(result);

            if (isNaN(num) || !isFinite(num)) return "0";

            // Ensure maxDecimals is valid
            maxDecimals = isNaN(parseInt(maxDecimals))
                ? 0
                : parseInt(maxDecimals);

            if (format.toLowerCase() === "idr") {
                try {
                    return new Intl.NumberFormat("id-ID", {
                        minimumFractionDigits: maxDecimals,
                        maximumFractionDigits: maxDecimals,
                    }).format(num);
                } catch (e) {
                    return num.toFixed(maxDecimals);
                }
            } else if (format.toLowerCase() === "usd") {
                try {
                    return new Intl.NumberFormat("en-US", {
                        minimumFractionDigits: maxDecimals,
                        maximumFractionDigits: maxDecimals,
                    }).format(num);
                } catch (e) {
                    return num.toFixed(maxDecimals);
                }
            }

            const formatted = num.toFixed(maxDecimals);
            return isFinite(parseFloat(formatted)) ? formatted : "0";
        }

        // --- 11. OPTIMIZED SCHEDULER & INIT ---
        function scheduleProcess(delay = 0, sourceElement = null) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => process(sourceElement), delay);
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
                        if (e.target.name) {
                            const isCheckbox = e.target.type === "checkbox";
                            // ✅ Checkbox: store el.value when checked, 0 when unchecked
                            const cachedValue = isCheckbox ? (e.target.checked ? e.target.value : 0) : e.target.value;
                            updateInputCache(e.target.name, cachedValue);
                            setData(e.target, "lastManualInput", Date.now());
                            cachedComputeElements.forEach((el) => {
                                setData(el, "userOwned", el === e.target);
                            });
                        }

                        // Unlock init attribute on manual input
                        if (e.target.hasAttribute("live-compute-init")) {
                            e.target.removeAttribute("live-compute-init");
                        }

                        scheduleProcess(INPUT_DEBOUNCE, e.target);
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
                        updateInputCache(e.target.name, checkboxValue, false);
                        setData(e.target, "lastManualInput", Date.now());
                        cachedComputeElements.forEach((el) => {
                            setData(el, "userOwned", el === e.target);
                        });

                        if (e.target.hasAttribute("live-compute-init")) {
                            e.target.removeAttribute("live-compute-init");
                        }

                        scheduleProcess(INPUT_DEBOUNCE, e.target);
                    }
                },
                { passive: true },
            );

            rebuildDomCache();
            process();
        }

        init();
    }

    /*==============================
      SPA ROUTER INTEGRATION
    ==============================*/

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
            "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr("content"),
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
                document.dispatchEvent(new CustomEvent("live-dom:afterUpdate"));
                document.dispatchEvent(
                    new CustomEvent("live-dom:afterSpa", {
                        detail: {
                            url,
                        },
                    }),
                );
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

                $.ajax({
                    url,
                    method,
                    data: formData,
                    processData: false,
                    contentType: false,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr(
                            "content",
                        ),
                    },
                    beforeSend: function () {
                        showLoadingBar();
                        clearFormErrors(form);
                    },
                    success: (response) => {
                        const redirectUrl = response?.redirect;

                        if (redirectUrl) {
                            fetch(redirectUrl, {
                                headers: {
                                    "X-Requested-With": "XMLHttpRequest",
                                },
                            })
                                .then((res) => res.text())
                                .then((html) => {
                                    updateSpaRegions(html);
                                    document.dispatchEvent(
                                        new CustomEvent("live-dom:afterUpdate"),
                                    );
                                    document.dispatchEvent(
                                        new CustomEvent("live-dom:afterSpa", {
                                            detail: {
                                                url: redirectUrl,
                                            },
                                        }),
                                    );
                                    history.pushState(
                                        {
                                            spa: true,
                                            url: redirectUrl,
                                        },
                                        "",
                                        redirectUrl,
                                    );
                                    runAfterCallback(response, false);
                                    callbackSuccess?.(response);
                                })
                                .catch((err) => {
                                    console.error(
                                        "SPA redirect fetch error:",
                                        err,
                                    );
                                    runAfterCallback(response, true);
                                    callbackError?.(err);
                                });
                        } else {
                            runAfterCallback(response, false);
                            callbackSuccess?.(response);
                        }
                    },
                    error: (xhr) => {
                        if (xhr.status === 422) {
                            const errors = xhr.responseJSON?.errors || {};
                            showFormErrors(form, errors);
                        } else {
                            console.error("Form submit error:", xhr);
                            const content = xhr.responseText;
                            try {
                                const json = JSON.parse(content);
                                showErrorModal(json);
                            } catch {
                                showErrorModal(content);
                            }
                        }
                        runAfterCallback(xhr, true);
                        callbackError?.(xhr);
                    },
                    complete: hideLoadingBar,
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
        $(form).find(".is-invalid").removeClass("is-invalid");
        $(form).find(".invalid-feedback").remove();
    }

    /**
     * Displays form validation errors.
     * @param {HTMLFormElement} form - The form element.
     * @param {object} errors - An object where keys are field names and values are arrays of error messages.
     */
    function showFormErrors(form, errors) {
        for (const [field, messages] of Object.entries(errors)) {
            const input = $(form).find(`[name="${field}"]`);
            if (input.length) {
                input.addClass("is-invalid");
                const errorHtml = `<div class="invalid-feedback text-red-600 text-sm mt-1">${messages.join("<br>")}</div>`;
                if (input.next(".invalid-feedback").length === 0) {
                    input.after(errorHtml);
                }
            }
        }
    }

    /**
     * Checks if a URL should be excluded from SPA handling.
     * @param {string} url - The URL to check.
     * @returns {boolean} True if the URL should be excluded.
     */
    function isSpaExcluded(url) {
        try {
            const path = new URL(url, window.location.origin).pathname;
            const excludes = (
                window.liveDomConfig?.spaExcludePrefixes || []
            ).filter(Boolean);
            return excludes.some((prefix) => path.startsWith(prefix));
        } catch (e) {
            console.warn(
                "Error parsing URL for SPA exclusion, falling back:",
                e,
            );
            const excludes = (
                window.liveDomConfig?.spaExcludePrefixes || []
            ).filter(Boolean);
            return excludes.some((prefix) => url.startsWith(prefix));
        }
    }

    /*==============================
      LOADING BAR
    ==============================*/

    /** Initializes the global loading bar element. */
    function initLoadingBar() {
        if ($("#loading-bar").length === 0) {
            const $loadingBar = $('<div id="loading-bar"></div>').css({
                position: "fixed",
                top: 0,
                left: 0,
                height: "3px",
                width: "0%",
                backgroundColor: "#2563eb",
                zIndex: 99999,
                transition: "width 0.3s ease",
                willChange: "width",
                display: "none",
            });
            $("body").append($loadingBar);
        }
    }

    /** Shows the loading bar animation. */
    function showLoadingBar() {
        $("#loading-bar")
            .stop(true)
            .css({
                width: "0%",
                display: "block",
            })
            .animate(
                {
                    width: "80%",
                },
                800,
            );
    }

    /** Hides the loading bar animation. */
    function hideLoadingBar() {
        $("#loading-bar")
            .stop(true)
            .animate(
                {
                    width: "100%",
                },
                300,
                function () {
                    $(this).fadeOut(200, function () {
                        $(this).css({
                            width: "0%",
                        });
                    });
                },
            );
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
            }
        });
    }

    function handleLiveBind() {
        $(document).on(
            "input change",
            "input[name], select[name], textarea[name]",
            function () {
                const $source = $(this);
                const name = $source.attr("name");
                if (!name) return;

                const value = $source.is(":checkbox")
                    ? $source.prop("checked")
                    : $source.val();

                $(`[live-bind="${name}"]`).each(function () {
                    const $target = $(this);
                    if ($target.is("input, textarea, select")) {
                        $target.val(value);
                    } else {
                        $target.text(value);
                    }
                });
            },
        );
    }

    /*==============================
      LIVE DOM HOOKS & INITIALIZATION
    ==============================*/

    /** Binds all initial live DOM event handlers. */
    function bindLiveDomEvents() {
        $(document).on("click", "[live-click]", function () {
            handleLiveEvent($(this), "click");
        });

        $(document).on("mouseenter mouseleave", "[live-hover]", function () {
            handleLiveEvent($(this), "hover");
        });

        $(document).on("change", "[live-change]", function () {
            handleLiveEvent($(this), "change");
        });

        $(document).on("submit", "[live-submit]", function (e) {
            e.preventDefault();
            handleLiveEvent($(this), "submit");
        });

        $(document).on("keyup", "[live-keyup]", function () {
            handleLiveEvent($(this), "keyup");
        });

        $(document).on("input", "[live-input]", function () {
            handleLiveEvent($(this), "input");
        });

        $(document).on("input", "[live-bind]", function () {
            handleLiveEvent($(this), "input");
        });

        // event binding, pakai debounce
        $(document).on(
            "input change",
            "[live-scope] input, [live-scope] select, [live-scope] textarea",
            debounce(function () {
                const scope = $(this).closest("[live-scope]");
                handleLiveDirectives(scope);
            }, 200), // delay 200ms
        );

        $(document).on(
            "click",
            '[live-spa-region] a[href]:not([href^="#"]):not([href=""])',
            function (e) {
                const url = $(this).attr("href");
                if (!url || isSpaExcluded(url)) return;
                e.preventDefault();
                loadSpaContent(url);
            },
        );

        $(document).on("submit", "[live-spa-region] form", function (e) {
            const form = this;
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

                fetch(fullUrl, {
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                    },
                })
                    .then((res) => res.text())
                    .then((html) => {
                        updateSpaRegions(html);
                        document.dispatchEvent(
                            new CustomEvent("live-dom:afterUpdate"),
                        );
                        document.dispatchEvent(
                            new CustomEvent("live-dom:afterSpa", {
                                detail: {
                                    url: fullUrl,
                                },
                            }),
                        );
                        history.replaceState(
                            {
                                spa: true,
                                url: fullUrl,
                            },
                            "",
                            fullUrl,
                        );
                    })
                    .catch((err) => console.error("SPA GET error:", err));
                return;
            }

            ajaxSpaFormSubmit(form, function (response) {
                if (typeof response === "string") {
                    updateSpaRegions(response);
                    document.dispatchEvent(
                        new CustomEvent("live-dom:afterUpdate"),
                    );
                    document.dispatchEvent(
                        new CustomEvent("live-dom:afterSpa", {
                            detail: {
                                url,
                            },
                        }),
                    );
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
        });
    }

    function initLiveDom() {
        initLoadingBar(); // loading bar
        handleLiveBind(); // live-bind
        bindLiveDomEvents(); // event handler utama
        handlePollers(); // pollers (live-poll)
        // handleLiveComputeUnified();     // inisialisasi live-compute
        // handleLiveDirectives();

        // SPA state awal
        if (document.querySelector('[live-spa-region="main"]')) {
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
    $(document).ready(function () {
        initLiveDom();
        handleLiveComputeUnified();
        handleLiveDirectives();
    });
})(jQuery);