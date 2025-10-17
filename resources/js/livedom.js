(function ($) {
    "use strict";

    /*==============================
        AJAX DYNAMIC
    ==============================*/

    const ajaxDynamicControllers = {};

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

    function ajaxDynamic(
        method = 'POST',
        controller,
        action,
        data = {},
        target = 'html',
        targetId = '#',
        loading = true,
        callback = null,
        useCache = false // ✅ opsi baru: default false (fresh data)
    ) {
        const key = targetId || `${controller}_${action}_${method}_${JSON.stringify(data)}`;

        // ✅ Jika ada request sebelumnya ke target yang sama → batalkan
        if (ajaxDynamicControllers[key]) {
            ajaxDynamicControllers[key].abort();
        }

        // ✅ Jika ada cache → pakai lalu hapus (single-use)
        if (useCache && ajaxCache.has(key)) {
            const response = ajaxCache.get(key);
            ajaxCache.delete(key); // auto clear setelah dipakai

            if (typeof callback === 'function') {
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
            headers: method !== 'GET' ? {
                'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
            } : {},

            data: method === 'GET' ? data : (isFormData ? data : JSON.stringify(data)),
            contentType: method === 'GET' ? undefined : (isFormData ? false : 'application/json'),
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

                if (typeof callback === 'function') {
                    callback(response);
                } else {
                    callBackAjaxDynamic(target, targetId, response);
                }
            },

            error: function (jqXHR, textStatus) {
                if (loading) {
                    targetId !== '#' ? hideTargetLoading(targetId) : $(".loading").hide();
                }

                delete ajaxDynamicControllers[key];

                if (textStatus === 'abort') {
                    console.log(
                        `[AJAX Dynamic] Request to /ajax/${controller}/${action} was aborted.`
                    );
                    return;
                }

                const contentType = jqXHR.getResponseHeader('content-type') || '';
                const isHtmlResponse = contentType.includes('text/html');

                if (isHtmlResponse) {
                    showErrorModal(jqXHR.responseText);
                    return;
                }

                let json = {};
                try {
                    json = jqXHR.responseJSON || JSON.parse(jqXHR.responseText);
                } catch (e) {
                    json = {
                        message: 'Unparsable response',
                        raw: jqXHR.responseText
                    };
                }
                showErrorModal(json);
            }
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
            if (typeof target === "string" && target !== "html" && window[target]) {
                window[target](response.data, targetId);
            } else if (target === "html") {
                $(`${targetId}`).html(response.data);
            } else if (typeof target == "function") {
                target(response.data, targetId);
            }
        } else {
            console.error('AJAX Dynamic Error:', response.message);
        }
    }

    /**
     * Displays a loading overlay on the specified target element.
     * @param {string} targetId - The CSS selector of the element to show loading on.
     */
    function showTargetLoading(targetId) {
        const $target = $(targetId);
        if ($target.length === 0) return;

        $target.find('.dynamic-loading-overlay').remove();

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

        if (!$('head').find('#spinner-style').length) {
            $('head').append(`<style id="spinner-style">${spinnerStyle}</style>`);
        }

        if ($target.css('position') === 'static') {
            $target.css('position', 'relative');
        }

        $target.append($overlay);
    }

    /**
     * Hides the loading overlay on the specified target element.
     * @param {string} targetId - The CSS selector of the element to hide loading from.
     */
    function hideTargetLoading(targetId) {
        const $target = $(targetId);
        $target.find('.dynamic-loading-overlay').fadeOut(300, function () {
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
    function debouncedAjaxDynamic(methodType, controller, method, data, target, targetId, loading, callback) {
        const key = `${controller}::${method}`;

        if (debounceMap.has(key)) {
            clearTimeout(debounceMap.get(key));
        }

        const timer = setTimeout(() => {
            ajaxDynamic(methodType, controller, method, data, target, targetId, loading, callback);
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
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    }

    /**
     * Converts a camelCase string to snake_case.
     * @param {string} str - The input string.
     * @returns {string} The snake_case string.
     */
    function camelToSnake(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    }

    /**
     * Sanitizes an HTML input name attribute to a valid JavaScript variable name.
     * @param {string} name - The input name attribute.
     * @returns {string} The sanitized JavaScript variable name.
     */
    function sanitizeInputNameToJSVariable(name) {
        return name.replace(/\]\[|\[|\]/g, '_').replace(/_+$/, '');
    }

    /**
     * Automatically binds response data to DOM elements based on their ID or class name.
     * Supports camelCase, kebab-case, and snake_case matching.
     * @param {object} data - The data object from the AJAX response.
     */
    function autoBindDomFromResponse(data) {
        if (!data || typeof data !== 'object') return;

        Object.entries(data).forEach(([key, value]) => {
            const selectors = [
                `#${key}`, `.${key}`,
                `#${camelToKebab(key)}`, `.${camelToKebab(key)}`,
                `#${camelToSnake(key)}`, `.${camelToSnake(key)}`
            ];

            for (const selector of selectors) {
                const $el = $(selector);
                // if ($el.is('input, textarea, select')) {
                //     $el.val(value);
                //     $el.each(function () {
                //         this.dispatchEvent(new Event('input', {
                //             bubbles: true
                //         }));
                //         this.dispatchEvent(new Event('change', {
                //             bubbles: true
                //         }));
                //     });
                // } else {
                //     $el.html(value);
                // }

                if ($el.is('input, textarea, select')) {
                    if ($el.val() !== String(value)) {
                        $el.val(value);
                        $el.each(function () {
                            this.dispatchEvent(new Event('input', { bubbles: true }));
                            this.dispatchEvent(new Event('change', { bubbles: true }));
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
        let methodType = 'POST';
        if (eventType === 'submit' && formSelector) {
            methodType = ($(formSelector).attr('method') || 'POST').toUpperCase();
        }
        if ($el.attr('live-method')) {
            methodType = $el.attr('live-method').toUpperCase();
        }
        return methodType;
    }

    /**
     * Extracts data from the closest form or live-scope.
     * @param {jQuery} $el - The jQuery object of the triggering element.
     * @param {jQuery} formSelector - The jQuery object of the closest form.
     * @returns {object|FormData} The extracted data.
     */

    function extractData($el, $form) {
        let formData = new FormData();

        // Kalau klik method ada (form) → ambil form terdekat aja
        if ($form && $form.length) {
            $form.find('input[name], select[name], textarea[name]').each(function () {
                appendInputToFormData(formData, this);
            });
        } else {
            const $scope = $el.closest('[live-scope]');
            $scope.find('input[name], select[name], textarea[name]').each(function () {
                appendInputToFormData(formData, this);
            });
        }

        return formData;
    }

    function appendInputToFormData(fd, el) {
        const $input = $(el);
        const name = $input.attr('name');
        if (!name) return;

        if ($input.is(':file')) {
            const files = $input[0].files;
            for (let i = 0; i < files.length; i++) {
                fd.append(name, files[i]);
            }
        } else if ($input.is(':checkbox')) {
            if ($input.is(':checked')) {
                fd.append(name, $input.val());
            }
        } else if ($input.is(':radio')) {
            if ($input.is(':checked')) {
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
        const $scope = $el.closest('[live-scope]');
        const inputs = {};

        $scope.find('input[name], select[name], textarea[name]').each(function () {
            const name = $(this).attr('name');
            if (!name) return;
            let val;
            if ($(this).is(':checkbox')) {
                val = $(this).is(':checked') ? $(this).val() : null;
            } else if ($(this).is(':radio')) {
                if ($(this).is(':checked')) val = $(this).val();
            } else {
                val = $(this).val();
            }

            const safeName = name.replace(/\]\[|\[|\]/g, '_').replace(/_+$/, '');
            const numVal = parseFloat(String(val).replace(/[^\d.-]/g, ''));
            inputs[safeName] = isNaN(numVal) ? val : numVal;

        });

        // biar ekspresi kayak dpp_[1] tetap bisa dipakai
        expr = expr.replace(/\[\s*(\w+)\s*\]/g, '_$1');

        try {
            return Function('ctx', `with(ctx){ return (${expr}) }`)(inputs);
        } catch (e) {
            console.warn('Eval error:', expr, e);
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
        const expr = $el.attr('live-attr');
        if (!expr) return [];
        const parsed = expr.split(',').map(pair => {
            const [attr, js] = pair.split(':');
            return { attr: attr.trim(), js: js.trim() };
        });
        liveAttrCache.set($el[0], parsed);
        return parsed;
    }

    function handleLiveDirectives(scope) {
        const $scope = scope ? $(scope) : $(document);

        $scope.find('[live-show]').each(function () {
            const expr = $(this).attr('live-show');
            const result = evaluateExpr(expr, $(this));
            $(this).toggle(!!result);
        });

        $scope.find('[live-class]').each(function () {
            const expr = $(this).attr('live-class');
            const result = evaluateExpr(expr, $(this));
            if (typeof result === 'string') {
                $(this).attr('class', ($(this).attr('class-base') || '') + ' ' + result);
            }
        });

        $scope.find('[live-style]').each(function () {
            const expr = $(this).attr('live-style');
            const result = evaluateExpr(expr, $(this));
            if (typeof result === 'string') {
                $(this).attr('style', result);
            }
        });

        $scope.find('[live-attr]').each(function () {
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
        if ($el.is('input, textarea, select')) {
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
        const selectors = targetSelector.split(',').map(s => s.trim());

        for (let sel of selectors) {
            let $target = null;

            const match = sel.match(/^(\w+)(\(([^)]+)\))?$/);
            if (match) {
                const method = match[1];
                const param = match[3] ? match[3].trim() : null;

                switch (method) {
                    case 'closest':
                        if (param) $target = $el.closest(param);
                        break;
                    case 'find':
                        if (param) $target = $el.find(param);
                        break;
                    case 'parent':
                        $target = $el.parent();
                        break;
                    case 'children':
                        $target = $el.children(param || undefined);
                        break;
                    case 'next':
                        $target = param ? $el.next(param) : $el.next();
                        break;
                    case 'prev':
                        $target = param ? $el.prev(param) : $el.prev();
                        break;
                    case 'siblings':
                        $target = param ? $el.siblings(param) : $el.siblings();
                        break;
                    case 'self':
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
        const rawTargets = $el.attr('live-target') || '';
        const domAction = $el.attr('live-dom') || 'html';
        const formSelector = $el.closest('form').length ? $el.closest('form') : null;
        const controller = $el.closest('[live-scope]').attr('live-scope');
        if (!controller && rawMethods) {
            console.warn(
                `[Live Event] Element with live-${eventType} needs a live-scope attribute on an ancestor.`,
                $el[0]);
            return;
        }

        const loading = $el.attr('live-loading') === 'true';
        const loadingIndicator = $el.attr('live-loading-indicator');
        const dataArgs = $el.attr('live-data');

        const beforeCallback = $el.attr('live-callback-before');
        const execute = () => {
            const methodType = resolveMethodType($el, eventType, formSelector);
            const fallbackData = dataArgs ? {
                data: dataArgs
            } : extractData($el, formSelector);

            if (loadingIndicator) $(loadingIndicator).show();

            if (!rawMethods) {
                // Kalau tidak ada action, jalankan update lokal
                return runLocalUpdate($el, domAction, rawTargets);
            }

            const methods = rawMethods.split(',').map(m => m.trim()).filter(Boolean);

            const parsedMethods = methods.map(m => {
                const match = m.match(/^(\w+)(\((.*)\))?$/);
                if (!match) return {
                    method: m,
                    args: null
                };

                const [, name, , argsStr] = match;
                if (!argsStr) return {
                    method: name,
                    args: null
                };

                try {
                    let argsRaw = [];

                    try {
                        const safeArgStr = argsStr.replace(/\bthis\b/g, '__el');
                        argsRaw = Function('__el', `return [${safeArgStr}]`)($el[0]);

                        // Jika hanya ada satu argumen dan itu array string (nested), coba parse manual
                        if (
                            argsRaw.length === 1 &&
                            typeof argsRaw[0] === 'string' &&
                            argsRaw[0].startsWith('[') &&
                            argsRaw[0].endsWith(']')
                        ) {
                            try {
                                const parsed = JSON.parse(argsRaw[0].replace(/'/g,
                                    '"')); // convert ' to " dulu
                                if (Array.isArray(parsed)) {
                                    argsRaw = [parsed]; // ganti isinya jadi array asli
                                }
                            } catch (e) {
                                console.warn('Failed to parse stringified array literal:', argsRaw[
                                    0]);
                            }
                        }
                    } catch (e) {
                        console.warn(`[Live Event] Error parsing arguments: ${argsStr}`, e.message);
                    }


                    // Sanitize nilai untuk serialisasi aman
                    const argsSanitized = argsRaw.map(arg => {
                        if (arg instanceof Element) {
                            return $(arg).is('input, select, textarea') ? $(arg).val() : $(
                                arg).text().trim();
                        }

                        // Hindari window atau objek global
                        if (typeof arg === 'object' && arg === window) {
                            return null;
                        }

                        return arg;
                    });


                    return {
                        method: name,
                        args: argsSanitized
                    };
                } catch (e) {
                    console.warn(`[Live Event] Error parsing arguments for method "${name}":`, e
                        .message);
                    return {
                        method: name,
                        args: null
                    };
                }
            });

            const targets = rawTargets.split(',').map(t => t.trim());
            const targetFor = (i) => (targets.length === 1 ? targets[0] : (targets[i] || ''));

            parsedMethods.forEach(({
                method,
                args
            }, i) => {
                const targetSel = targetFor(i);
                const $targets = targetSel ? liveTarget($el, targetSel) : $el;

                let postData;
                if (args === null || args.length === 0) {
                    postData = fallbackData;
                } else {
                    // Hati-hati: args = [['2']] akan menyebabkan nested array
                    const dataPayload = args.length === 1 ? args[0] : args;
                    postData = {
                        data: dataPayload
                    };
                }

                runAjaxRequest(methodType, controller, method, postData, domAction, $targets,
                    loading, $el);
            });
        };

        if (beforeCallback) {
            try {
                let result;

                if (beforeCallback.includes('(')) {
                    // Kalau ada () => evaluasi sebagai function expression dengan __el sebagai elemen
                    const safeCallback = beforeCallback.replace(/\bthis\b/g, '__el');
                    result = Function('__el', `
            try {
              return (${safeCallback});
            } catch (e) {
              console.warn('[LiveDomJs] Error evaluating beforeCallback:', e);
              return undefined;
            }
          `)($el[0]);
                } else {
                    // Kalau hanya nama fungsi, panggil window[fnName]($el[0])
                    const fn = window[beforeCallback.trim()];
                    if (typeof fn === 'function') {
                        result = fn($el[0]);
                    } else {
                        console.warn(
                            `[LiveDomJs] live-callback-before function "${beforeCallback}" not found.`);
                        result = undefined;
                    }
                }

                if (result instanceof Promise) {
                    result.then(ok => {
                        if (ok !== false) execute();
                    }).catch(() => { });
                } else if (result !== false) {
                    execute();
                }
            } catch (e) {
                console.warn('[LiveDomJs] live-callback-before error:', beforeCallback, e);
                execute(); // fallback tetap jalan
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
    function runAjaxRequest(methodType, controller, method, data, domAction, $targets, loading, $el) {
        const callback = function (response) {
            let responseData = response && typeof response === 'object' && 'data' in response ?
                response.data :
                response;

            if (typeof responseData === 'object') {
                autoBindDomFromResponse(responseData);
            }

            if (typeof responseData === 'string') {
                $targets.each(function () {
                    applyDomAction($(this), domAction, responseData);
                });
            }

            const afterCallback = $el.attr('live-callback-after');
            if (afterCallback && typeof window[afterCallback] === 'function') {
                window[afterCallback]($el[0], response);
            }

            document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
        };

        debouncedAjaxDynamic(methodType, controller, method, data, '', '', loading, callback);
    }


    /**
     * Performs a local DOM update without an AJAX request.
     * @param {jQuery} $el - The triggering element.
     * @param {string} domAction - How to apply the content to the DOM.
     * @param {string} rawTargets - Raw target selector string.
     */
    function runLocalUpdate($el, domAction, rawTargets) {
        const targetSel = rawTargets || '';
        const $targets = targetSel ? liveTarget($el, targetSel) : $el;
        if (domAction === 'remove') {
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
        const actionList = typeof actions === 'string' ? actions.split(',') : [actions];
        const contentList = typeof contents === 'object' && !Array.isArray(contents) ? [contents] :
            (Array.isArray(contents) ? contents : [contents]);

        $targets.each(function (targetIndex) {
            const $currentTarget = $(this);

            actionList.forEach((action, actionIndex) => {
                const content = contentList[actionIndex] || contentList[0] || '';
                const trimmedAction = action.trim();

                console.log(`Applying to target ${targetIndex}:`, {
                    target: $currentTarget,
                    action: trimmedAction,
                    content: content
                });

                switch (trimmedAction) {
                    case 'append':
                        $currentTarget.append(content);
                        break;
                    case 'prepend':
                        $currentTarget.prepend(content);
                        break;
                    case 'before':
                        $currentTarget.before(content);
                        break;
                    case 'after':
                        $currentTarget.after(content);
                        break;
                    case 'value':
                    case 'val':
                        $currentTarget.val(content).trigger('change');
                        $currentTarget.trigger('input');
                        $currentTarget.trigger('change');
                        break;
                    case 'text':
                        $currentTarget.text(content);
                        break;
                    case 'html':
                        $currentTarget.html(content);
                        break;
                    case 'toggle':
                        $currentTarget.toggle(content);
                        break;
                    case 'show':
                        $currentTarget.show();
                        break;
                    case 'hide':
                        $currentTarget.hide();
                        break;
                    case 'remove':
                        $currentTarget.remove();
                        break;
                    default:
                        console.warn(`Unknown action: ${trimmedAction}`);
                        $currentTarget.html(content);
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
        $('[live-poll]').each(function () {
            const $el = $(this);
            const interval = parseInt($el.attr('live-poll'), 10);
            const controller = $el.attr('live-scope');
            const method = $el.attr('live-click') || 'poll';
            const target = '#' + $el.attr('id');

            // Clear existing interval to prevent duplicates on re-init
            if ($el.data('poll-interval')) {
                clearInterval($el.data('poll-interval'));
            }

            const pollInterval = setInterval(() => {
                ajaxDynamic('GET', controller, method, {}, 'html', target);
            }, interval);

            $el.data('poll-interval', pollInterval); // Store interval ID
        });
    }

    /*==============================
      LIVE COMPUTE
    ==============================*/

    // function handleLiveComputeUnified(scope) {
    //     const rootScope = scope || document;
    //     const COMPUTE_CACHE_KEY = 'liveComputeCache';
    //     const DEPENDENCY_MAP_KEY = 'liveComputeDeps';
    //     const CIRCULAR_DETECTION_KEY = 'circularDetection';
    //     const BIDIRECTIONAL_TRACKING_KEY = 'bidirectionalTracking';
    //     const DEBOUNCE_DELAY = 100;
    //     const BATCH_SIZE = 15;
    //     const MAX_ITERATIONS = 3;
    //     const PRECISION_TOLERANCE = 0.0001;

    //     let processingPromise = null;
    //     let debounceTimer;
    //     let immediateTimeout;
    //     let iterationCount = 0;
    //     let bidirectionalUpdateInProgress = false;

    //     // Data storage using WeakMap for element data and Map for scope data
    //     const elementData = new WeakMap();
    //     const scopeData = new Map();

    //     // Helper functions to replace jQuery data functionality
    //     function getData(element, key) {
    //         if (element === rootScope) {
    //             return scopeData.get(key);
    //         }
    //         const data = elementData.get(element) || {};
    //         return data[key];
    //     }

    //     function setData(element, key, value) {
    //         if (element === rootScope) {
    //             scopeData.set(key, value);
    //             return;
    //         }
    //         const data = elementData.get(element) || {};
    //         data[key] = value;
    //         elementData.set(element, data);
    //     }

    //     function removeData(element, key) {
    //         if (element === rootScope) {
    //             scopeData.delete(key);
    //             return;
    //         }
    //         const data = elementData.get(element) || {};
    //         delete data[key];
    //         elementData.set(element, data);
    //     }

    //     // Helper functions to replace jQuery selectors and methods
    //     function find(selector, context = rootScope) {
    //         return Array.from(context.querySelectorAll(selector));
    //     }

    //     function filter(elements, callback) {
    //         return elements.filter(callback);
    //     }

    //     function val(element, value) {
    //         if (value !== undefined) {
    //             element.value = value;
    //             return element;
    //         }
    //         return element.value || '';
    //     }

    //     function attr(element, attribute) {
    //         return element.getAttribute(attribute);
    //     }

    //     function html(element, content) {
    //         if (content !== undefined) {
    //             element.innerHTML = content;
    //             return element;
    //         }
    //         return element.innerHTML;
    //     }

    //     function is(element, selector) {
    //         if (selector === ':focus') {
    //             return document.activeElement === element;
    //         }
    //         return element.matches(selector);
    //     }

    //     // Date calculation functions
    //     const dateUtils = {
    //         rangeDate: (start, end) => {
    //             try {
    //                 if (!start || !end) return 0;

    //                 const [sY, sM, sD] = start.split('-').map(Number);
    //                 const [eY, eM, eD] = end.split('-').map(Number);

    //                 const startDate = new Date(sY, sM - 1, sD);
    //                 const endDate = new Date(eY, eM - 1, eD);

    //                 // hitung selisih berdasarkan tanggal saja
    //                 const diffTime = endDate.getTime() - startDate.getTime();
    //                 const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    //                 return diffDays;
    //             } catch (e) {
    //                 console.error('rangeDate error:', e);
    //                 return 0;
    //             }
    //         },

    //         rangeMonth: (start, end) => {
    //             try {
    //                 if (!start || !end) return 0;
    //                 const d1 = new Date(start);
    //                 const d2 = new Date(end);
    //                 if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    //                 return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    //             } catch (e) {
    //                 console.error('rangeMonth error:', e);
    //                 return 0;
    //             }
    //         },
    //         rangeYear: (start, end) => {
    //             try {
    //                 if (!start || !end) return 0;
    //                 const d1 = new Date(start);
    //                 const d2 = new Date(end);
    //                 if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    //                 return d2.getFullYear() - d1.getFullYear();
    //             } catch (e) {
    //                 console.error('rangeYear error:', e);
    //                 return 0;
    //             }
    //         },
    //         rangeWeek: (start, end) => {
    //             try {
    //                 if (!start || !end) return 0;
    //                 const d1 = new Date(start);
    //                 const d2 = new Date(end);
    //                 if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    //                 return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24 * 7));
    //             } catch (e) {
    //                 console.error('rangeWeek error:', e);
    //                 return 0;
    //             }
    //         }
    //     };

    //     if (!getData(rootScope, COMPUTE_CACHE_KEY)) {
    //         setData(rootScope, COMPUTE_CACHE_KEY, new Map());
    //     }
    //     if (!getData(rootScope, DEPENDENCY_MAP_KEY)) {
    //         buildDependencyMap();
    //     }
    //     if (!getData(rootScope, CIRCULAR_DETECTION_KEY)) {
    //         setData(rootScope, CIRCULAR_DETECTION_KEY, new Map());
    //     }
    //     if (!getData(rootScope, BIDIRECTIONAL_TRACKING_KEY)) {
    //         setData(rootScope, BIDIRECTIONAL_TRACKING_KEY, new Map());
    //     }

    //     function isValueConverged(oldValue, newValue) {
    //         // bedakan "" dengan 0 supaya tetap update
    //         if (oldValue === "" && newValue === 0) return false;

    //         if (oldValue === newValue) return true;

    //         const oldNum = parseFloat(oldValue);
    //         const newNum = parseFloat(newValue);

    //         if (!isNaN(oldNum) && !isNaN(newNum)) {
    //             if (Math.abs(oldNum - newNum) < PRECISION_TOLERANCE) return true;
    //             if (oldNum !== 0 && Math.abs((newNum - oldNum) / oldNum) < PRECISION_TOLERANCE) return true;
    //         }

    //         return false;
    //     }


    //     // PERBAIKAN: Deteksi circular dependency yang lebih baik
    //     function detectCircularDependency(element, newValue, sourceElement = null) {
    //         // Skip circular detection untuk elemen yang saling bergantung (bidirectional)
    //         if (sourceElement) {
    //             const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);
    //             if (bidirectionalMap.has(element) && bidirectionalMap.get(element).has(sourceElement)) {
    //                 return false;
    //             }
    //         }

    //         const circularMap = getData(rootScope, CIRCULAR_DETECTION_KEY);
    //         const key = element;

    //         if (!circularMap.has(key)) {
    //             circularMap.set(key, []);
    //         }

    //         const history = circularMap.get(key);

    //         // Track source element untuk bidirectional
    //         if (sourceElement) {
    //             const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);
    //             if (!bidirectionalMap.has(key)) {
    //                 bidirectionalMap.set(key, new Set());
    //             }
    //             bidirectionalMap.get(key).add(sourceElement);
    //         }

    //         if (history.length > 0) {
    //             const lastValue = history[history.length - 1];
    //             if (isValueConverged(lastValue, newValue)) {
    //                 return true;
    //             }
    //         }

    //         history.push(newValue);

    //         if (history.length > 10) {
    //             history.shift();
    //         }

    //         if (history.length >= 4) {
    //             const len = history.length;
    //             const isOscillating =
    //                 isValueConverged(history[len - 1], history[len - 3]) &&
    //                 isValueConverged(history[len - 2], history[len - 4]);

    //             if (isOscillating) {
    //                 console.warn('Circular dependency detected, stabilizing value:', key);
    //                 return true;
    //             }
    //         }

    //         return false;
    //     }

    //     // PERBAIKAN: Process function dengan handling bidirectional yang lebih baik
    //     function process(sourceElement = null) {
    //         if (processingPromise) {
    //             return processingPromise;
    //         }

    //         if (bidirectionalUpdateInProgress && sourceElement) {
    //             return Promise.resolve();
    //         }

    //         iterationCount = 0;
    //         bidirectionalUpdateInProgress = !!sourceElement;

    //         processingPromise = new Promise((resolve) => {
    //             const cache = getData(rootScope, COMPUTE_CACHE_KEY);

    //             const elements = filter(find('[live-compute]'), function (element) {
    //                 const expr = attr(element, 'live-compute')?.trim() || '';
    //                 return expr.length > 0;
    //             });

    //             let index = 0;
    //             let hasChanges = false;

    //             function processBatch() {
    //                 const batch = elements.slice(index, index + BATCH_SIZE);
    //                 let batchHasChanges = false;

    //                 batch.forEach(function (element) {
    //                     // Skip jika ini adalah source element dari bidirectional update
    //                     if (sourceElement && element === sourceElement) {
    //                         return;
    //                     }

    //                     const expr = attr(element, 'live-compute')?.trim() || '';

    //                     try {
    //                         const hasSkipAttr = attr(element, 'live-compute-skip') === 'true';
    //                         const isFocused = is(element, ':focus');
    //                         const isUpdating = getData(element, 'updating') === true;

    //                         if (hasSkipAttr && isFocused) {
    //                             return;
    //                         }

    //                         if (isUpdating) {
    //                             return;
    //                         }

    //                         const lastManualInput = getData(element, 'lastManualInput') || 0;
    //                         if (hasSkipAttr && Date.now() - lastManualInput < 1000) {
    //                             return;
    //                         }

    //                         // ===== ADDED: support live-compute-trigger =====
    //                         const triggerAttr = attr(element, 'live-compute-trigger') || '';
    //                         if (triggerAttr.trim()) {
    //                             const triggers = triggerAttr.split(',').map(s => s.trim()).filter(Boolean);
    //                             let anyRecent = false;
    //                             const now = Date.now();
    //                             const THRESHOLD_MS = 1500; // window: 1.5s (sesuaikan kalau perlu)

    //                             // cari input yang sesuai setiap trigger, cek lastManualInput-nya
    //                             for (const t of triggers) {
    //                                 // cari input/select/textarea dengan nama yang jika disanitize = t
    //                                 const inputs = find('input[name], select[name], textarea[name]');
    //                                 for (const inp of inputs) {
    //                                     const nameAttr = attr(inp, 'name');
    //                                     if (!nameAttr) continue;
    //                                     const sanitized = sanitizeInputNameToJSVariable(nameAttr);
    //                                     if (sanitized === t) {
    //                                         const last = getData(inp, 'lastManualInput') || 0;
    //                                         if (now - last < THRESHOLD_MS) {
    //                                             anyRecent = true;
    //                                             break;
    //                                         }
    //                                     }
    //                                 }
    //                                 if (anyRecent) break;
    //                             }

    //                             // kalau tidak ada trigger recent, skip element ini
    //                             if (!anyRecent) {
    //                                 return;
    //                             }
    //                         }
    //                         // ===== END ADDED =====

    //                         const globalInputs = getGlobalInputs();
    //                         const indices = getRowIndices();
    //                         const result = evaluateExpression(expr, globalInputs, indices);
    //                         const changed = displayResult(element, result, cache, sourceElement);

    //                         if (changed) {
    //                             batchHasChanges = true;
    //                             hasChanges = true;
    //                         }
    //                     } catch (error) {
    //                         console.error('LiveCompute error:', error);
    //                         if (attr(element, 'live-compute-skip') !== 'true') {
    //                             displayResult(element, '', cache, sourceElement);
    //                         }
    //                     }
    //                 });

    //                 index += BATCH_SIZE;

    //                 if (index < elements.length) {
    //                     if ('requestIdleCallback' in window) {
    //                         requestIdleCallback(processBatch, { timeout: 100 });
    //                     } else {
    //                         setTimeout(processBatch, 20);
    //                     }
    //                 } else {
    //                     iterationCount++;

    //                     if (hasChanges && iterationCount < MAX_ITERATIONS) {
    //                         index = 0;
    //                         hasChanges = false;
    //                         setTimeout(processBatch, 10);
    //                     } else {
    //                         if (iterationCount >= MAX_ITERATIONS) {
    //                             console.warn('Live compute reached max iterations');
    //                         }

    //                         setTimeout(() => {
    //                             // Hanya reset circular detection jika bukan bidirectional update
    //                             if (!sourceElement) {
    //                                 setData(rootScope, CIRCULAR_DETECTION_KEY, new Map());
    //                             }
    //                         }, 1000);

    //                         processingPromise = null;
    //                         bidirectionalUpdateInProgress = false;
    //                         resolve();
    //                     }
    //                 }
    //             }

    //             processBatch();
    //         }).finally(() => {
    //             processingPromise = null;
    //             bidirectionalUpdateInProgress = false;
    //         });

    //         return processingPromise;
    //     }


    //     function scheduleProcess(delay = 0, sourceElement = null) {
    //         clearTimeout(immediateTimeout);
    //         clearTimeout(debounceTimer);

    //         const timerId = setTimeout(() => {
    //             process(sourceElement);
    //         }, delay);

    //         if (delay <= 30) {
    //             immediateTimeout = timerId;
    //         } else {
    //             debounceTimer = timerId;
    //         }
    //     }

    //     function processImmediate(sourceElement = null) {
    //         scheduleProcess(30, sourceElement);
    //     }

    //     function debounceProcess(sourceElement = null) {
    //         scheduleProcess(DEBOUNCE_DELAY, sourceElement);
    //     }

    //     function buildDependencyMap() {
    //         const depMap = new Map();
    //         find('[live-compute]').forEach(function (element) {
    //             const expr = attr(element, 'live-compute')?.trim() || '';
    //             depMap.set(element, extractVariables(expr));

    //             // parse live-compute-trigger dan simpan pada element (untuk akses cepat)
    //             const triggerAttr = attr(element, 'live-compute-trigger') || '';
    //             if (triggerAttr.trim()) {
    //                 const triggers = triggerAttr.split(',').map(s => s.trim()).filter(Boolean);
    //                 setData(element, 'liveComputeTriggers', triggers);
    //             } else {
    //                 removeData(element, 'liveComputeTriggers');
    //             }
    //         });
    //         setData(rootScope, DEPENDENCY_MAP_KEY, depMap);

    //         // build trigger map: varName -> Set(elements)
    //         const triggerMap = new Map();
    //         find('[live-compute-trigger]').forEach(function (element) {
    //             const triggers = getData(element, 'liveComputeTriggers') || [];
    //             triggers.forEach(t => {
    //                 const setFor = triggerMap.get(t) || new Set();
    //                 setFor.add(element);
    //                 triggerMap.set(t, setFor);
    //             });
    //         });
    //         setData(rootScope, 'liveComputeTriggerMap', triggerMap);
    //     }


    //     function getGlobalInputs() {
    //         const inputs = {};
    //         find('input[name], select[name], textarea[name]').forEach(function (element) {
    //             const name = attr(element, 'name');
    //             if (name) {
    //                 inputs[sanitizeInputNameToJSVariable(name)] = val(element)?.toString().trim();
    //             }
    //         });
    //         return inputs;
    //     }

    //     function getRowIndices() {
    //         const indices = new Set();
    //         find('input[name], select[name], textarea[name]').forEach(function (element) {
    //             const nameAttr = attr(element, 'name');
    //             if (!nameAttr) return;
    //             const matches = [...nameAttr.matchAll(/\[(\d+)\]/g)];
    //             if (matches.length) {
    //                 matches.forEach(match => {
    //                     const num = parseInt(match[1], 10);
    //                     if (!isNaN(num)) indices.add(num);
    //                 });
    //             }
    //         });
    //         return indices;
    //     }

    //     function evaluateExpression(expr, globalInputs, indices) {
    //         const dateFnMatch = expr.match(/(rangeDate|rangeMonth|rangeYear|rangeWeek)\(([^)]+)\)/);
    //         if (dateFnMatch) {
    //             return handleDateFunction(dateFnMatch[1], dateFnMatch[2], globalInputs);
    //         }

    //         expr = processAggregateFunctions(expr, globalInputs, indices);

    //         const vars = extractVariables(expr);
    //         const vals = vars.map(v => toNumber(getValue(v, globalInputs)));

    //         try {
    //             return safeFunctionEvaluation(vars, vals, expr);
    //         } catch (e) {
    //             console.error('Evaluation error:', expr, e);
    //             return 0;
    //         }
    //     }

    //     function handleDateFunction(fnName, argsStr, globalInputs) {
    //         const args = argsStr.split(',').map(arg => {
    //             const varName = arg.trim();
    //             return getValue(varName, globalInputs);
    //         });

    //         if (args.length !== 2 || !args[0] || !args[1]) return 0;

    //         try {
    //             return dateUtils[fnName](args[0], args[1]);
    //         } catch (e) {
    //             console.error(`${fnName} execution error:`, e);
    //             return 0;
    //         }
    //     }

    //     const exprFuncCache = new Map();

    //     function safeFunctionEvaluation(vars, vals, expr) {
    //         if (!exprFuncCache.has(expr)) {
    //             const context = { ...dateUtils, parseFloat };
    //             const argNames = [...vars, ...Object.keys(context)];
    //             const func = new Function(...argNames, `return ${expr}`);
    //             exprFuncCache.set(expr, { func, context });
    //         }
    //         const { func, context } = exprFuncCache.get(expr);
    //         const argValues = [...vals, ...Object.values(context)];
    //         return func(...argValues);
    //     }

    //     function processAggregateFunctions(expr, globalInputs, indices) {
    //         // SUMIF
    //         expr = expr.replace(/sumif\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g,
    //             (_, criteriaRange, criteria, sumRange) => {
    //                 const vals = getSumIfValues(criteriaRange, criteria, sumRange, globalInputs, indices);
    //                 return calculateAggregate('sum', vals);
    //             }
    //         );

    //         // SUM, AVG, MIN, MAX, COUNT
    //         return expr.replace(/(sum|avg|min|max|count)\(([^()]+)\)/g,
    //             (_, fn, arg) => {
    //                 const vals = getAggregateValues(arg, globalInputs, indices);
    //                 return calculateAggregate(fn, vals);
    //             }
    //         );
    //     }

    //     function getSumIfValues(criteriaRange, criteria, sumRange, globalInputs, indices) {
    //         const vals = [];

    //         // Kalau pakai wildcard ? → iterasi semua index
    //         if (criteriaRange.includes('?') || sumRange.includes('?')) {
    //             indices.forEach(i => {
    //                 const critVal = getValue(criteriaRange.replace(/\?/g, i), globalInputs);
    //                 const sumVal = toNumber(getValue(sumRange.replace(/\?/g, i), globalInputs));

    //                 if (matchCriteria(critVal, criteria)) {
    //                     vals.push(sumVal);
    //                 }
    //             });
    //         } else {
    //             const critVal = getValue(criteriaRange, globalInputs);
    //             const sumVal = toNumber(getValue(sumRange, globalInputs));
    //             if (matchCriteria(critVal, criteria)) {
    //                 vals.push(sumVal);
    //             }
    //         }

    //         return vals;
    //     }

    //     function matchCriteria(value, criteria) {
    //         criteria = criteria.trim();

    //         // Jika numeric langsung bandingkan
    //         if (!isNaN(criteria)) {
    //             return Number(value) === Number(criteria);
    //         }

    //         // Excel style operator
    //         const opMatch = criteria.match(/^(>=|<=|==|!=|<>|>|<)\s*(.+)$/);
    //         if (opMatch) {
    //             let [, op, critVal] = opMatch;
    //             if (op === '<>') op = '!='; // konversi Excel <> jadi != JS

    //             const numCrit = Number(critVal);
    //             const numVal = Number(value);

    //             switch (op) {
    //                 case '>': return numVal > numCrit;
    //                 case '<': return numVal < numCrit;
    //                 case '>=': return numVal >= numCrit;
    //                 case '<=': return numVal <= numCrit;
    //                 case '==': return numVal == numCrit;
    //                 case '!=': return numVal != numCrit;
    //             }
    //         }

    //         // Jika string, langsung bandingkan
    //         return String(value) === criteria;
    //     }



    //     function getAggregateValues(arg, globalInputs, indices) {
    //         arg = arg.trim();
    //         const vals = [];

    //         if (arg.includes('?')) {
    //             indices.forEach(i => vals.push(toNumber(getValue(arg.replace(/\?/g, i), globalInputs))));
    //         } else {
    //             vals.push(toNumber(getValue(arg, globalInputs)));
    //         }

    //         return vals;
    //     }

    //     function calculateAggregate(fn, vals) {
    //         vals = vals.filter(v => !isNaN(v));
    //         switch (fn) {
    //             case 'sum': return vals.reduce((a, b) => a + b, 0);
    //             case 'avg': return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    //             case 'min': return vals.length ? Math.min(...vals) : 0;
    //             case 'max': return vals.length ? Math.max(...vals) : 0;
    //             case 'count': return vals.length;
    //             default: return 0;
    //         }
    //     }

    //     // PERBAIKAN: Display result dengan handling yang lebih baik untuk bidirectional elements
    //     // ✅ Normalisasi angka agar tidak ada 1.99998
    //     function normalizeNumber(num, decimals = 2) {
    //         if (num === null || num === undefined || isNaN(num)) return 0;
    //         return parseFloat(num.toFixed(decimals));
    //     }

    //     // ✅ Display result dengan rawValue vs displayValue
    //     function displayResult(element, result, cache, sourceElement = null) {
    //         const format = attr(element, 'live-compute-format');

    //         // raw numeric value untuk kalkulasi
    //         let rawValue = toNumber(result);
    //         rawValue = normalizeNumber(rawValue);

    //         // display value untuk UI
    //         let displayValue = format ? formatResult(rawValue, format) : rawValue.toString();

    //         // Skip circular detection untuk hubungan bidirectional
    //         const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);
    //         const isBidirectional = sourceElement && bidirectionalMap.has(element) &&
    //             bidirectionalMap.get(element).has(sourceElement);

    //         if (!isBidirectional && detectCircularDependency(element, rawValue, sourceElement)) {
    //             return false;
    //         }

    //         const cachedValue = cache.get(element);

    //         // Bandingkan numeric, bukan string
    //         if (!isValueConverged(cachedValue, rawValue)) {
    //             cache.set(element, rawValue);

    //             // ✅ Update element dengan raw + display
    //             updateElementValue(element, rawValue, displayValue, sourceElement);
    //             return true;
    //         }

    //         return false;
    //     }

    //     // ✅ Update element tanpa overwrite kalau sedang fokus
    //     function updateElementValue(element, rawValue, displayValue, sourceElement = null) {
    //         if (sourceElement && element === sourceElement) return;

    //         // 🚀 Tambahkan pengecekan live-compute-auto
    //         const autoAttr = attr(element, 'live-compute-auto');
    //         const isAuto = (autoAttr === null || autoAttr === '' || autoAttr === 'true');
    //         if (!isAuto) {
    //             return; // skip update kalau auto = false
    //         }

    //         // Jangan overwrite kalau user sedang mengetik di input
    //         if (document.activeElement === element) {
    //             return;
    //         }

    //         // Token untuk mencegah update usang
    //         const currentToken = Date.now();
    //         const lastToken = getData(element, 'lastToken') || 0;
    //         if (currentToken <= lastToken) return;

    //         setData(element, 'lastToken', currentToken);
    //         setData(element, 'updating', true);

    //         if (element.matches('input, textarea, select')) {
    //             // ✅ Simpan rawValue tersembunyi untuk kalkulasi
    //             element.dataset.rawValue = rawValue;

    //             // ✅ Hanya tampilkan displayValue
    //             val(element, displayValue);
    //         } else {
    //             html(element, displayValue);
    //         }

    //         setTimeout(() => {
    //             removeData(element, 'updating');
    //         }, 1);
    //     }


    //     function formatResult(result, format) {
    //         if (result === null || result === undefined) {
    //             return '';
    //         }

    //         if (typeof result === 'string') {
    //             result = toNumber(result);
    //         }

    //         if (typeof result === 'number' && isNaN(result)) {
    //             return '';
    //         }

    //         if (typeof result === 'number') {
    //             result = Math.round(result * 100000) / 100000;
    //         }

    //         switch (format?.toLowerCase()) {
    //             case 'idr':
    //                 try {
    //                     return new Intl.NumberFormat('id-ID', {
    //                         minimumFractionDigits: 0,
    //                         maximumFractionDigits: 0
    //                     }).format(Math.floor(result));
    //                 } catch (e) {
    //                     return Math.floor(result).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    //                 }

    //             case 'currency':
    //             case 'dollar':
    //                 try {
    //                     return new Intl.NumberFormat('en-US', {
    //                         minimumFractionDigits: 0,
    //                         maximumFractionDigits: 0
    //                     }).format(Math.floor(result));
    //                 } catch (e) {
    //                     return Math.floor(result).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    //                 }

    //             case 'decimal':
    //                 if (typeof result === 'number') {
    //                     return result.toFixed(2);
    //                 }
    //                 return parseFloat(result).toFixed(2);

    //             case 'percent':
    //                 if (typeof result === 'number') {
    //                     return (result * 100).toFixed(2) + '%';
    //                 }
    //                 return (parseFloat(result) * 100).toFixed(2) + '%';

    //             case 'number':
    //                 try {
    //                     return new Intl.NumberFormat('id-ID').format(result);
    //                 } catch (e) {
    //                     return result.toString();
    //                 }

    //             case 'days':
    //                 return Math.floor(result) + ' days';

    //             case 'months':
    //                 return Math.floor(result) + ' months';

    //             case 'years':
    //                 return Math.floor(result) + ' years';

    //             case 'weeks':
    //                 return Math.floor(result) + ' weeks';

    //             default:
    //                 return result.toString();
    //         }
    //     }

    //     function formatInputValue(element, value) {
    //         const format = attr(element, 'live-compute-format');
    //         if (!format || getData(element, 'updating')) return value;

    //         if (!value || value.trim() === '') return value;

    //         const numValue = toNumber(value);

    //         if (numValue === 0 && value !== '0' && value.trim() !== '0') {
    //             if (value.match(/[\d.,]/)) {
    //                 return value;
    //             }
    //             return '';
    //         }

    //         try {
    //             return formatResult(numValue, format);
    //         } catch (e) {
    //             console.error('Format error:', e);
    //             return value;
    //         }
    //     }

    //     function getValue(varName, globalInputs) {
    //         const rowMatch = varName.match(/^rows_(\d+)_(.+)$/);
    //         if (rowMatch) {
    //             const [_, index, field] = rowMatch;
    //             const selector = `[name="rows[${index}][${field}]"]`;
    //             const element = rootScope.querySelector(selector);
    //             return element ? val(element).toString().trim() : '';
    //         }
    //         return globalInputs[varName] || '';
    //     }

    //     function toNumber(val) {
    //         if (val == null || val === '') return 0;

    //         val = val.toString().trim();
    //         if (val === '' || val === '-') return 0;

    //         const isPercentage = val.includes('%');
    //         val = val.replace(/%/g, '');

    //         const isNegative = /^-/.test(val);
    //         val = val.replace(/^-/, '');

    //         val = val.replace(/[^\d.,]/g, '');

    //         if (val === '') return 0;

    //         let result = 0;

    //         if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(val)) {
    //             result = parseFloat(val.replace(/\./g, '').replace(',', '.'));
    //         }
    //         else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(val)) {
    //             result = parseFloat(val.replace(/,/g, ''));
    //         }
    //         else if (/^\d+([.,]\d+)?$/.test(val)) {
    //             if (val.includes(',')) {
    //                 result = parseFloat(val.replace(',', '.'));
    //             } else {
    //                 result = parseFloat(val);
    //             }
    //         }
    //         else {
    //             result = parseFloat(val.replace(/[.,]/g, ''));
    //         }

    //         if (isNaN(result)) result = 0;
    //         if (isNegative) result = -result;
    //         if (isPercentage) result = result / 100;

    //         return result;
    //     }

    //     function extractVariables(expr) {
    //         const vars = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    //         return [...new Set(vars.filter(v => !/^\d+$/.test(v) && !dateUtils[v]))];
    //     }

    //     function sanitizeInputNameToJSVariable(name) {
    //         return name.replace(/\]\[/g, '_')
    //             .replace(/[\[\]]/g, '')
    //             .replace(/[^a-zA-Z0-9_]/g, '_');
    //     }

    //     function addEventListener(selector, event, handler, context = rootScope) {
    //         context.addEventListener(event, function (e) {
    //             if (e.target.matches(selector)) {
    //                 handler.call(e.target, e);
    //             }
    //         });
    //     }

    //     function init() {
    //         process();

    //         let lastInputTime = 0;
    //         let formatTimeout = new Map();
    //         let bidirectionalElements = new Map();

    //         // Identifikasi elemen bidirectional dengan lebih akurat
    //         find('[live-compute-skip="true"]').forEach(function (element) {
    //             const expr = attr(element, 'live-compute') || '';
    //             const vars = extractVariables(expr);

    //             find('[live-compute]').forEach(function (otherElement) {
    //                 const otherExpr = attr(otherElement, 'live-compute') || '';
    //                 const otherVars = extractVariables(otherExpr);

    //                 if (vars.some(v => otherVars.includes(v)) && otherElement !== element) {
    //                     if (!bidirectionalElements.has(element)) {
    //                         bidirectionalElements.set(element, new Set());
    //                     }
    //                     bidirectionalElements.get(element).add(otherElement);

    //                     if (!bidirectionalElements.has(otherElement)) {
    //                         bidirectionalElements.set(otherElement, new Set());
    //                     }
    //                     bidirectionalElements.get(otherElement).add(element);

    //                     const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY) || new Map();
    //                     if (!bidirectionalMap.has(element)) {
    //                         bidirectionalMap.set(element, new Set());
    //                     }
    //                     bidirectionalMap.get(element).add(otherElement);

    //                     if (!bidirectionalMap.has(otherElement)) {
    //                         bidirectionalMap.set(otherElement, new Set());
    //                     }
    //                     bidirectionalMap.get(otherElement).add(element);

    //                     setData(rootScope, BIDIRECTIONAL_TRACKING_KEY, bidirectionalMap);
    //                 }
    //             });
    //         });

    //         addEventListener('[live-compute-skip="true"]', 'input', function () {
    //             if (getData(this, 'updating')) return;
    //             setData(this, 'lastManualInput', Date.now());

    //             if (bidirectionalElements.has(this)) {
    //                 processImmediate(this);
    //             } else {
    //                 processImmediate();
    //             }
    //         });

    //         addEventListener('input[name], select[name], textarea[name]', 'input', function () {
    //             if (getData(this, 'updating')) return;
    //             setData(this, 'lastManualInput', Date.now());
    //             processImmediate();
    //         });

    //         // === PATCHED ===
    //         addEventListener('input[live-compute-format]', 'input', function () {
    //             if (getData(this, 'updating')) return;

    //             const element = this;
    //             const currentValue = val(this);

    //             setData(element, 'lastManualInput', Date.now());

    //             // 🚫 Jika ada live-compute-skip → jangan format realtime
    //             if (element.hasAttribute('live-compute-skip')) {
    //                 return; // biarkan user ngetik normal
    //             }

    //             if (formatTimeout.has(element)) {
    //                 clearTimeout(formatTimeout.get(element));
    //             }

    //             const now = Date.now();
    //             if (!element.hasAttribute('live-compute-skip')) {
    //                 if (now - lastInputTime > 10) {
    //                     lastInputTime = now;
    //                     processImmediate();
    //                 }
    //             }

    //             const timeout = setTimeout(() => {
    //                 if (getData(element, 'updating')) return;

    //                 const cursorPos = element.selectionStart;
    //                 const oldValue = val(element);

    //                 const lastFormattedValue = getData(element, 'lastFormattedValue') || '';
    //                 if (oldValue === lastFormattedValue) {
    //                     formatTimeout.delete(element);
    //                     return;
    //                 }

    //                 const newValue = formatInputValue(element, oldValue);

    //                 if (oldValue !== newValue && newValue !== '') {
    //                     setData(element, 'updating', true);
    //                     val(element, newValue);
    //                     setData(element, 'lastFormattedValue', newValue);

    //                     let newCursorPos = cursorPos;
    //                     const lengthDiff = newValue.length - oldValue.length;

    //                     if (lengthDiff !== 0) {
    //                         const beforeCursor = oldValue.substring(0, cursorPos);
    //                         const numericBeforeCursor = beforeCursor.replace(/[^\d]/g, '');

    //                         let targetPos = 0;
    //                         let numericCount = 0;

    //                         for (let i = 0; i < newValue.length; i++) {
    //                             if (/\d/.test(newValue[i])) {
    //                                 numericCount++;
    //                             }
    //                             if (numericCount >= numericBeforeCursor.length) {
    //                                 targetPos = i + 1;
    //                                 break;
    //                             }
    //                         }

    //                         newCursorPos = Math.min(targetPos, newValue.length);
    //                     }

    //                     newCursorPos = Math.max(0, Math.min(newCursorPos, newValue.length));

    //                     try {
    //                         element.setSelectionRange(newCursorPos, newCursorPos);
    //                     } catch (e) { }

    //                     setTimeout(() => {
    //                         removeData(element, 'updating');
    //                     }, 50);
    //                 }

    //                 formatTimeout.delete(element);
    //             }, 200);

    //             formatTimeout.set(element, timeout);
    //         });
    //         // === END PATCH ===

    //         addEventListener('input:not([live-compute-format]):not([live-compute-skip="true"]), select:not([live-compute-skip="true"]), textarea:not([live-compute-skip="true"])', 'input', function () {
    //             if (getData(this, 'updating')) return;

    //             const now = Date.now();
    //             if (now - lastInputTime > 10) {
    //                 lastInputTime = now;
    //                 processImmediate();
    //             }
    //         });

    //         addEventListener('input, select, textarea', 'change', function () {
    //             if (getData(this, 'updating')) return;
    //             debounceProcess();
    //         });

    //         addEventListener('[live-compute-skip="true"]', 'blur', function () {
    //             debounceProcess();
    //         });

    //         addEventListener('input[live-compute-format]', 'blur', function () {
    //             const element = this;

    //             if (formatTimeout.has(element)) {
    //                 clearTimeout(formatTimeout.get(element));
    //                 formatTimeout.delete(element);
    //             }

    //             const currentValue = val(this);

    //             if (currentValue && currentValue.trim() !== '') {
    //                 let formattedValue = formatInputValue(this, currentValue);

    //                 // 🚀 PATCH: kalau hasil format kosong → paksa fallback ke number formatting
    //                 if (!formattedValue || formattedValue.trim() === '') {
    //                     const numValue = toNumber(currentValue);
    //                     formattedValue = formatResult(numValue, attr(this, 'live-compute-format'));
    //                 }

    //                 // 🚀 PATCH: walaupun ada live-compute-skip tetap paksa format saat blur
    //                 val(this, formattedValue);
    //                 setData(this, 'lastFormattedValue', formattedValue);
    //             }

    //             // Hapus flag updating biar siap dipakai lagi
    //             removeData(this, 'updating');

    //             // Tetap trigger proses compute lain
    //             debounceProcess();
    //         });



    //         addEventListener('input[live-compute-format]', 'focus', function () {
    //             const currentValue = val(this);

    //             const lastFormattedValue = getData(this, 'lastFormattedValue') || '';
    //             if (currentValue && currentValue.trim() !== '' && currentValue !== lastFormattedValue) {
    //                 const formattedValue = formatInputValue(this, currentValue);
    //                 if (currentValue !== formattedValue) {
    //                     setData(this, 'updating', true);
    //                     val(this, formattedValue);
    //                     setData(this, 'lastFormattedValue', formattedValue);

    //                     setTimeout(() => {
    //                         removeData(this, 'updating');
    //                     }, 50);
    //                 }
    //             }
    //         });

    //         rootScope.addEventListener('live-dom:afterAppend', () => {
    //             buildDependencyMap();
    //             process();
    //         });
    //         rootScope.addEventListener('live-dom:afterUpdate', () => {
    //             buildDependencyMap();
    //             process();
    //         });

    //         if (typeof MutationObserver !== 'undefined') {
    //             const observer = new MutationObserver((mutations) => {
    //                 let shouldRebuild = false;
    //                 mutations.forEach((mutation) => {
    //                     if (mutation.type === 'childList') {
    //                         mutation.addedNodes.forEach((node) => {
    //                             if (node.nodeType === Node.ELEMENT_NODE) {
    //                                 if (node.hasAttribute && node.hasAttribute('live-compute')) {
    //                                     shouldRebuild = true;
    //                                 } else if (node.querySelector && node.querySelector('[live-compute]')) {
    //                                     shouldRebuild = true;
    //                                 }
    //                             }
    //                         });
    //                     }
    //                 });

    //                 if (shouldRebuild) {
    //                     buildDependencyMap();
    //                     process();
    //                 }
    //             });

    //             observer.observe(rootScope, {
    //                 childList: true,
    //                 subtree: true
    //             });
    //         }
    //     }

    //     init();
    // }


    /*==============================
      LIVE COMPUTE
    ==============================*/

    function handleLiveComputeUnified(scope) {
        const rootScope = scope || document;
        const COMPUTE_CACHE_KEY = 'liveComputeCache';
        const DEPENDENCY_MAP_KEY = 'liveComputeDeps';
        const CIRCULAR_DETECTION_KEY = 'circularDetection';
        const BIDIRECTIONAL_TRACKING_KEY = 'bidirectionalTracking';
        const UPDATE_QUEUE_KEY = 'computeUpdateQueue';
        const DEBOUNCE_DELAY = 100;
        const BATCH_SIZE = 15;
        const MAX_ITERATIONS = 3;
        const PRECISION_TOLERANCE = 0.0001;

        let processingPromise = null;
        let debounceTimer;
        let immediateTimeout;
        let iterationCount = 0;
        let bidirectionalUpdateInProgress = false;

        // Data storage using WeakMap for element data and Map for scope data
        const elementData = new WeakMap();
        const scopeData = new Map();

        // Helper functions to replace jQuery data functionality
        function getData(element, key) {
            if (element === rootScope) {
                return scopeData.get(key);
            }
            const data = elementData.get(element) || {};
            return data[key];
        }

        function setData(element, key, value) {
            if (element === rootScope) {
                scopeData.set(key, value);
                return;
            }
            const data = elementData.get(element) || {};
            data[key] = value;
            elementData.set(element, data);
        }

        function removeData(element, key) {
            if (element === rootScope) {
                scopeData.delete(key);
                return;
            }
            const data = elementData.get(element) || {};
            delete data[key];
            elementData.set(element, data);
        }

        // Helper functions to replace jQuery selectors and methods
        function find(selector, context = rootScope) {
            return Array.from(context.querySelectorAll(selector));
        }

        function filter(elements, callback) {
            return elements.filter(callback);
        }

        function val(element, value) {
            if (value !== undefined) {
                element.value = value;
                return element;
            }
            return element.value || '';
        }

        function attr(element, attribute) {
            return element.getAttribute(attribute);
        }

        function html(element, content) {
            if (content !== undefined) {
                element.innerHTML = content;
                return element;
            }
            return element.innerHTML;
        }

        function is(element, selector) {
            if (selector === ':focus') {
                return document.activeElement === element;
            }
            return element.matches(selector);
        }

        // Date calculation functions
        const dateUtils = {
            rangeDate: (start, end) => {
                try {
                    if (!start || !end) return 0;

                    const [sY, sM, sD] = start.split('-').map(Number);
                    const [eY, eM, eD] = end.split('-').map(Number);

                    const startDate = new Date(sY, sM - 1, sD);
                    const endDate = new Date(eY, eM - 1, eD);

                    // hitung selisih berdasarkan tanggal saja
                    const diffTime = endDate.getTime() - startDate.getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                    return diffDays;
                } catch (e) {
                    console.error('rangeDate error:', e);
                    return 0;
                }
            },

            rangeMonth: (start, end) => {
                try {
                    if (!start || !end) return 0;
                    const d1 = new Date(start);
                    const d2 = new Date(end);
                    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
                    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
                } catch (e) {
                    console.error('rangeMonth error:', e);
                    return 0;
                }
            },
            rangeYear: (start, end) => {
                try {
                    if (!start || !end) return 0;
                    const d1 = new Date(start);
                    const d2 = new Date(end);
                    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
                    return d2.getFullYear() - d1.getFullYear();
                } catch (e) {
                    console.error('rangeYear error:', e);
                    return 0;
                }
            },
            rangeWeek: (start, end) => {
                try {
                    if (!start || !end) return 0;
                    const d1 = new Date(start);
                    const d2 = new Date(end);
                    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
                    return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24 * 7));
                } catch (e) {
                    console.error('rangeWeek error:', e);
                    return 0;
                }
            }
        };

        // ========== BIDIRECTIONAL QUEUE SYSTEM ==========

        function initBidirectionalQueue() {
            if (!getData(rootScope, BIDIRECTIONAL_TRACKING_KEY)) {
                setData(rootScope, BIDIRECTIONAL_TRACKING_KEY, new Map());
            }
            if (!getData(rootScope, UPDATE_QUEUE_KEY)) {
                setData(rootScope, UPDATE_QUEUE_KEY, {
                    queue: [],
                    processing: false,
                    priorities: new Map()
                });
            }
            if (!getData(rootScope, COMPUTE_CACHE_KEY)) {
                setData(rootScope, COMPUTE_CACHE_KEY, new Map());
            }
            if (!getData(rootScope, DEPENDENCY_MAP_KEY)) {
                buildDependencyMap();
            }
            if (!getData(rootScope, CIRCULAR_DETECTION_KEY)) {
                setData(rootScope, CIRCULAR_DETECTION_KEY, new Map());
            }
        }

        function enqueueComputeUpdate(element, priority = 'normal', sourceElement = null) {
            const queueData = getData(rootScope, UPDATE_QUEUE_KEY);
            const existingIndex = queueData.queue.findIndex(item =>
                item.element === element && item.priority === priority
            );

            if (existingIndex >= 0) {
                queueData.queue.splice(existingIndex, 1);
            }

            queueData.queue.push({
                element,
                priority,
                sourceElement,
                timestamp: Date.now()
            });

            // Sort by priority: high > normal > low
            queueData.queue.sort((a, b) => {
                const priorityOrder = { high: 3, normal: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority] ||
                    a.timestamp - b.timestamp;
            });

            // Limit queue size to prevent memory leaks
            if (queueData.queue.length > 100) {
                queueData.queue = queueData.queue.slice(-80);
            }
        }

        function processComputeQueue() {
            const queueData = getData(rootScope, UPDATE_QUEUE_KEY);
            if (queueData.processing || queueData.queue.length === 0) {
                return;
            }

            queueData.processing = true;
            const batch = queueData.queue.splice(0, BATCH_SIZE);

            processBatchWithQueue(batch).finally(() => {
                queueData.processing = false;
                if (queueData.queue.length > 0) {
                    setTimeout(processComputeQueue, 10);
                }
            });
        }

        async function processBatchWithQueue(batch) {
            const cache = getData(rootScope, COMPUTE_CACHE_KEY);
            const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);

            for (const { element, sourceElement } of batch) {
                if (!element.isConnected) continue;

                const expr = attr(element, 'live-compute')?.trim() || '';
                if (!expr) continue;

                try {
                    // Skip if this is source element in bidirectional update
                    if (sourceElement && element === sourceElement) {
                        continue;
                    }

                    const hasSkipAttr = attr(element, 'live-compute-skip') === 'true';
                    const isFocused = is(element, ':focus');
                    const isUpdating = getData(element, 'updating') === true;

                    if (hasSkipAttr && isFocused) {
                        continue;
                    }

                    if (isUpdating) {
                        continue;
                    }

                    const lastManualInput = getData(element, 'lastManualInput') || 0;
                    if (hasSkipAttr && Date.now() - lastManualInput < 1000) {
                        continue;
                    }

                    // ===== ADDED: support live-compute-trigger =====
                    const triggerAttr = attr(element, 'live-compute-trigger') || '';
                    if (triggerAttr.trim()) {
                        const triggers = triggerAttr.split(',').map(s => s.trim()).filter(Boolean);
                        let anyRecent = false;
                        const now = Date.now();
                        const THRESHOLD_MS = 1500; // window: 1.5s (sesuaikan kalau perlu)

                        // cari input yang sesuai setiap trigger, cek lastManualInput-nya
                        for (const t of triggers) {
                            // cari input/select/textarea dengan nama yang jika disanitize = t
                            const inputs = find('input[name], select[name], textarea[name]');
                            for (const inp of inputs) {
                                const nameAttr = attr(inp, 'name');
                                if (!nameAttr) continue;
                                const sanitized = sanitizeInputNameToJSVariable(nameAttr);
                                if (sanitized === t) {
                                    const last = getData(inp, 'lastManualInput') || 0;
                                    if (now - last < THRESHOLD_MS) {
                                        anyRecent = true;
                                        break;
                                    }
                                }
                            }
                            if (anyRecent) break;
                        }

                        // kalau tidak ada trigger recent, skip element ini
                        if (!anyRecent) {
                            continue;
                        }
                    }
                    // ===== END ADDED =====

                    const globalInputs = getGlobalInputs();
                    const indices = getRowIndices();
                    const result = evaluateExpression(expr, globalInputs, indices);

                    // Enhanced circular detection for bidirectional
                    const isBidirectional = sourceElement && bidirectionalMap.has(element) &&
                        bidirectionalMap.get(element).has(sourceElement);

                    const changed = displayResult(element, result, cache, sourceElement, isBidirectional);

                    if (changed && !isBidirectional) {
                        // If this element changed and has bidirectional relationships, queue them
                        if (bidirectionalMap.has(element)) {
                            bidirectionalMap.get(element).forEach(bidirectionalEl => {
                                if (bidirectionalEl !== sourceElement && bidirectionalEl.isConnected) {
                                    enqueueComputeUpdate(bidirectionalEl, 'high', element);
                                }
                            });
                        }
                    }

                } catch (error) {
                    console.error('LiveCompute error:', error);
                    if (attr(element, 'live-compute-skip') !== 'true') {
                        displayResult(element, '', cache, sourceElement, false);
                    }
                }
            }

            // Process next batch if queue has more items
            const queueData = getData(rootScope, UPDATE_QUEUE_KEY);
            if (queueData.queue.length > 0) {
                setTimeout(processComputeQueue, 5);
            }
        }

        // ========== ENHANCED DEPENDENCY MAPPING ==========

        function buildDependencyMap() {
            const depMap = new Map();
            const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY) || new Map();
            bidirectionalMap.clear();

            find('[live-compute]').forEach(function (element) {
                const expr = attr(element, 'live-compute')?.trim() || '';
                depMap.set(element, extractVariables(expr));

                // Enhanced bidirectional detection
                const dependencies = extractVariables(expr);
                dependencies.forEach(dep => {
                    find('[live-compute]').forEach(otherElement => {
                        if (otherElement === element) return;

                        const otherExpr = attr(otherElement, 'live-compute')?.trim() || '';
                        const otherDeps = extractVariables(otherExpr);

                        if (otherDeps.includes(dep)) {
                            if (!bidirectionalMap.has(element)) {
                                bidirectionalMap.set(element, new Set());
                            }
                            bidirectionalMap.get(element).add(otherElement);
                        }
                    });
                });

                // parse live-compute-trigger dan simpan pada element (untuk akses cepat)
                const triggerAttr = attr(element, 'live-compute-trigger') || '';
                if (triggerAttr.trim()) {
                    const triggers = triggerAttr.split(',').map(s => s.trim()).filter(Boolean);
                    setData(element, 'liveComputeTriggers', triggers);
                } else {
                    removeData(element, 'liveComputeTriggers');
                }
            });
            setData(rootScope, DEPENDENCY_MAP_KEY, depMap);
            setData(rootScope, BIDIRECTIONAL_TRACKING_KEY, bidirectionalMap);

            // build trigger map: varName -> Set(elements)
            const triggerMap = new Map();
            find('[live-compute-trigger]').forEach(function (element) {
                const triggers = getData(element, 'liveComputeTriggers') || [];
                triggers.forEach(t => {
                    const setFor = triggerMap.get(t) || new Set();
                    setFor.add(element);
                    triggerMap.set(t, setFor);
                });
            });
            setData(rootScope, 'liveComputeTriggerMap', triggerMap);
        }

        // ========== OPTIMIZED PROCESS FUNCTION ==========

        function process(sourceElement = null) {
            if (processingPromise) {
                return processingPromise.then(() => {
                    // After current process, enqueue new one
                    if (sourceElement) {
                        enqueueComputeUpdate(sourceElement, 'high');
                    } else {
                        // Process all compute elements with normal priority
                        const computeElements = find('[live-compute]');
                        computeElements.forEach(el => {
                            if (el.isConnected) {
                                enqueueComputeUpdate(el, 'normal', sourceElement);
                            }
                        });
                    }
                    processComputeQueue();
                });
            }

            processingPromise = new Promise((resolve) => {
                const cache = getData(rootScope, COMPUTE_CACHE_KEY);
                const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);
                iterationCount = 0;
                bidirectionalUpdateInProgress = !!sourceElement;

                const elements = filter(find('[live-compute]'), function (element) {
                    const expr = attr(element, 'live-compute')?.trim() || '';
                    return expr.length > 0 && element.isConnected;
                });

                let index = 0;
                let hasChanges = false;

                function processBatch() {
                    const batch = elements.slice(index, index + BATCH_SIZE);
                    let batchHasChanges = false;

                    batch.forEach(function (element) {
                        // Skip jika ini adalah source element dari bidirectional update
                        if (sourceElement && element === sourceElement) {
                            return;
                        }

                        const expr = attr(element, 'live-compute')?.trim() || '';

                        try {
                            const hasSkipAttr = attr(element, 'live-compute-skip') === 'true';
                            const isFocused = is(element, ':focus');
                            const isUpdating = getData(element, 'updating') === true;

                            if (hasSkipAttr && isFocused) {
                                return;
                            }

                            if (isUpdating) {
                                return;
                            }

                            const lastManualInput = getData(element, 'lastManualInput') || 0;
                            if (hasSkipAttr && Date.now() - lastManualInput < 1000) {
                                return;
                            }

                            // ===== ADDED: support live-compute-trigger =====
                            const triggerAttr = attr(element, 'live-compute-trigger') || '';
                            if (triggerAttr.trim()) {
                                const triggers = triggerAttr.split(',').map(s => s.trim()).filter(Boolean);
                                let anyRecent = false;
                                const now = Date.now();
                                const THRESHOLD_MS = 1500; // window: 1.5s (sesuaikan kalau perlu)

                                // cari input yang sesuai setiap trigger, cek lastManualInput-nya
                                for (const t of triggers) {
                                    // cari input/select/textarea dengan nama yang jika disanitize = t
                                    const inputs = find('input[name], select[name], textarea[name]');
                                    for (const inp of inputs) {
                                        const nameAttr = attr(inp, 'name');
                                        if (!nameAttr) continue;
                                        const sanitized = sanitizeInputNameToJSVariable(nameAttr);
                                        if (sanitized === t) {
                                            const last = getData(inp, 'lastManualInput') || 0;
                                            if (now - last < THRESHOLD_MS) {
                                                anyRecent = true;
                                                break;
                                            }
                                        }
                                    }
                                    if (anyRecent) break;
                                }

                                // kalau tidak ada trigger recent, skip element ini
                                if (!anyRecent) {
                                    return;
                                }
                            }
                            // ===== END ADDED =====

                            const globalInputs = getGlobalInputs();
                            const indices = getRowIndices();
                            const result = evaluateExpression(expr, globalInputs, indices);

                            // Check if this is a bidirectional relationship
                            const isBidirectional = sourceElement && bidirectionalMap.has(element) &&
                                bidirectionalMap.get(element).has(sourceElement);

                            const changed = displayResult(element, result, cache, sourceElement, isBidirectional);

                            if (changed) {
                                batchHasChanges = true;
                                hasChanges = true;

                                // If this element changed and has bidirectional relationships, queue them
                                if (!isBidirectional && bidirectionalMap.has(element)) {
                                    bidirectionalMap.get(element).forEach(bidirectionalEl => {
                                        if (bidirectionalEl !== sourceElement && bidirectionalEl.isConnected) {
                                            enqueueComputeUpdate(bidirectionalEl, 'high', element);
                                        }
                                    });
                                }
                            }
                        } catch (error) {
                            console.error('LiveCompute error:', error);
                            if (attr(element, 'live-compute-skip') !== 'true') {
                                displayResult(element, '', cache, sourceElement, false);
                            }
                        }
                    });

                    index += BATCH_SIZE;

                    if (index < elements.length) {
                        if ('requestIdleCallback' in window) {
                            requestIdleCallback(processBatch, { timeout: 100 });
                        } else {
                            setTimeout(processBatch, 20);
                        }
                    } else {
                        iterationCount++;

                        if (hasChanges && iterationCount < MAX_ITERATIONS) {
                            index = 0;
                            hasChanges = false;
                            setTimeout(processBatch, 10);
                        } else {
                            if (iterationCount >= MAX_ITERATIONS) {
                                console.warn('Live compute reached max iterations');
                            }

                            setTimeout(() => {
                                // Hanya reset circular detection jika bukan bidirectional update
                                if (!sourceElement) {
                                    setData(rootScope, CIRCULAR_DETECTION_KEY, new Map());
                                }
                            }, 1000);

                            processingPromise = null;
                            bidirectionalUpdateInProgress = false;
                            resolve();
                        }
                    }
                }

                processBatch();
            }).finally(() => {
                processingPromise = null;
                bidirectionalUpdateInProgress = false;
            });

            return processingPromise;
        }

        // ========== ENHANCED CIRCULAR DEPENDENCY DETECTION ==========

        function detectCircularDependency(element, newValue, sourceElement = null, isBidirectional = false) {
            // Skip circular detection untuk elemen yang saling bergantung (bidirectional)
            if (sourceElement) {
                const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);
                if (bidirectionalMap.has(element) && bidirectionalMap.get(element).has(sourceElement)) {
                    // For bidirectional, use more lenient detection
                    if (isBidirectional) {
                        const circularMap = getData(rootScope, CIRCULAR_DETECTION_KEY);
                        const key = element;

                        if (!circularMap.has(key)) {
                            circularMap.set(key, []);
                        }

                        const history = circularMap.get(key);

                        if (history.length > 0) {
                            const lastValue = history[history.length - 1];
                            if (isValueConverged(lastValue, newValue)) {
                                return true;
                            }
                        }

                        history.push(newValue);
                        if (history.length > 8) {
                            history.shift();
                        }
                        return false;
                    }
                    return false;
                }
            }

            const circularMap = getData(rootScope, CIRCULAR_DETECTION_KEY);
            const key = element;

            if (!circularMap.has(key)) {
                circularMap.set(key, []);
            }

            const history = circularMap.get(key);

            // Track source element untuk bidirectional
            if (sourceElement) {
                const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);
                if (!bidirectionalMap.has(key)) {
                    bidirectionalMap.set(key, new Set());
                }
                bidirectionalMap.get(key).add(sourceElement);
            }

            if (history.length > 0) {
                const lastValue = history[history.length - 1];
                if (isValueConverged(lastValue, newValue)) {
                    return true;
                }
            }

            history.push(newValue);

            if (history.length > 10) {
                history.shift();
            }

            if (history.length >= 4) {
                const len = history.length;
                const isOscillating =
                    isValueConverged(history[len - 1], history[len - 3]) &&
                    isValueConverged(history[len - 2], history[len - 4]);

                if (isOscillating) {
                    console.warn('Circular dependency detected, stabilizing value:', key);
                    return true;
                }
            }

            return false;
        }

        function scheduleProcess(delay = 0, sourceElement = null) {
            clearTimeout(immediateTimeout);
            clearTimeout(debounceTimer);

            if (sourceElement) {
                enqueueComputeUpdate(sourceElement, 'high');
                if (delay <= 30) {
                    immediateTimeout = setTimeout(processComputeQueue, delay);
                } else {
                    debounceTimer = setTimeout(processComputeQueue, delay);
                }
            } else {
                const timerId = setTimeout(() => {
                    process(sourceElement).then(processComputeQueue);
                }, delay);

                if (delay <= 30) {
                    immediateTimeout = timerId;
                } else {
                    debounceTimer = timerId;
                }
            }
        }

        function processImmediate(sourceElement = null) {
            if (sourceElement) {
                enqueueComputeUpdate(sourceElement, 'high');
                processComputeQueue();
            } else {
                scheduleProcess(30, sourceElement);
            }
        }

        function debounceProcess(sourceElement = null) {
            scheduleProcess(DEBOUNCE_DELAY, sourceElement);
        }

        function getGlobalInputs() {
            const inputs = {};
            find('input[name], select[name], textarea[name]').forEach(function (element) {
                const name = attr(element, 'name');
                if (name) {
                    inputs[sanitizeInputNameToJSVariable(name)] = val(element)?.toString().trim();
                }
            });
            return inputs;
        }

        function getRowIndices() {
            const indices = new Set();
            find('input[name], select[name], textarea[name]').forEach(function (element) {
                const nameAttr = attr(element, 'name');
                if (!nameAttr) return;
                const matches = [...nameAttr.matchAll(/\[(\d+)\]/g)];
                if (matches.length) {
                    matches.forEach(match => {
                        const num = parseInt(match[1], 10);
                        if (!isNaN(num)) indices.add(num);
                    });
                }
            });
            return indices;
        }

        function evaluateExpression(expr, globalInputs, indices) {
            const dateFnMatch = expr.match(/(rangeDate|rangeMonth|rangeYear|rangeWeek)\(([^)]+)\)/);
            if (dateFnMatch) {
                return handleDateFunction(dateFnMatch[1], dateFnMatch[2], globalInputs);
            }

            expr = processAggregateFunctions(expr, globalInputs, indices);

            const vars = extractVariables(expr);
            const vals = vars.map(v => toNumber(getValue(v, globalInputs)));

            try {
                return safeFunctionEvaluation(vars, vals, expr);
            } catch (e) {
                console.error('Evaluation error:', expr, e);
                return 0;
            }
        }

        function handleDateFunction(fnName, argsStr, globalInputs) {
            const args = argsStr.split(',').map(arg => {
                const varName = arg.trim();
                return getValue(varName, globalInputs);
            });

            if (args.length !== 2 || !args[0] || !args[1]) return 0;

            try {
                return dateUtils[fnName](args[0], args[1]);
            } catch (e) {
                console.error(`${fnName} execution error:`, e);
                return 0;
            }
        }

        const exprFuncCache = new Map();

        function safeFunctionEvaluation(vars, vals, expr) {
            if (!exprFuncCache.has(expr)) {
                const context = { ...dateUtils, parseFloat };
                const argNames = [...vars, ...Object.keys(context)];
                const func = new Function(...argNames, `return ${expr}`);
                exprFuncCache.set(expr, { func, context });
            }
            const { func, context } = exprFuncCache.get(expr);
            const argValues = [...vals, ...Object.values(context)];
            return func(...argValues);
        }

        function processAggregateFunctions(expr, globalInputs, indices) {
            // SUMIF
            expr = expr.replace(/sumif\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g,
                (_, criteriaRange, criteria, sumRange) => {
                    const vals = getSumIfValues(criteriaRange, criteria, sumRange, globalInputs, indices);
                    return calculateAggregate('sum', vals);
                }
            );

            // SUM, AVG, MIN, MAX, COUNT
            return expr.replace(/(sum|avg|min|max|count)\(([^()]+)\)/g,
                (_, fn, arg) => {
                    const vals = getAggregateValues(arg, globalInputs, indices);
                    return calculateAggregate(fn, vals);
                }
            );
        }

        function getSumIfValues(criteriaRange, criteria, sumRange, globalInputs, indices) {
            const vals = [];

            // Kalau pakai wildcard ? → iterasi semua index
            if (criteriaRange.includes('?') || sumRange.includes('?')) {
                indices.forEach(i => {
                    const critVal = getValue(criteriaRange.replace(/\?/g, i), globalInputs);
                    const sumVal = toNumber(getValue(sumRange.replace(/\?/g, i), globalInputs));

                    if (matchCriteria(critVal, criteria)) {
                        vals.push(sumVal);
                    }
                });
            } else {
                const critVal = getValue(criteriaRange, globalInputs);
                const sumVal = toNumber(getValue(sumRange, globalInputs));
                if (matchCriteria(critVal, criteria)) {
                    vals.push(sumVal);
                }
            }

            return vals;
        }

        function matchCriteria(value, criteria) {
            criteria = criteria.trim();

            // Jika numeric langsung bandingkan
            if (!isNaN(criteria)) {
                return Number(value) === Number(criteria);
            }

            // Excel style operator
            const opMatch = criteria.match(/^(>=|<=|==|!=|<>|>|<)\s*(.+)$/);
            if (opMatch) {
                let [, op, critVal] = opMatch;
                if (op === '<>') op = '!='; // konversi Excel <> jadi != JS

                const numCrit = Number(critVal);
                const numVal = Number(value);

                switch (op) {
                    case '>': return numVal > numCrit;
                    case '<': return numVal < numCrit;
                    case '>=': return numVal >= numCrit;
                    case '<=': return numVal <= numCrit;
                    case '==': return numVal == numCrit;
                    case '!=': return numVal != numCrit;
                }
            }

            // Jika string, langsung bandingkan
            return String(value) === criteria;
        }

        function getAggregateValues(arg, globalInputs, indices) {
            arg = arg.trim();
            const vals = [];

            if (arg.includes('?')) {
                indices.forEach(i => vals.push(toNumber(getValue(arg.replace(/\?/g, i), globalInputs))));
            } else {
                vals.push(toNumber(getValue(arg, globalInputs)));
            }

            return vals;
        }

        function calculateAggregate(fn, vals) {
            vals = vals.filter(v => !isNaN(v));
            switch (fn) {
                case 'sum': return vals.reduce((a, b) => a + b, 0);
                case 'avg': return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                case 'min': return vals.length ? Math.min(...vals) : 0;
                case 'max': return vals.length ? Math.max(...vals) : 0;
                case 'count': return vals.length;
                default: return 0;
            }
        }

        // ✅ Normalisasi angka agar tidak ada 1.99998
        function normalizeNumber(num, decimals = 2) {
            if (num === null || num === undefined || isNaN(num)) return 0;
            return parseFloat(num.toFixed(decimals));
        }

        // ✅ Display result dengan rawValue vs displayValue
        function displayResult(element, result, cache, sourceElement = null, isBidirectional = false) {
            const format = attr(element, 'live-compute-format');

            // raw numeric value untuk kalkulasi
            let rawValue = toNumber(result);
            rawValue = normalizeNumber(rawValue);

            // display value untuk UI
            let displayValue = format ? formatResult(rawValue, format) : rawValue.toString();

            // Skip circular detection untuk hubungan bidirectional
            const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY);
            const isBidirectionalRelation = sourceElement && bidirectionalMap.has(element) &&
                bidirectionalMap.get(element).has(sourceElement);

            if (!isBidirectionalRelation && detectCircularDependency(element, rawValue, sourceElement, isBidirectional)) {
                return false;
            }

            const cachedValue = cache.get(element);

            // Bandingkan numeric, bukan string
            if (!isValueConverged(cachedValue, rawValue)) {
                cache.set(element, rawValue);

                // ✅ Update element dengan raw + display
                updateElementValue(element, rawValue, displayValue, sourceElement);
                return true;
            }

            return false;
        }

        // ✅ Update element tanpa overwrite kalau sedang fokus
        function updateElementValue(element, rawValue, displayValue, sourceElement = null) {
            if (sourceElement && element === sourceElement) return;

            // 🚀 Tambahkan pengecekan live-compute-auto
            const autoAttr = attr(element, 'live-compute-auto');
            const isAuto = (autoAttr === null || autoAttr === '' || autoAttr === 'true');
            if (!isAuto) {
                return; // skip update kalau auto = false
            }

            // Jangan overwrite kalau user sedang mengetik di input
            if (document.activeElement === element) {
                return;
            }

            // Token untuk mencegah update usang
            const currentToken = Date.now();
            const lastToken = getData(element, 'lastToken') || 0;
            if (currentToken <= lastToken) return;

            setData(element, 'lastToken', currentToken);
            setData(element, 'updating', true);

            if (element.matches('input, textarea, select')) {
                // ✅ Simpan rawValue tersembunyi untuk kalkulasi
                element.dataset.rawValue = rawValue;

                // ✅ Hanya tampilkan displayValue
                val(element, displayValue);

                // Trigger events untuk integrasi yang better
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                html(element, displayValue);
            }

            setTimeout(() => {
                removeData(element, 'updating');
            }, 1);
        }

        function formatResult(result, format) {
            if (result === null || result === undefined) {
                return '';
            }

            if (typeof result === 'string') {
                result = toNumber(result);
            }

            if (typeof result === 'number' && isNaN(result)) {
                return '';
            }

            if (typeof result === 'number') {
                result = Math.round(result * 100000) / 100000;
            }

            switch (format?.toLowerCase()) {
                case 'idr':
                    try {
                        return new Intl.NumberFormat('id-ID', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                        }).format(Math.floor(result));
                    } catch (e) {
                        return Math.floor(result).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                    }

                case 'currency':
                case 'dollar':
                    try {
                        return new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                        }).format(Math.floor(result));
                    } catch (e) {
                        return Math.floor(result).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                    }

                case 'decimal':
                    if (typeof result === 'number') {
                        return result.toFixed(2);
                    }
                    return parseFloat(result).toFixed(2);

                case 'percent':
                    if (typeof result === 'number') {
                        return (result * 100).toFixed(2) + '%';
                    }
                    return (parseFloat(result) * 100).toFixed(2) + '%';

                case 'number':
                    try {
                        return new Intl.NumberFormat('id-ID').format(result);
                    } catch (e) {
                        return result.toString();
                    }

                case 'days':
                    return Math.floor(result) + ' days';

                case 'months':
                    return Math.floor(result) + ' months';

                case 'years':
                    return Math.floor(result) + ' years';

                case 'weeks':
                    return Math.floor(result) + ' weeks';

                default:
                    return result.toString();
            }
        }

        function formatInputValue(element, value) {
            const format = attr(element, 'live-compute-format');
            if (!format || getData(element, 'updating')) return value;

            if (!value || value.trim() === '') return value;

            const numValue = toNumber(value);

            if (numValue === 0 && value !== '0' && value.trim() !== '0') {
                if (value.match(/[\d.,]/)) {
                    return value;
                }
                return '';
            }

            try {
                return formatResult(numValue, format);
            } catch (e) {
                console.error('Format error:', e);
                return value;
            }
        }

        function getValue(varName, globalInputs) {
            const rowMatch = varName.match(/^rows_(\d+)_(.+)$/);
            if (rowMatch) {
                const [_, index, field] = rowMatch;
                const selector = `[name="rows[${index}][${field}]"]`;
                const element = rootScope.querySelector(selector);
                return element ? val(element).toString().trim() : '';
            }
            return globalInputs[varName] || '';
        }

        function toNumber(val) {
            if (val == null || val === '') return 0;

            val = val.toString().trim();
            if (val === '' || val === '-') return 0;

            const isPercentage = val.includes('%');
            val = val.replace(/%/g, '');

            const isNegative = /^-/.test(val);
            val = val.replace(/^-/, '');

            val = val.replace(/[^\d.,]/g, '');

            if (val === '') return 0;

            let result = 0;

            if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(val)) {
                result = parseFloat(val.replace(/\./g, '').replace(',', '.'));
            }
            else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(val)) {
                result = parseFloat(val.replace(/,/g, ''));
            }
            else if (/^\d+([.,]\d+)?$/.test(val)) {
                if (val.includes(',')) {
                    result = parseFloat(val.replace(',', '.'));
                } else {
                    result = parseFloat(val);
                }
            }
            else {
                result = parseFloat(val.replace(/[.,]/g, ''));
            }

            if (isNaN(result)) result = 0;
            if (isNegative) result = -result;
            if (isPercentage) result = result / 100;

            return result;
        }

        function extractVariables(expr) {
            const vars = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
            return [...new Set(vars.filter(v => !/^\d+$/.test(v) && !dateUtils[v]))];
        }

        function sanitizeInputNameToJSVariable(name) {
            return name.replace(/\]\[/g, '_')
                .replace(/[\[\]]/g, '')
                .replace(/[^a-zA-Z0-9_]/g, '_');
        }

        function isValueConverged(oldValue, newValue) {
            // bedakan "" dengan 0 supaya tetap update
            if (oldValue === "" && newValue === 0) return false;

            if (oldValue === newValue) return true;

            const oldNum = parseFloat(oldValue);
            const newNum = parseFloat(newValue);

            if (!isNaN(oldNum) && !isNaN(newNum)) {
                if (Math.abs(oldNum - newNum) < PRECISION_TOLERANCE) return true;
                if (oldNum !== 0 && Math.abs((newNum - oldNum) / oldNum) < PRECISION_TOLERANCE) return true;
            }

            return false;
        }

        function addEventListener(selector, event, handler, context = rootScope) {
            context.addEventListener(event, function (e) {
                if (e.target.matches(selector)) {
                    handler.call(e.target, e);
                }
            });
        }

        function init() {
            // Initialize all systems
            initBidirectionalQueue();
            process();

            let lastInputTime = 0;
            let formatTimeout = new Map();
            let bidirectionalElements = new Map();

            // Identifikasi elemen bidirectional dengan lebih akurat
            find('[live-compute-skip="true"]').forEach(function (element) {
                const expr = attr(element, 'live-compute') || '';
                const vars = extractVariables(expr);

                find('[live-compute]').forEach(function (otherElement) {
                    const otherExpr = attr(otherElement, 'live-compute') || '';
                    const otherVars = extractVariables(otherExpr);

                    if (vars.some(v => otherVars.includes(v)) && otherElement !== element) {
                        if (!bidirectionalElements.has(element)) {
                            bidirectionalElements.set(element, new Set());
                        }
                        bidirectionalElements.get(element).add(otherElement);

                        if (!bidirectionalElements.has(otherElement)) {
                            bidirectionalElements.set(otherElement, new Set());
                        }
                        bidirectionalElements.get(otherElement).add(element);

                        const bidirectionalMap = getData(rootScope, BIDIRECTIONAL_TRACKING_KEY) || new Map();
                        if (!bidirectionalMap.has(element)) {
                            bidirectionalMap.set(element, new Set());
                        }
                        bidirectionalMap.get(element).add(otherElement);

                        if (!bidirectionalMap.has(otherElement)) {
                            bidirectionalMap.set(otherElement, new Set());
                        }
                        bidirectionalMap.get(otherElement).add(element);

                        setData(rootScope, BIDIRECTIONAL_TRACKING_KEY, bidirectionalMap);
                    }
                });
            });

            addEventListener('[live-compute-skip="true"]', 'input', function () {
                if (getData(this, 'updating')) return;
                setData(this, 'lastManualInput', Date.now());

                if (bidirectionalElements.has(this)) {
                    processImmediate(this);
                } else {
                    processImmediate();
                }
            });

            addEventListener('input[name], select[name], textarea[name]', 'input', function () {
                if (getData(this, 'updating')) return;
                setData(this, 'lastManualInput', Date.now());
                processImmediate();
            });

            // === PATCHED ===
            addEventListener('input[live-compute-format]', 'input', function () {
                if (getData(this, 'updating')) return;

                const element = this;
                const currentValue = val(this);

                setData(element, 'lastManualInput', Date.now());

                // 🚫 Jika ada live-compute-skip → jangan format realtime
                if (element.hasAttribute('live-compute-skip')) {
                    return; // biarkan user ngetik normal
                }

                if (formatTimeout.has(element)) {
                    clearTimeout(formatTimeout.get(element));
                }

                const now = Date.now();
                if (!element.hasAttribute('live-compute-skip')) {
                    if (now - lastInputTime > 10) {
                        lastInputTime = now;
                        processImmediate();
                    }
                }

                const timeout = setTimeout(() => {
                    if (getData(element, 'updating')) return;

                    const cursorPos = element.selectionStart;
                    const oldValue = val(element);

                    const lastFormattedValue = getData(element, 'lastFormattedValue') || '';
                    if (oldValue === lastFormattedValue) {
                        formatTimeout.delete(element);
                        return;
                    }

                    const newValue = formatInputValue(element, oldValue);

                    if (oldValue !== newValue && newValue !== '') {
                        setData(element, 'updating', true);
                        val(element, newValue);
                        setData(element, 'lastFormattedValue', newValue);

                        let newCursorPos = cursorPos;
                        const lengthDiff = newValue.length - oldValue.length;

                        if (lengthDiff !== 0) {
                            const beforeCursor = oldValue.substring(0, cursorPos);
                            const numericBeforeCursor = beforeCursor.replace(/[^\d]/g, '');

                            let targetPos = 0;
                            let numericCount = 0;

                            for (let i = 0; i < newValue.length; i++) {
                                if (/\d/.test(newValue[i])) {
                                    numericCount++;
                                }
                                if (numericCount >= numericBeforeCursor.length) {
                                    targetPos = i + 1;
                                    break;
                                }
                            }

                            newCursorPos = Math.min(targetPos, newValue.length);
                        }

                        newCursorPos = Math.max(0, Math.min(newCursorPos, newValue.length));

                        try {
                            element.setSelectionRange(newCursorPos, newCursorPos);
                        } catch (e) { }

                        setTimeout(() => {
                            removeData(element, 'updating');
                        }, 50);
                    }

                    formatTimeout.delete(element);
                }, 200);

                formatTimeout.set(element, timeout);
            });
            // === END PATCH ===

            addEventListener('input:not([live-compute-format]):not([live-compute-skip="true"]), select:not([live-compute-skip="true"]), textarea:not([live-compute-skip="true"])', 'input', function () {
                if (getData(this, 'updating')) return;

                const now = Date.now();
                if (now - lastInputTime > 10) {
                    lastInputTime = now;
                    processImmediate();
                }
            });

            addEventListener('input, select, textarea', 'change', function () {
                if (getData(this, 'updating')) return;
                debounceProcess();
            });

            addEventListener('[live-compute-skip="true"]', 'blur', function () {
                debounceProcess();
            });

            addEventListener('input[live-compute-format]', 'blur', function () {
                const element = this;

                if (formatTimeout.has(element)) {
                    clearTimeout(formatTimeout.get(element));
                    formatTimeout.delete(element);
                }

                const currentValue = val(this);

                if (currentValue && currentValue.trim() !== '') {
                    let formattedValue = formatInputValue(this, currentValue);

                    // 🚀 PATCH: kalau hasil format kosong → paksa fallback ke number formatting
                    if (!formattedValue || formattedValue.trim() === '') {
                        const numValue = toNumber(currentValue);
                        formattedValue = formatResult(numValue, attr(this, 'live-compute-format'));
                    }

                    // 🚀 PATCH: walaupun ada live-compute-skip tetap paksa format saat blur
                    val(this, formattedValue);
                    setData(this, 'lastFormattedValue', formattedValue);
                }

                // Hapus flag updating biar siap dipakai lagi
                removeData(this, 'updating');

                // Tetap trigger proses compute lain
                debounceProcess();
            });

            addEventListener('input[live-compute-format]', 'focus', function () {
                const currentValue = val(this);

                const lastFormattedValue = getData(this, 'lastFormattedValue') || '';
                if (currentValue && currentValue.trim() !== '' && currentValue !== lastFormattedValue) {
                    const formattedValue = formatInputValue(this, currentValue);
                    if (currentValue !== formattedValue) {
                        setData(this, 'updating', true);
                        val(this, formattedValue);
                        setData(this, 'lastFormattedValue', formattedValue);

                        setTimeout(() => {
                            removeData(this, 'updating');
                        }, 50);
                    }
                }
            });

            rootScope.addEventListener('live-dom:afterAppend', () => {
                buildDependencyMap();
                process();
            });
            rootScope.addEventListener('live-dom:afterUpdate', () => {
                buildDependencyMap();
                process();
            });

            if (typeof MutationObserver !== 'undefined') {
                const observer = new MutationObserver((mutations) => {
                    let shouldRebuild = false;
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    if (node.hasAttribute && node.hasAttribute('live-compute')) {
                                        shouldRebuild = true;
                                    } else if (node.querySelector && node.querySelector('[live-compute]')) {
                                        shouldRebuild = true;
                                    }
                                }
                            });
                        }
                    });

                    if (shouldRebuild) {
                        buildDependencyMap();
                        process();
                    }
                });

                observer.observe(rootScope, {
                    childList: true,
                    subtree: true
                });
            }
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
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
        };

        const fetchOptions = {
            method,
            headers,
            signal,
        };

        if (method !== 'GET' && data) {
            fetchOptions.body = data instanceof FormData ? data : new URLSearchParams(data);
        }

        fetch(url, fetchOptions)
            .then(async response => {
                const html = await response.text();
                if (!response.ok) {
                    showErrorModal(html);
                    throw new Error(`[${response.status}] ${response.statusText}`);
                }
                callback?.(html);
            })
            .catch(error => {
                if (error.name === 'AbortError') {
                    console.log('[SPA] Request dibatalkan:', url);
                    return;
                }
                console.error('ajaxSpa error:', error);
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
        const doc = parser.parseFromString(responseHtml, 'text/html');
        const regions = document.querySelectorAll('[live-spa-region]');
        regions.forEach(region => {
            const regionName = region.getAttribute('live-spa-region');
            const newRegion = doc.querySelector(`[live-spa-region="${regionName}"]`);
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
            mainRegion.innerHTML = '<div class="text-center p-4 text-gray-400">Loading...</div>';
        }

        ajaxSpa('GET', url, null, res => {
            updateSpaRegions(res);
            document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
            document.dispatchEvent(new CustomEvent('live-dom:afterSpa', {
                detail: {
                    url
                }
            }));
            if (pushState) history.pushState({
                spa: true,
                url
            }, '', url);
        }, () => {
            if (mainRegion) {
                mainRegion.innerHTML =
                    '<div class="text-red-500 p-4">Failed to load content (network error)</div>';
            }
        });
    }

    /**
     * Handles SPA form submissions via AJAX.
     * @param {HTMLFormElement} form - The form element.
     * @param {function} callbackSuccess - Success callback.
     * @param {function} callbackError - Error callback.
     */
    function ajaxSpaFormSubmit(form, callbackSuccess, callbackError) {
        const url = form.action;
        const method = form.method.toUpperCase() || 'POST';
        const formData = new FormData(form);
        const beforeCallbackName = form.getAttribute('live-callback-before');
        const afterCallbackName = form.getAttribute('live-callback-after');

        const safeEvalCallbackExpression = (expr, el) => {
            try {
                const replaced = expr.replace(/\bthis\b/g, '__el');
                return Function('__el', `
          try {
            return (${replaced});
          } catch (e) {
            console.warn('[LiveDomJs] Error in callback expression:', e);
            return undefined;
          }
        `)(el);
            } catch (e) {
                console.warn('[LiveDomJs] Failed to evaluate callback expression:', expr, e);
                return undefined;
            }
        };

        const runBeforeCallback = () => {
            if (!beforeCallbackName) return Promise.resolve(true);

            if (beforeCallbackName.includes('(')) {
                const result = safeEvalCallbackExpression(beforeCallbackName, form);
                return Promise.resolve(result);
            }

            const fn = window[beforeCallbackName.trim()];
            if (typeof fn === 'function') {
                try {
                    return Promise.resolve(fn(form));
                } catch (e) {
                    console.warn('[LiveDomJs] Error in live-callback-before:', e);
                    return Promise.resolve(true);
                }
            } else {
                console.warn(`[LiveDomJs] Function "${beforeCallbackName}" not found.`);
                return Promise.resolve(true);
            }
        };

        const runAfterCallback = (response, isError = false) => {
            if (afterCallbackName && typeof window[afterCallbackName] === 'function') {
                try {
                    window[afterCallbackName](response, form, isError);
                } catch (e) {
                    console.warn('[LiveDomJs] Error in live-callback-after:', e);
                }
            }
        };

        runBeforeCallback()
            .then(result => {
                if (result === false) {
                    console.log('Form submit cancelled by live-callback-before.');
                    return;
                }

                $.ajax({
                    url,
                    method,
                    data: formData,
                    processData: false,
                    contentType: false,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                    },
                    beforeSend: function () {
                        showLoadingBar();
                        clearFormErrors(form);
                    },
                    success: response => {
                        const redirectUrl = response?.redirect;

                        if (redirectUrl) {
                            fetch(redirectUrl, {
                                headers: {
                                    'X-Requested-With': 'XMLHttpRequest'
                                },
                            })
                                .then(res => res.text())
                                .then(html => {
                                    updateSpaRegions(html);
                                    document.dispatchEvent(new CustomEvent(
                                        'live-dom:afterUpdate'));
                                    document.dispatchEvent(new CustomEvent(
                                        'live-dom:afterSpa', {
                                        detail: {
                                            url: redirectUrl
                                        }
                                    }));
                                    history.pushState({
                                        spa: true,
                                        url: redirectUrl
                                    }, '', redirectUrl);
                                    runAfterCallback(response, false);
                                    callbackSuccess?.(response);
                                })
                                .catch(err => {
                                    console.error('SPA redirect fetch error:', err);
                                    runAfterCallback(response, true);
                                    callbackError?.(err);
                                });
                        } else {
                            runAfterCallback(response, false);
                            callbackSuccess?.(response);
                        }
                    },
                    error: xhr => {
                        if (xhr.status === 422) {
                            const errors = xhr.responseJSON?.errors || {};
                            showFormErrors(form, errors);
                        } else {
                            console.error('Form submit error:', xhr);
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
            .catch(error => {
                console.error('Error in before callback chain:', error);
            });
    }



    /**
     * Clears form validation errors.
     * @param {HTMLFormElement} form - The form element.
     */
    function clearFormErrors(form) {
        $(form).find('.is-invalid').removeClass('is-invalid');
        $(form).find('.invalid-feedback').remove();
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
                input.addClass('is-invalid');
                const errorHtml =
                    `<div class="invalid-feedback text-red-600 text-sm mt-1">${messages.join('<br>')}</div>`;
                if (input.next('.invalid-feedback').length === 0) {
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
            const excludes = (window.liveDomConfig?.spaExcludePrefixes || []).filter(Boolean);
            return excludes.some(prefix => path.startsWith(prefix));
        } catch (e) {
            console.warn('Error parsing URL for SPA exclusion, falling back:', e);
            const excludes = (window.liveDomConfig?.spaExcludePrefixes || []).filter(Boolean);
            return excludes.some(prefix => url.startsWith(prefix));
        }
    }

    /*==============================
      LOADING BAR
    ==============================*/

    /** Initializes the global loading bar element. */
    function initLoadingBar() {
        if ($('#loading-bar').length === 0) {
            const $loadingBar = $('<div id="loading-bar"></div>').css({
                position: 'fixed',
                top: 0,
                left: 0,
                height: '3px',
                width: '0%',
                backgroundColor: '#2563eb',
                zIndex: 99999,
                transition: 'width 0.3s ease',
                willChange: 'width',
                display: 'none'
            });
            $('body').append($loadingBar);
        }
    }

    /** Shows the loading bar animation. */
    function showLoadingBar() {
        $('#loading-bar').stop(true).css({
            width: '0%',
            display: 'block'
        }).animate({
            width: '80%'
        }, 800);
    }

    /** Hides the loading bar animation. */
    function hideLoadingBar() {
        $('#loading-bar').stop(true).animate({
            width: '100%'
        }, 300, function () {
            $(this).fadeOut(200, function () {
                $(this).css({
                    width: '0%'
                });
            });
        });
    }

    /*==============================
    LIVE DOM ERROR HANDLE
    ==============================*/

    /**
     * Displays an error modal with raw HTML or a formatted JSON error.
     * @param {string|object} rawHtmlOrJson - The error content, either raw HTML or a JSON object.
     */
    function showErrorModal(rawHtmlOrJson) {
        // Hapus modal sebelumnya jika ada
        const existing = document.getElementById('spa-error-modal');
        if (existing) existing.remove();

        // Modal container
        const modal = document.createElement('div');
        modal.id = 'spa-error-modal';

        modal.innerHTML = `
        <style>
            /* ... CSS sama seperti sebelumnya ... */
            #spa-error-modal {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.6);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: system-ui, sans-serif;
        }
        #spa-error-box {
            position: relative;
            background: #fff;
            border-radius: 12px;
            width: 95%;
            max-width: 1000px;
            height: 90%;
            box-shadow: 0 15px 40px rgba(0,0,0,0.2);
            border: 1px solid #e5e7eb;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        #spa-error-header {
            background-color: #fef2f2;
            padding: 12px 20px;
            border-bottom: 1px solid #fca5a5;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        #spa-error-header h3 {
            margin: 0;
            font-size: 16px;
            color: #b91c1c;
        }
        #spa-error-close {
            font-size: 22px;
            font-weight: bold;
            color: #b91c1c;
            cursor: pointer;
            background: transparent;
            border: none;
            line-height: 1;
            padding: 0;
            user-select: none;
        }
        #spa-error-content {
            padding: 20px;
            overflow: auto;
            flex: 1;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
            Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            color: #222;
            background: #fff;
            border-top: 1px solid #eee;
        }
        @media (max-width: 640px) {
            #spa-error-box {
                width: 98%;
                height: 95%;
            }
        }
        </style>

        <div id="spa-error-box" role="dialog" aria-modal="true" aria-labelledby="spa-error-title">
            <div id="spa-error-header">
                <h3 id="spa-error-title">⚠️ Laravel Error Occurred</h3>
                <button id="spa-error-close" aria-label="Close modal">&times;</button>
            </div>
            <div id="spa-error-content"></div>
        </div>
        `;

        document.body.appendChild(modal);

        const contentDiv = modal.querySelector('#spa-error-content');

        // Coba parse json, kalau gagal berarti rawHtml lengkap (HTML)
        let parsedJson = null;
        try {
            parsedJson = typeof rawHtmlOrJson === 'string' ? JSON.parse(rawHtmlOrJson) : rawHtmlOrJson;
        } catch {
            parsedJson = null;
        }

        if (parsedJson && typeof parsedJson === 'object' && parsedJson.message) {
            // Jika json error, render pakai fungsi formatLaravelError agar rapi
            contentDiv.innerHTML = formatLaravelError(parsedJson);
        } else {
            // Kalau bukan json, asumsi itu HTML langsung masukkan ke dalam div (atau iframe kalau mau)
            // Untuk HTML lengkap dengan dump, lebih baik iframe, tapi disini pakai div:
            contentDiv.innerHTML = rawHtmlOrJson;
        }

        modal.querySelector('#spa-error-close').onclick = () => modal.remove();

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        contentDiv.querySelectorAll('script').forEach(oldScript => {
            const newScript = document.createElement('script');
            if (oldScript.src) {
                newScript.src = oldScript.src;
            } else {
                newScript.textContent = oldScript.textContent;
            }
            document.head.appendChild(newScript); // atau gunakan contentDiv.appendChild
        });
    }


    // Fungsi format error JSON seperti yang sudah kamu punya
    function formatLaravelError(err) {
        const message = err.message || 'Unknown error';
        const exception = err.exception || '';
        const file = err.file || '';
        const line = err.line || '';
        const trace = err.trace || {};

        let traceHtml = '<ol style="font-size:0.85rem; color:#555; padding-left:20px; margin-top:8px; max-height:250px; overflow:auto; border:1px solid #eee; border-radius:6px;">';

        Object.values(trace).forEach((frame, idx) => {
            const ffile = frame.file || 'unknown file';
            const fline = frame.line || '';
            const func = frame.function || '';
            const className = frame.class || '';
            const type = frame.type || '';
            const fullFunc = className ? `${className}${type}${func}()` : `${func}()`;

            traceHtml += `
                <li style="margin-bottom:6px;">
                    <div><strong>#${idx}</strong> ${fullFunc}</div>
                    <div style="color:#999; font-style:italic;">${ffile}${fline ? ` : line ${fline}` : ''}</div>
                </li>`;
        });

        traceHtml += '</ol>';

        return `
            <h2 style="color:#b91c1c; margin-bottom:12px;">⚠️ Laravel Exception</h2>
            <div style="font-size:1.1rem; margin-bottom:8px;"><strong>Message:</strong> ${message}</div>
            <div style="margin-bottom:8px;"><strong>Exception:</strong> ${exception}</div>
            <div style="margin-bottom:12px;"><strong>File:</strong> ${file} <br><strong>Line:</strong> ${line}</div>
            <details open style="border:1px solid #e5e7eb; border-radius:8px; padding:12px; background:#fafafa;">
                <summary style="font-weight:bold; cursor:pointer; user-select:none;">Stack Trace (${Object.keys(trace).length} frames)</summary>
                ${traceHtml}
            </details>
            `;
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
        const scripts = container.querySelectorAll('script');

        scripts.forEach(oldScript => {
            const isExternal = oldScript.src?.trim() !== '';

            if (isExternal) {
                const src = oldScript.src;

                if (scriptCache.has(src)) return;

                const newScript = document.createElement('script');
                newScript.src = src;
                newScript.async = false;

                for (const attr of oldScript.attributes) {
                    if (attr.name !== 'src') {
                        newScript.setAttribute(attr.name, attr.value);
                    }
                }

                document.head.appendChild(newScript);
                scriptCache.add(src);
            } else {
                // For inline scripts, wrap them in an IIFE to ensure isolated execution context
                // and prevent variable leakage or conflicts if re-executed.
                const newScript = document.createElement('script');
                let code = oldScript.textContent || '';
                const trimmed = code.trim();

                // Check if the script is already wrapped in an IIFE or async IIFE
                const isAlreadyWrapped = /^\s*\(?\s*(?:function\s*\(|async\s+function\s*\()/i.test(
                    trimmed);

                if (!isAlreadyWrapped) {
                    code = `(function () {\n${code}\n})();`;
                }

                newScript.textContent = code;

                for (const attr of oldScript.attributes) {
                    if (attr.name !== 'src') {
                        newScript.setAttribute(attr.name, attr.value);
                    }
                }

                document.head.appendChild(newScript);
            }
        });
    }

    function handleLiveBind() {
        $(document).on('input change', 'input[name], select[name], textarea[name]', function () {
            const $source = $(this);
            const name = $source.attr('name');
            if (!name) return;

            const value = $source.is(':checkbox') ? $source.prop('checked') : $source.val();

            $(`[live-bind="${name}"]`).each(function () {
                const $target = $(this);
                if ($target.is('input, textarea, select')) {
                    $target.val(value);
                } else {
                    $target.text(value);
                }
            });
        });
    }

    /*==============================
      LIVE DOM HOOKS & INITIALIZATION
    ==============================*/

    /** Binds all initial live DOM event handlers. */
    function bindLiveDomEvents() {
        $(document).on('click', '[live-click]', function () {
            handleLiveEvent($(this), 'click');
        });

        $(document).on('mouseenter mouseleave', '[live-hover]', function () {
            handleLiveEvent($(this), 'hover');
        });

        $(document).on('change', '[live-change]', function () {
            handleLiveEvent($(this), 'change');
        });

        $(document).on('submit', '[live-submit]', function (e) {
            e.preventDefault();
            handleLiveEvent($(this), 'submit');
        });

        $(document).on('keyup', '[live-keyup]', function () {
            handleLiveEvent($(this), 'keyup');
        });

        $(document).on('input', '[live-input]', function () {
            handleLiveEvent($(this), 'input');
        });

        $(document).on('input', '[live-bind]', function () {
            handleLiveEvent($(this), 'input');
        });

        // event binding, pakai debounce
        $(document).on(
            'input change',
            '[live-scope] input, [live-scope] select, [live-scope] textarea',
            debounce(function () {
                const scope = $(this).closest('[live-scope]');
                handleLiveDirectives(scope);
            }, 200) // delay 200ms
        );



        $(document).on('click', '[live-spa-region] a[href]:not([href^="#"]):not([href=""])', function (e) {
            const url = $(this).attr('href');
            if (!url || isSpaExcluded(url)) return;
            e.preventDefault();
            loadSpaContent(url);
        });

        $(document).on('submit', '[live-spa-region] form', function (e) {
            const form = this;
            const url = form.action || '';
            const method = form.method.toUpperCase() || 'GET';

            if (isSpaExcluded(url)) return;
            e.preventDefault();

            if (method === 'GET') {
                const formParams = new URLSearchParams(new FormData(form));
                const existingUrl = new URL(url, window.location.origin);
                formParams.forEach((value, key) => {
                    existingUrl.searchParams.set(key, value);
                });
                const fullUrl = existingUrl.toString();

                fetch(fullUrl, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                })
                    .then(res => res.text())
                    .then(html => {
                        updateSpaRegions(html);
                        document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
                        document.dispatchEvent(new CustomEvent('live-dom:afterSpa', {
                            detail: {
                                url: fullUrl
                            }
                        }));
                        history.replaceState({
                            spa: true,
                            url: fullUrl
                        }, '', fullUrl);
                    })
                    .catch(err => console.error('SPA GET error:', err));
                return;
            }

            ajaxSpaFormSubmit(form, function (response) {
                if (typeof response === 'string') {
                    updateSpaRegions(response);
                    document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
                    document.dispatchEvent(new CustomEvent('live-dom:afterSpa', {
                        detail: {
                            url
                        }
                    }));
                    history.pushState({
                        spa: true,
                        url
                    }, '', url);
                } else if (response && typeof response === 'object' && response.redirect) {
                    console.log('SPA redirect handled.');
                } else {
                    console.log('Form SPA submit success (non-redirect):', response);
                }
            });
        });
    }

    function initLiveDom() {
        initLoadingBar();               // loading bar
        handleLiveBind();               // live-bind
        bindLiveDomEvents();            // event handler utama
        handlePollers();                // pollers (live-poll)
        // handleLiveComputeUnified();     // inisialisasi live-compute
        // handleLiveDirectives();

        // SPA state awal
        if (document.querySelector('[live-spa-region="main"]')) {
            const currentUrl = window.location.href;
            history.replaceState({ spa: true, url: currentUrl }, '', currentUrl);
        }

        // Dispatch event agar ekstensi luar bisa ikut hook
        document.dispatchEvent(new CustomEvent('live-dom:init'));
    }

    // Event listener for general DOM updates
    document.addEventListener('live-dom:afterUpdate', function () {
        initLiveDom();
        handleLiveDirectives();
    });

    // Event listener after SPA content loads
    document.addEventListener('live-dom:afterSpa', function () {
        initLiveDom();
    });

    // Handle browser's back/forward buttons for SPA
    window.addEventListener('popstate', function (event) {
        if (event.state && event.state.spa && event.state.url) {
            loadSpaContent(event.state.url, false); // false to prevent pushing state again
        }
    });

    // window.ajaxDynamic = ajaxDynamic;
    window.debouncedAjaxDynamic = debouncedAjaxDynamic;

    // Initial setup when the DOM is ready
    $(document).ready(function () {
        initLiveDom();
        handleLiveComputeUnified();
        handleLiveDirectives();
    });
})(jQuery);