(function ($) {
  "use strict";
  // Core state management structures
    const stateProxies = new WeakMap();
    const stateWatchers = new WeakMap();
    const stateCallbacks = new WeakMap();
    const vdomCache = new WeakMap();
    const elementStateMap = new WeakMap();
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

  function ajaxDynamic(
    method = 'POST',
    controller,
    action,
    data = {},
    target = 'html',
    targetId = '#',
    loading = true,
    callback = null
  ) {
    const key = targetId || `${controller}_${action}`;

    if (ajaxDynamicControllers[key]) {
      ajaxDynamicControllers[key].abort();
    }

    const abortController = new AbortController();
    ajaxDynamicControllers[key] = abortController;

    if (loading) {
      showTargetLoading(targetId);
    }

    const isFormData = data instanceof FormData;

    $.ajax({
      url: `/ajax/${controller}/${action}`,
      method: method,
      headers: method !== 'GET' && !isFormData ? {
        'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
      } : {},
      data: method === 'GET' ? data : (isFormData ? data : JSON.stringify(data)),
      contentType: method === 'GET' ? undefined : (isFormData ? false : 'application/json'),
      processData: isFormData ? false : true,
      cache: false,
      signal: abortController.signal,

      success: function (response) {
        if (loading) {
          hideTargetLoading(targetId);
        }

        delete ajaxDynamicControllers[key];

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
          console.log(`[AJAX Dynamic] Request to /ajax/${controller}/${action} was aborted.`);
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
    }, 150);

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
        // if ($el.length) {
        //   $el.is('input, textarea, select') ? $el.val(value) : $el.html(value);
        // }
        if ($el.is('input, textarea, select')) {
            $el.val(value);
            $el.each(function () {
                this.dispatchEvent(new Event('input', { bubbles: true }));
                this.dispatchEvent(new Event('change', { bubbles: true }));
            });
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
    if ($form && $form.length) {
      const data = {};

      $form.find('input[name], select[name], textarea[name]').each(function () {
        const $input = $(this);
        const name = $input.attr('name');
        if (!name) return;

        if ($input.is(':checkbox')) {
          if (!data[name]) data[name] = [];
          if ($input.is(':checked')) {
            data[name].push($input.val());
          }
        } else if ($input.is(':radio')) {
          if ($input.is(':checked')) {
            data[name] = $input.val();
          } else if (data[name] === undefined) {
            data[name] = null;
          }
        } else if ($input.is('select[multiple]')) {
          data[name] = $input.val() || [];
        } else {
          data[name] = $input.val();
        }
      });

      Object.keys(data).forEach(key => {
        if (Array.isArray(data[key]) && data[key].length === 1) {
          data[key] = data[key][0];
        }
      });

      return data;
    } else {
      const $scope = $el.closest('[live-scope]');
      const data = {};
      $scope.find('input[name], select[name], textarea[name]').each(function () {
        data[$(this).attr('name')] = $(this).val();
      });
      return data;
    }
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

  /*==============================
    LIVE ANIMATION
  ==============================*/

  /**
   * Handles live animations based on 'live-animate' attributes.
   * @param {jQuery} $el - The jQuery object of the triggering element.
   * @returns {boolean} True if an animation was handled, false otherwise.
   */
  function handleLiveAnimate($el, onComplete) {
      const animateType = $el.attr('live-animate');
      if (!animateType) {
        if (onComplete) onComplete();
        return false;
      }

      const duration = parseInt($el.attr('live-duration') || 300, 10);
      const easing = $el.attr('live-easing') || 'swing';
      const targetSelectors = $el.attr('live-target') || '';
      const $targets = liveTarget($el, targetSelectors);

      if (!$targets.length) {
        if (onComplete) onComplete();
        return false;
      }

      let animationsCompleted = 0;
      const totalTargets = $targets.length;

      const done = () => {
        animationsCompleted++;
        if (animationsCompleted >= totalTargets) {
          if (onComplete) onComplete();
        }
      };

      $targets.each(function () {
        const $target = $(this);
        const originalDisplay = $target.css('display') === 'none' ? 'block' : $target.css('display');

        switch (animateType) {
          case 'fade-in':
            $target.stop(true, true).fadeIn(duration, easing, done);
            break;
          case 'fade-out':
            $target.stop(true, true).fadeOut(duration, easing, done);
            break;
          case 'fade-toggle':
            $target.stop(true, true).fadeToggle(duration, easing, done);
            break;
          case 'slide-up':
            $target.stop(true, true).slideUp(duration, easing, done);
            break;
          case 'slide-down':
            $target.stop(true, true).slideDown(duration, easing, done);
            break;
          case 'slide-toggle':
            $target.stop(true, true).slideToggle(duration, easing, done);
            break;
          case 'slide-left':
            $target
              .css({ transform: 'translateX(100%)', opacity: 0, display: 'block' })
              .animate(
                { translateX: 0, opacity: 1 },
                {
                  step: (now, fx) => {
                    if (fx.prop === 'translateX') $target.css('transform', `translateX(${100 - now}%)`);
                  },
                  duration,
                  easing,
                  complete: () => {
                    $target.css('transform', '');
                    done();
                  },
                }
              );
            break;
          case 'slide-right':
            $target
              .css({ transform: 'translateX(-100%)', opacity: 0, display: 'block' })
              .animate(
                { translateX: 0, opacity: 1 },
                {
                  step: (now, fx) => {
                    if (fx.prop === 'translateX') $target.css('transform', `translateX(${-100 + now}%)`);
                  },
                  duration,
                  easing,
                  complete: () => {
                    $target.css('transform', '');
                    done();
                  },
                }
              );
            break;
          case 'slide-horizontal-toggle':
            if ($target.is(':visible')) {
              $target.animate(
                { translateX: 100, opacity: 0 },
                {
                  step: (now, fx) => {
                    if (fx.prop === 'translateX') $target.css('transform', `translateX(${now}%)`);
                  },
                  duration,
                  easing,
                  complete: () => {
                    $target.hide().css('transform', '');
                    done();
                  },
                }
              );
            } else {
              $target
                .css({ transform: 'translateX(-100%)', opacity: 0, display: 'block' })
                .animate(
                  { translateX: 0, opacity: 1 },
                  {
                    step: (now, fx) => {
                      if (fx.prop === 'translateX') $target.css('transform', `translateX(${-100 + now}%)`);
                    },
                    duration,
                    easing,
                    complete: () => {
                      $target.css('transform', '');
                      done();
                    },
                  }
                );
            }
            break;
          case 'zoom-in':
            $target
              .css({ transform: 'scale(0)', display: originalDisplay })
              .animate(
                { scale: 1 },
                {
                  step: (now, fx) => {
                    if (fx.prop === 'scale') $target.css('transform', `scale(${now})`);
                  },
                  duration,
                  easing,
                  complete: () => {
                    $target.css('transform', 'scale(1)');
                    done();
                  },
                }
              );
            break;
          case 'zoom-out':
            $target.animate(
              { scale: 0 },
              {
                step: (now, fx) => {
                  if (fx.prop === 'scale') $target.css('transform', `scale(${now})`);
                },
                duration,
                easing,
                complete: () => {
                  $target.hide().css('transform', 'scale(1)');
                  done();
                },
              }
            );
            break;
          case 'zoom-toggle':
            $el.attr('live-animate', $target.is(':visible') ? 'zoom-out' : 'zoom-in');
            handleLiveAnimate($el, done);
            $el.attr('live-animate', 'zoom-toggle');
            break;
          case 'scale-up':
            $target
              .css({ transform: 'scale(0.8)', display: originalDisplay })
              .animate(
                { scale: 1 },
                {
                  step: (now, fx) => {
                    if (fx.prop === 'scale') $target.css('transform', `scale(${now})`);
                  },
                  duration,
                  easing,
                  complete: () => {
                    $target.css('transform', '');
                    done();
                  },
                }
              );
            break;
          case 'scale-down':
            $target.animate(
              { scale: 0.8 },
              {
                step: (now, fx) => {
                  if (fx.prop === 'scale') $target.css('transform', `scale(${now})`);
                },
                duration,
                easing,
                complete: () => {
                  $target.hide().css('transform', '');
                  done();
                },
              }
            );
            break;
          case 'scale-toggle':
            $el.attr('live-animate', $target.is(':visible') ? 'scale-down' : 'scale-up');
            handleLiveAnimate($el, done);
            $el.attr('live-animate', 'scale-toggle');
            break;
          default:
            $target.addClass(animateType);
            setTimeout(() => {
              $target.removeClass(animateType);
              done();
            }, duration);
            break;
        }
      });

      return true;
    }


  /*==============================
    LIVE ACTION
  ==============================*/

  /**
   * Handles live actions based on 'live-action' attributes.
   * @param {jQuery} $el - The jQuery object of the triggering element.
   * @returns {boolean} True if an action was handled that should halt further processing (e.g., 'remove').
   */
  function handleLiveAction($el) {
    const rawActions = $el.attr('live-action');
    if (!rawActions) return false;

    const actionChains = rawActions.split(',').map(s => s.trim().split(/\s*->\s*/));
    const targets = ($el.attr('live-target') || 'self').split(',').map(s => s.trim());
    const animates = ($el.attr('live-animate') || '').split(',').map(s => s.trim());

    targets.forEach((targetExpr, i) => {
      const $targets = liveTarget($el, targetExpr);
      const chainList = actionChains[i] || actionChains[actionChains.length - 1];
      const animateStr = animates[i] || '';

      $targets.each(function () {
        const $target = $(this);
        runActionChain(chainList, 0, $target, animateStr);
      });
    });

    return true;
  }

function runActionChain(chainList, index, $target, animateStr) {
    if (index >= chainList.length) return;

    const [type, ...rest] = chainList[index].split(':');
    const value = rest.join(':').trim();

    const next = () => runActionChain(chainList, index + 1, $target, animateStr);

    switch (animateStr) {
        case 'slide-up':
            $target.slideUp(200, () => {
                runAction(type, value, $target);
                next();
            });
            break;
        case 'slide-down':
            $target.slideDown(200, () => {
                runAction(type, value, $target);
                next();
            });
            break;
        case 'fade-out':
            $target.fadeOut(200, () => {
                runAction(type, value, $target);
                next();
            });
            break;
        case 'fade-in':
            $target.fadeIn(200, () => {
                runAction(type, value, $target);
                next();
            });
            break;
        case 'zoom-in':
            $target.css({ transform: 'scale(0.5)', opacity: 0 }).animate(
                { transform: 'scale(1)', opacity: 1 },
                300,
                () => {
                    runAction(type, value, $target);
                    next();
                }
            );
            break;
        default:
            runAction(type, value, $target);
            next();
    }
}

function runAction(type, value, $target) {
    switch (type) {
        case 'remove':
            $target.remove();
            break;
        case 'hide':
            $target.hide();
            break;
        case 'show':
            $target.show();
            break;
        case 'add-class':
            if (value) $target.addClass(value);
            break;
        case 'remove-class':
            if (value) $target.removeClass(value);
            break;
        case 'toggle-class':
            if (value) $target.toggleClass(value);
            break;
        case 'enable':
            $target.prop('disabled', false);
            break;
        case 'disable':
            $target.prop('disabled', true);
            break;
        case 'readonly':
            $target.prop('readonly', true);
            break;
        default:
            console.warn(`LiveAction: Unknown action type '${type}'`);
    }
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
    handleLiveAction($el);
    handleLiveAnimate($el);
    // if (handleLiveAction($el)) return;
    // if (handleLiveAnimate($el)) return;

    const rawMethods = $el.attr(`live-${eventType}`);
    const rawTargets = $el.attr('live-target') || '';
    const domAction = $el.attr('live-dom') || 'html';
    const formSelector = $el.closest('form').length ? $el.closest('form') : null;
    const controller = $el.closest('[live-scope]').attr('live-scope');
    if (!controller && rawMethods) {
      console.warn(`[Live Event] Element with live-${eventType} needs a live-scope attribute on an ancestor.`, $el[0]);
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
        // Cek apakah elemen ini hanya menjalankan live-action saja
        const hasActionOnly = $el.attr('live-action') || $el.attr('live-animate');
        if (hasActionOnly) return; // hanya jalankan aksi/animasi, tanpa update isi

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
                const parsed = JSON.parse(argsRaw[0].replace(/'/g, '"')); // convert ' to " dulu
                if (Array.isArray(parsed)) {
                  argsRaw = [parsed]; // ganti isinya jadi array asli
                }
              } catch (e) {
                console.warn('Failed to parse stringified array literal:', argsRaw[0]);
              }
            }
          } catch (e) {
            console.warn(`[Live Event] Error parsing arguments: ${argsStr}`, e.message);
          }


          // Sanitize nilai untuk serialisasi aman
          const argsSanitized = argsRaw.map(arg => {
            if (arg instanceof Element) {
              return $(arg).is('input, select, textarea') ? $(arg).val() : $(arg).text().trim();
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
          console.warn(`[Live Event] Error parsing arguments for method "${name}":`, e.message);
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
          postData = { data: dataPayload };
        }
        
        runAjaxRequest(methodType, controller, method, postData, domAction, $targets, loading, $el);
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
            console.warn(`[LiveDomJs] live-callback-before function "${beforeCallback}" not found.`);
            result = undefined;
          }
        }

        if (result instanceof Promise) {
          result.then(ok => {
            if (ok !== false) execute();
          }).catch(() => {});
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
      handleLiveComputeUnified();
      return;
    }

    const content = extractElementContent($el);
    $targets.each(function () {
      applyDomAction($(this), domAction, content);
    });

    handleLiveIf();
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
    const contentList = typeof contents === 'object' && !Array.isArray(contents) 
                      ? [contents] 
                      : (Array.isArray(contents) ? contents : [contents]);

    $targets.each(function(targetIndex) {
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

    handleLiveIf();
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
  /**
   * Handles live computation for elements with 'live-compute' attribute.
   * @param {Element|Document} [scope=document] - The scope within which to find live-compute elements.
   */
  function handleLiveComputeUnified(scope) {
    const $scope = $(scope || document);
    const COMPUTE_CACHE_KEY = 'liveComputeCache';
    const DEPENDENCY_MAP_KEY = 'liveComputeDeps';
    const DEBOUNCE_DELAY = 50;
    let debounceTimer;
    let isProcessing = false;

    // Date calculation functions
    const dateUtils = {
      rangeDate: (start, end) => {
        try {
          if (!start || !end) return 0;
          const d1 = new Date(start);
          const d2 = new Date(end);
          if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
          return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
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

    // Initialize cache and dependency map if not exists
    if (!$scope.data(COMPUTE_CACHE_KEY)) {
      $scope.data(COMPUTE_CACHE_KEY, new Map());
    }
    if (!$scope.data(DEPENDENCY_MAP_KEY)) {
      buildDependencyMap($scope);
    }

    // Main processing function
    function process() {
      if (isProcessing) return;
      
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        isProcessing = true;
        try {
          const cache = $scope.data(COMPUTE_CACHE_KEY);
          const dependencyMap = $scope.data(DEPENDENCY_MAP_KEY);
          
          $scope.find('[live-compute]').each(function() {
            const $el = $(this);
            const el = this;
            const expr = $el.attr('live-compute')?.trim() || '';
            
            if (!expr) return;
            
            try {
              if (shouldSkipElement($el, el)) return;
              
              const globalInputs = getGlobalInputs($scope);
              const indices = getRowIndices($scope);
              const result = evaluateExpression(expr, globalInputs, indices);
              displayResult($el, result, cache);
              
            } catch (error) {
              console.error('LiveCompute error:', error);
              displayResult($el, '', cache);
            }
          });
        } finally {
          isProcessing = false;
        }
      }, DEBOUNCE_DELAY);
    }

    function shouldSkipElement($el, el) {
      return document.activeElement === el && $el.is('input, textarea, select');
    }

    function buildDependencyMap($container) {
      const depMap = new Map();
      $container.find('[live-compute]').each(function() {
        const expr = $(this).attr('live-compute')?.trim() || '';
        depMap.set(this, extractVariables(expr));
      });
      $container.data(DEPENDENCY_MAP_KEY, depMap);
    }

    function getGlobalInputs($container) {
      const inputs = {};
      $container.find('input[name], select[name], textarea[name]').each(function() {
        const name = $(this).attr('name');
        if (name) {
          inputs[sanitizeInputNameToJSVariable(name)] = $(this).val()?.toString().trim();
        }
      });
      return inputs;
    }

    // function getRowIndices($container) {
    //   const indices = new Set();
    //   $container.find('input[name]').each(function() {
    //     const match = $(this).attr('name').match(/rows\[(\d+)\]\[/);
    //     if (match) indices.add(parseInt(match[1], 10));
    //   });
    //   return indices;
    // }

    function getRowIndices($container) {
  const indices = new Set();

  $container.find('input[name], select[name], textarea[name]').each(function() {
    const nameAttr = $(this).attr('name');
    if (!nameAttr) return;

    /**
     * Ambil semua angka yang diapit []
     * Contoh:
     * - amount[0] → [0]
     * - rows[2][amount] → [2]
     * - order_items[10][price] → [10]
     * - form[3][details][5][value] → [3, 5]
     */
    const matches = [...nameAttr.matchAll(/\[(\d+)\]/g)];

    if (matches.length) {
      // Ambil semua angka yang ditemukan
      matches.forEach(match => {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) indices.add(num);
      });
    }
  });

  return indices;
}



    function evaluateExpression(expr, globalInputs, indices) {
      // First check for date functions
      const dateFnMatch = expr.match(/(rangeDate|rangeMonth|rangeYear|rangeWeek)\(([^)]+)\)/);
      if (dateFnMatch) {
        return handleDateFunction(dateFnMatch[1], dateFnMatch[2], globalInputs);
      }

      // Process aggregate functions
      expr = processAggregateFunctions(expr, globalInputs, indices);
      
      // Handle regular expressions
      const vars = extractVariables(expr);
      const vals = vars.map(v => toNumber(getValue(v, globalInputs, $scope)));
      
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
        return getValue(varName, globalInputs, $scope);
      });
      
      if (args.length !== 2 || !args[0] || !args[1]) return 0;
      
      try {
        return dateUtils[fnName](args[0], args[1]);
      } catch (e) {
        console.error(`${fnName} execution error:`, e);
        return 0;
      }
    }

    function safeFunctionEvaluation(vars, vals, expr) {
      const context = {
        ...dateUtils,
        parseFloat
      };
      
      const argNames = [...vars, ...Object.keys(context)];
      const argValues = [...vals, ...Object.values(context)];
      
      return new Function(...argNames, `return ${expr}`)(...argValues);
    }

    function processAggregateFunctions(expr, globalInputs, indices) {
      return expr.replace(/(sum|avg|min|max|count)\(([^()]+)\)/g, (_, fn, arg) => {
        const vals = getAggregateValues(arg, globalInputs, indices);
        return calculateAggregate(fn, vals);
      });
    }

    function getAggregateValues(arg, globalInputs, indices) {
      arg = arg.trim();
      const vals = [];
      
      if (arg.includes('?')) {
        indices.forEach(i => vals.push(toNumber(getValue(arg.replace(/\?/g, i), globalInputs, $scope))));
      } else {
        vals.push(toNumber(getValue(arg, globalInputs, $scope)));
      }
      
      return vals;
    }

    function calculateAggregate(fn, vals) {
      switch (fn) {
        case 'sum': return vals.reduce((a, b) => a + b, 0);
        case 'avg': return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        case 'min': return Math.min(...vals);
        case 'max': return Math.max(...vals);
        case 'count': return vals.length;
        default: return 0;
      }
    }

    function displayResult($el, result, cache) {
      const el = $el[0];
      const format = $el.attr('live-compute-format');
      let formattedResult = formatResult(result, format);
      
      if (cache.get(el) !== formattedResult) {
        cache.set(el, formattedResult);
        updateElementValue($el, formattedResult);
      }
    }

    function formatResult(result, format) {
      if (result === null || result === undefined || (typeof result === 'number' && isNaN(result))) {
        return '';
      }
      
      switch (format) {
        case 'currency':
        case 'idr': return formatRupiah(result.toString());
        case 'percent': return typeof result === 'number' ? (result * 100).toFixed(2) + '%' : result;
        case 'number': return typeof result === 'number' ? result.toLocaleString('id-ID') : result;
        case 'days': return typeof result === 'number' ? `${result} days` : result;
        case 'months': return typeof result === 'number' ? `${result} months` : result;
        case 'years': return typeof result === 'number' ? `${result} years` : result;
        case 'weeks': return typeof result === 'number' ? `${result} weeks` : result;
        default: return result.toString();
      }
    }

    function updateElementValue($el, value) {
      if ($el.is('input, textarea, select')) {
        $el.val(value);
      } else {
        $el.html(value);
      }
      $el.trigger('change');
    }

    function getValue(varName, globalInputs, $container) {
      const rowMatch = varName.match(/^rows_(\d+)_(.+)$/);
      if (rowMatch) {
        const [_, index, field] = rowMatch;
        const selector = `[name="rows[${index}][${field}]"]`;
        const $input = $container.find(selector);
        return $input.length ? $input.val().toString().trim() : '';
      }
      return globalInputs[varName] || '';
    }

    function toNumber(val) {
      if (val == null || val === '') return 0;
      val = val.toString()
        .replace('%', '')
        .replace(/[^\d.,-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    }

    function extractVariables(expr) {
      // Skip function names and numeric values
      const vars = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      return [...new Set(vars.filter(v => !/^\d+$/.test(v) && !dateUtils[v]))];
    }

    function init() {
      process();
      $scope.on('input change', 'input, select, textarea', function() {
        if (!shouldSkipElement($(this), this)) process();
      });
      $scope.on('blur', '[live-compute]', () => process());
    }

    init();
  }

  // Helper functions remain the same
  function sanitizeInputNameToJSVariable(name) {
    return name.replace(/\]\[/g, '_')
              .replace(/[\[\]]/g, '')
              .replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function formatRupiah(amount) {
    if (!amount) return '';
    const num = parseFloat(amount.toString().replace(/[^\d.-]/g, ''));
    return isNaN(num) ? amount : new Intl.NumberFormat('id-ID').format(num);
  }
  /*==============================
    LIVE-IF
  ==============================*/
  /**
   * Handles conditional visibility/state for elements with 'live-if' attribute.
   * @param {Element|Document} [scope=document] - The scope within which to find live-if elements.
   */
    function handleLiveIf(scope) {
      const $scope = $(scope || document);
      const getInputValue = ($el) => {
        if ($el.is(':checkbox')) return $el.prop('checked');
        if ($el.is(':radio')) {
          const name = $el.attr('name');
          return $el.closest('[live-scope]').find(`input[name="${name}"]:checked`).val() || '';
        }
        const val = $el.val();
        if (val === '') return null;
        if (val === 'true') return true;
        if (val === 'false') return false;
        if (!isNaN(val)) return parseFloat(val);
        return val;
      };

      const evaluateExpression = (expr, context) => {
        try {
          // Inject helper includesLoose ke dalam scope
          const helpers = {
            includesLoose: (arr, val) => {
              try {
                const valNum = parseFloat(val);
                return arr.some(item => item == val || item == valNum);
              } catch {
                return arr.includes(val);
              }
            }
          };
          return new Function('context', 'helpers', `
            with({...context, ...helpers}) { return (${expr}); }
          `)(context, helpers);
        } catch (e) {
          console.warn('LiveIf evaluation error:', expr, e.message);
          return false;
        }
      };


      if (!$scope.data('live-if-listener-bound')) {
        $scope.on('input change', 'input[name], select[name], textarea[name]', () => {
          handleLiveIf($scope);
          handleLiveThenElse($scope);
        });
        $scope.data('live-if-listener-bound', true);
      }

      $scope.find('[live-if]').each(function () {
        const $el = $(this);
        const expr = $el.attr('live-if');
        let context = {};
        const parentStateContainer = $el.closest('[live-state]')[0];
        if (parentStateContainer) {
          const state = window.LiveState?.getState(parentStateContainer);
          if (state) context = { ...state };
        }

        $scope.find('input[name], select[name], textarea[name]').each(function () {
          const $input = $(this);
          const name = $input.attr('name');
          const val = getInputValue($input);
          context[name] = autoCoerce(val);
        });

        const result = evaluateExpression(expr, context);
        const hasThenElse = $el.is('[live-then], [live-else]');

        // Logika untuk persyaratan 1: jika hanya live-if, default ke hide-show
        if (!hasThenElse) {
          const animateType = $el.attr('live-animate'); // ambil live-animate jika ada

          if (result) {
            if (!$el.is(':visible')) {
              if (animateType) {
                // Gunakan handleLiveAnimate untuk animasi muncul
                handleLiveAnimate($el);
              } else {
                $el.show();
              }
            }
          } else {
            if ($el.is(':visible')) {
              if (animateType) {
                // Ganti animasi untuk hide
                let hideAnimate = animateType
                  .replace('in', 'out')
                  .replace('down', 'up')
                  .replace('show', 'hide')
                  .replace('toggle', 'toggle'); // toggle biarkan tetap
                $el.attr('live-animate', hideAnimate);
                handleLiveAnimate($el);
                $el.attr('live-animate', animateType); // kembalikan supaya tidak berubah permanent
              } else {
                $el.hide();
              }
            }
          }
        }
      });
    }

    /**
     * Handles conditional actions with 'live-if' + 'live-then' / 'live-else'
     */
    /**
   * Handles conditional actions with 'live-if' + 'live-then' / 'live-else'
   */
  function handleLiveThenElse(scope) {
      const $scope = $(scope || document);
      const getInputValue = ($el) => {
        if ($el.is(':checkbox')) return $el.prop('checked');
        if ($el.is(':radio')) {
          const name = $el.attr('name');
          return $el.closest('[live-scope]').find(`input[name="${name}"]:checked`).val() || '';
        }
        return $el.val();
      };

      $scope.find('[live-if][live-then], [live-if][live-else]').each(function () {
        const $el = $(this);
        const expr = $el.attr('live-if');
        const thenChain = $el.attr('live-then') || null;
        const elseChain = $el.attr('live-else') || null;

        // Simpan gaya display asli jika belum disimpan, khusus untuk elemen dengan live-then tanpa live-else
        // Ini penting untuk mengembalikan visibility jika action 'hide' atau 'show' digunakan
        if (thenChain && !elseChain && $el.data('original-display-set') === undefined) {
          $el.data('original-display', $el.css('display'));
          $el.data('original-display-set', true);
        }

        let context = {};
        const parentStateContainer = $el.closest('[live-state]')[0];
        if (parentStateContainer) {
          const state = window.LiveState?.getState(parentStateContainer);
          if (state) context = { ...state };
        }

        $scope.find('input[name], select[name], textarea[name]').each(function () {
          const $input = $(this);
          const name = $input.attr('name');
          const val = getInputValue($input);
          context[name] = val === null || val === undefined ? 0 : val;
        });

        const passed = new Function('context', `with(context) { return (${expr}); }`)(context);

        if (passed) {
          if (thenChain) {
            const chainList = thenChain.split('->').map(s => s.trim());
            runActionChain(chainList, 0, $el, '');
          }
        } else {
          if (elseChain) {
            const chainList = elseChain.split('->').map(s => s.trim());
            runActionChain(chainList, 0, $el, '');
          } else if (thenChain) { // Kondisi false, dan hanya live-then yang ada (tidak ada live-else)
            // Kembalikan display ke kondisi asli
            const originalDisplay = $el.data('original-display');
            if (originalDisplay !== undefined) {
              $el.css('display', originalDisplay);
            }

            // Kembalikan aksi yang ditentukan di live-then (inverse actions)
            const thenActionList = thenChain.split('->').map(s => s.trim());
            thenActionList.forEach(action => {
              if (action === 'readonly') {
                $el.removeAttr('readonly');
              } else if (action === 'disable') {
                $el.removeAttr('disabled');
              } else if (action.startsWith('add-class(') && action.endsWith(')')) {
                const className = action.substring('add-class('.length, action.length - 1);
                $el.removeClass(className);
              } else if (action.startsWith('remove-class(') && action.endsWith(')')) {
                const className = action.substring('remove-class('.length, action.length - 1);
                $el.addClass(className);
              } else if (action === 'hide') {
                $el.show(); // Jika sebelumnya disembunyikan, tampilkan lagi
              } else if (action === 'show') {
                $el.hide(); // Jika sebelumnya ditampilkan, sembunyikan lagi
              }
              // Tambahkan logika inverse untuk aksi lain jika diperlukan
            });
          }
        }
      });
    }

  function autoCoerce(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (val === 'true') return true;
    if (val === 'false') return false;
    const n = parseFloat(val);
    return isNaN(n) ? val : n;
  }


  /*==============================
    ACCORDION
  ==============================*/

  /**
   * Handles click events for live-accordion elements.
   * @param {jQuery} $el - The jQuery object of the accordion trigger.
   */
  function handleAccordionClick($el) {
    const $row = $el.closest('tr');
    if (!$row.length) return;

    const controller = $row.closest('[live-scope]').attr('live-scope');
    const method = $el.attr('live-accordion');
    const dataArg = $el.attr('live-data');

    const isOpen = $el.data('accordion-open') === true;
    const iconSelector = $el.attr('live-icon');
    const $icon = iconSelector ? $el.find(iconSelector) : $el.find('.accordion-icon');

    const targetSelector = $el.attr('live-target');
    const $target = targetSelector ? liveTarget($el, targetSelector) : null;

    if (isOpen) {
      if ($target?.length) {
        $target.slideUp(200, function () {
          $(this).remove();
        });
      } else {
        const $panelRows = $row.data('accordion-tr');
        if ($panelRows?.length) {
          $panelRows.slideUp(200, function () {
            $(this).remove();
          });
          $row.removeData('accordion-tr');
        }
      }
      $icon.removeClass('rotate-90').addClass('rotate-0');
      $el.data('accordion-open', false);
      return;
    }

    $icon.removeClass('rotate-0').addClass('rotate-90');
    $el.data('accordion-open', true);

    if ($row.data('accordion-tr')) {
      $row.data('accordion-tr').slideDown(200);
      return;
    }

    if ($target?.length) {
      $target.slideDown(200);
      return;
    }

    const $table = $row.closest('table');
    const colCount = getTableColumnCount($table);

    const $loadingRow = $(`
      <tr accordion-panel-loading>
        <td colspan="${colCount}" class="text-center py-2 text-gray-500">Loading...</td>
      </tr>
    `);

    $row.after($loadingRow);
    $row.data('accordion-tr', $loadingRow);

    if (controller && method) {
      const data = dataArg ? {
        data: dataArg
      } : extractData($el, null);

      const callback = function (res) {
        if (res.success && res.data) {
          const $childRows = $(res.data);
          $loadingRow.replaceWith($childRows);
          $row.data('accordion-tr', $childRows);
          document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
        } else {
          $loadingRow.find('td').html('<div class="text-red-500">Failed to load content</div>');
        }
      };

      debouncedAjaxDynamic('POST', controller, method, data, '', '', true, callback);
    }
  }

  /**
   * Gets the column count of a table, considering colspans.
   * @param {jQuery} $table - The jQuery object of the table.
   * @returns {number} The total number of columns.
   */
  function getTableColumnCount($table) {
    const $thead = $table.find('thead');
    if ($thead.length) {
      let count = 0;
      $thead.find('tr').first().children('th, td').each(function () {
        count += parseInt($(this).attr('colspan') || 1, 10);
      });
      return count;
    } else {
      let maxCount = 0;
      $table.find('tbody tr').each(function () {
        let count = 0;
        $(this).children('td, th').each(function () {
          count += parseInt($(this).attr('colspan') || 1, 10);
        });
        if (count > maxCount) maxCount = count;
      });
      return maxCount || 1;
    }
  }

  /*==============================
    LIVE TRIGGER
  ==============================*/

  /**
   * Initializes event listeners for 'live-trigger' attributes.
   * Ensures handlers are only bound once.
   */
  function initLiveTriggerEvents() {
    $(document).off('.live-trigger');

    const triggerAttributes = [
      'live-trigger-click',
      'live-trigger-change',
      'live-trigger-input',
      'live-trigger-hover'
    ];

    triggerAttributes.forEach(attr => {
      $(`[${attr}]`).each(function () {
        const $el = $(this);
        if ($el.data(`live-trigger-initialized-${attr}`)) return;

        $el.data(`live-trigger-initialized-${attr}`, true);

        const eventType = attr.replace('live-trigger-', '');
        const triggerValue = $el.attr(attr);

        const bindHandler = (eventName, conditionFn) => {
          $(document).on(`${eventName}.live-trigger`, function (e) {
            const $target = $(e.target);
            if (conditionFn($target, e)) {
              if (!handleLiveAction($el)) $el.trigger(eventType);
            }
          });
        };

        if (triggerValue.startsWith('outside(')) {
          const selector = triggerValue.match(/^outside\((.+?)\)$/)?.[1];
          if (!selector) {
            console.warn(`[Live Trigger] Invalid outside() selector for ${attr}`, $el[0]);
            return;
          }
          bindHandler(eventType, ($target) =>
            !$target.closest(selector).length &&
            !$el.is($target) &&
            !$el.has($target).length &&
            $el.is(':visible')
          );
        } else if (triggerValue.startsWith('inside(')) {
          const selector = triggerValue.match(/^inside\((.+?)\)$/)?.[1];
          if (!selector) {
            console.warn(`[Live Trigger] Invalid inside() selector for ${attr}`, $el[0]);
            return;
          }
          bindHandler(eventType, ($target) =>
            $target.closest(selector).length
          );
        } else if (triggerValue === 'this') {
          $el.on(eventType, function () {
            if (!handleLiveAction($el)) $el.trigger(eventType);
          });
        } else if (triggerValue === 'parent') {
          const $parent = $el.parent();
          $parent.on(eventType, function () {
            if (!handleLiveAction($el)) $el.trigger(eventType);
          });
        } else {
          // Direct selector
          bindHandler(eventType, ($target) => $target.is(triggerValue) || $target.closest(triggerValue).length);
        }
      });
    });
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
        mainRegion.innerHTML = '<div class="text-red-500 p-4">Failed to load content (network error)</div>';
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
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
              })
                .then(res => res.text())
                .then(html => {
                  updateSpaRegions(html);
                  document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
                  document.dispatchEvent(new CustomEvent('live-dom:afterSpa', { detail: { url: redirectUrl } }));
                  history.pushState({ spa: true, url: redirectUrl }, '', redirectUrl);
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
        const errorHtml = `<div class="invalid-feedback text-red-600 text-sm mt-1">${messages.join('<br>')}</div>`;
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
    const existing = document.getElementById('spa-error-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'spa-error-modal';
    modal.innerHTML = `
      <style>
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

    let parsedJson = null;
    try {
      parsedJson = typeof rawHtmlOrJson === 'string' ? JSON.parse(rawHtmlOrJson) : rawHtmlOrJson;
    } catch (e) {
      console.warn('Failed to parse error response as JSON:', e);
    }

    if (parsedJson && typeof parsedJson === 'object' && parsedJson.message) {
      contentDiv.innerHTML = formatLaravelError(parsedJson);
    } else {
      contentDiv.innerHTML = rawHtmlOrJson;
    }

    modal.querySelector('#spa-error-close').onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
  }

  /**
   * Formats a Laravel error JSON object into readable HTML.
   * @param {object} err - The Laravel error object.
   * @returns {string} Formatted HTML string.
   */
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
        const isAlreadyWrapped = /^\s*\(?\s*(?:function\s*\(|async\s+function\s*\()/i.test(trimmed);

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

  /*==============================
    LIVE STATE
  ==============================*/

  /*==============================
      UTILITY FUNCTIONS
    ==============================*/
    const deepClone = obj => JSON.parse(JSON.stringify(obj));
    
    const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    
    const tryEval = (val, context = {}) => {
        try {
            return (new Function(...Object.keys(context), `return ${val}`))(...Object.values(context));
        } catch {
            return val;
        }
    };

    /*==============================
      STATE PARSING & INITIALIZATION
    ==============================*/
    function parseStateExpression(expr, parentContext = null) {
        try {
            expr = expr.trim();
            
            // Handle object literals and JSON
            if (expr.startsWith('{') && expr.endsWith('}')) {
                try {
                    return parentContext 
                        ? (new Function('_parent', `return ${expr}`))(parentContext)
                        : (new Function(`return ${expr}`))();
                } catch (e) {
                    return JSON.parse(expr);
                }
            }
            
            // Handle simple key:value pairs
            return expr.split(',').reduce((acc, pair) => {
                const [key, val] = pair.split(':').map(s => s.trim());
                if (key && val !== undefined) {
                    acc[key] = tryEval(val, parentContext);
                }
                return acc;
            }, {});
        } catch (e) {
            console.error('LiveState: Invalid state expression', expr, e);
            return {};
        }
    }

    function initializeState(element, parentState = null) {
        const $el = $(element);
        const stateExpr = $el.attr('live-state') || '{}';
        const parentContext = parentState ? { parent: parentState } : null;
        
        const initialState = parseStateExpression(stateExpr, parentContext);
        const state = createStateProxy(initialState, element);
        
        stateProxies.set(element, state);
        vdomCache.set(element, element.cloneNode(true));
        elementStateMap.set(element, { parentState });

        // Initialize child components
        $el.find('[live-state]').each(function() {
            initializeState(this, state);
        });

        return state;
    }

    /*==============================
      REACTIVE STATE PROXY SYSTEM
    ==============================*/
    function createStateProxy(target, container, path = '') {
        // Convert nested objects to proxies
        Object.keys(target).forEach(key => {
            if (typeof target[key] === 'object' && target[key] !== null) {
                target[key] = createStateProxy(
                    target[key], 
                    container, 
                    path ? `${path}.${key}` : key
                );
            }
        });

        return new Proxy(target, {
            get(target, prop) {
                if (prop === '_isProxy') return true;
                if (prop === '_path') return path;
                return Reflect.get(target, prop);
            },
            set(target, prop, value) {
                const oldValue = target[prop];
                const fullPath = path ? `${path}.${prop}` : prop;

                // Handle nested objects
                if (typeof value === 'object' && value !== null && !value._isProxy) {
                    value = createStateProxy(value, container, fullPath);
                }

                const result = Reflect.set(target, prop, value);
                
                if (result && !deepEqual(oldValue, value)) {
                    triggerStateUpdate(container, fullPath, value, oldValue);
                }
                return result;
            },
            deleteProperty(target, prop) {
                const fullPath = path ? `${path}.${prop}` : prop;
                const result = Reflect.deleteProperty(target, prop);
                if (result) {
                    triggerStateUpdate(container, fullPath, undefined, target[prop]);
                }
                return result;
            }
        });
    }

    function triggerStateUpdate(container, path, value, oldValue) {
        const state = stateProxies.get(container);
        const callbacks = stateCallbacks.get(state);
        
        // Run beforeUpdate hooks
        callbacks?.beforeUpdate?.forEach(cb => 
            cb({ path, value, oldValue, state })
        );

        // Trigger watchers
        const watchers = stateWatchers.get(state);
        if (watchers) {
            // Exact path matches
            watchers.get(path)?.forEach(cb => cb(value, oldValue));
            
            // Wildcard matches (e.g., 'user.*')
            const wildcardPath = path.split('.').slice(0, -1).join('.') + '.*';
            watchers.get(wildcardPath)?.forEach(cb => cb(value, oldValue, path));
        }

        // Update DOM bindings
        updateStateBindings(container, path);
        
        // Run updated hooks
        callbacks?.updated?.forEach(cb => 
            cb({ path, value, oldValue, state })
        );
    }

    /*==============================
      DOM BINDING & RENDERING
    ==============================*/
    function updateStateBindings(container, changedPath) {
        const $container = $(container);
        const state = stateProxies.get(container);
        
        // Find affected bindings
        const bindings = [
            'live-text', 'live-html', 'live-value',
            'live-class', 'live-style', 'live-if',
            'live-then', 'live-else', 'live-state-for'
        ];
        
        bindings.forEach(attr => {
            $container.find(`[${attr}]`).addBack(`[${attr}]`).each(function() {
                const expr = $(this).attr(attr);
                if (expr && dependsOnPath(expr, changedPath)) {
                    processStateBinding(this, attr, state);
                }
            });
        });
    }

    function dependsOnPath(expr, path) {
        // const pathParts = path.split('.');
        // return pathParts.some((_, i) => {
        //     const testPath = pathParts.slice(0, i + 1).join('.');
        //     return expr.includes(testPath);
        // });

      const regex = new RegExp(`\\b${path.replace(/\./g, '\\.')}\\b`);
      return regex.test(expr);
    }

    function processStateBinding(element, attr, state) {
        const $el = $(element);
        const expr = $el.attr(attr);
        
        try {
            const value = evaluateWithState(expr, state);
            
            switch (attr) {
                case 'live-text':
                    if ($el.text() !== String(value)) {
                        $el.text(value != null ? value : '');
                    }
                    break;
                    
                case 'live-html':
                    if ($el.html() !== String(value)) {
                        $el.html(value);
                    }
                    break;
                    
                case 'live-value':
                    if ($el.val() !== String(value)) {
                        $el.val(value != null ? value : '');
                    }
                    break;
                    
                case 'live-class':
                    processClassBinding($el, expr, state);
                    break;
                    
                case 'live-style':
                    processStyleBinding($el, expr, state);
                    break;
                    
                case 'live-if':
                    processIfBinding($el, expr, state);
                    break;
                    
                case 'live-state-for':
                    processForBinding($el, expr, state);
                    break;
            }
        } catch (e) {
            console.error(`Error processing ${attr} binding:`, e);
        }
    }

    function evaluateWithState(expr, state) {
        try {
            return new Function('state', `with(state) { return (${expr}); }`)(state);
        } catch (e) {
            console.error('LiveState: Evaluation error:', expr, e);
            return undefined;
        }
    }

    /*==============================
      BINDING PROCESSORS
    ==============================*/
    function processClassBinding($el, expr, state) {
        const classDefinitions = expr.split(',').map(s => s.trim());
        classDefinitions.forEach(def => {
            const [className, condition] = def.split(':').map(s => s.trim());
            if (className && condition !== undefined) {
                const result = evaluateWithState(condition, state);
                $el.toggleClass(className, !!result);
            }
        });
    }

    function processStyleBinding($el, expr, state) {
        const styleDefinitions = expr.split(',').map(s => s.trim());
        styleDefinitions.forEach(def => {
            const [property, valueExpr] = def.split(':').map(s => s.trim());
            if (property && valueExpr !== undefined) {
                const value = evaluateWithState(valueExpr, state);
                if (value !== undefined) {
                    $el.css(property, value);
                }
            }
        });
    }

    function processIfBinding($el, expr, state) {
        const result = evaluateWithState(expr, state);
        const hasThenElse = $el.is('[live-then], [live-else]');

        if (!hasThenElse) {
            const animateType = $el.attr('live-animate');
            result ? showElement($el, animateType) : hideElement($el, animateType);
        }
    }

    function showElement($el, animateType) {
        if (!$el.is(':visible')) {
            animateType ? handleLiveAnimate($el) : $el.show();
        }
    }

    function hideElement($el, animateType) {
        if ($el.is(':visible')) {
            if (animateType) {
                const hideAnimate = animateType
                    .replace('in', 'out')
                    .replace('down', 'up')
                    .replace('show', 'hide');
                $el.attr('live-animate', hideAnimate);
                handleLiveAnimate($el);
                $el.attr('live-animate', animateType);
            } else {
                $el.hide();
            }
        }
    }

    function processForBinding($el, expr, state) {
        const match = expr.match(/^(?:(\w+)(?:,\s*(\w+))?\s+in\s+)?([\w.]+)$/);
        if (!match) return;

        const [_, itemVar, indexVar, statePath] = match;
        const stateArray = evaluateWithState(statePath, state);

        if (!Array.isArray(stateArray)) {
            $el.html('');
            return;
        }

        let $template = $el.data('liveStateForTemplate');
        if (!$template) {
            $template = $el.children('[live-state-for]').first();
            if (!$template.length) return;
            $template.remove();
            $el.data('liveStateForTemplate', $template);
        }

        const fragment = document.createDocumentFragment();
        
        stateArray.forEach((item, index) => {
            const $clone = $template.clone().removeAttr('live-state-for');
            const itemContext = { ...state, [itemVar]: item };
            if (indexVar) itemContext[indexVar] = index;
            itemContext.$index = index;

            ['live-text', 'live-html', 'live-value', 'live-class', 'live-style', 'live-if']
                .forEach(attr => {
                    $clone.find(`[${attr}]`).addBack(`[${attr}]`).each(function() {
                        processStateBinding(this, attr, itemContext);
                    });
                });

            fragment.appendChild($clone[0]);
        });

        $el.empty().append(fragment);
    }

    /*==============================
      EVENT HANDLING
    ==============================*/
    function setupEventHandlers() {
        const events = ['click', 'change', 'input', 'submit', 'mouseenter', 'mouseleave'];
        
        events.forEach(event => {
            $(document).off(`.liveState${event}`).on(
                `${event}.liveState${event}`, 
                `[live-state-${event}]`, 
                handleStateEvent
            );
        });
    }

    function handleStateEvent(e) {
        const $el = $(this);
        const eventType = e.type;
        const expr = $el.attr(`live-state-${eventType}`);
        
        if (!expr) return;
        
        const stateContainer = $el.closest('[live-state]')[0];
        if (!stateContainer) return;
        
        const state = stateProxies.get(stateContainer);
        if (!state) return;
        
        try {
            new Function('state', 'event', '$el', `
                with(state) {
                    ${expr.includes('return') ? expr : `return (${expr})`}
                }
            `)(state, e, $el);
        } catch (error) {
            console.error(`Error executing ${eventType} handler:`, error);
        }
    }

    /*==============================
      PUBLIC API
    ==============================*/
    window.LiveState = {
        init: function(scope = document) {
            $(scope).find('[live-state]').each(function() {
                if (!stateProxies.has(this)) {
                    initializeState(this);
                }
            });
            setupEventHandlers();
        },
        
        watch: function(element, path, callback) {
            const state = stateProxies.get(element);
            if (!state) return;
            
            const watchers = stateWatchers.get(state) || new Map();
            if (!watchers.has(path)) watchers.set(path, []);
            watchers.get(path).push(callback);
            stateWatchers.set(state, watchers);
        },
        
        getState: function(element, path = '') {
            const state = stateProxies.get(element);
            return path 
                ? path.split('.').reduce((obj, key) => obj?.[key], state)
                : state;
        },
        
        addCallback: function(element, hook, callback) {
            const state = stateProxies.get(element);
            if (!state) return;
            
            const callbacks = stateCallbacks.get(state) || {
                beforeUpdate: [], updated: [], beforeMount: [], mounted: []
            };
            
            if (callbacks[hook]) {
                callbacks[hook].push(callback);
                stateCallbacks.set(state, callbacks);
            }
        },
        
        setState: function(element, path, value) {
            const state = stateProxies.get(element);
            if (!state) return;
            
            const parts = path.split('.');
            const last = parts.pop();
            const target = parts.reduce((obj, key) => obj[key], state);
            
            if (target) {
                target[last] = value;
            }
        }
    };

    // Initialize on DOM ready
  

  /*==============================
    END LIVE STATE
  ==============================*/

  /**
   * Handles two-way data binding for elements with 'live-bind' attribute.
   * This should be called after `initLiveState`.
   */
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

    $(document).on('input change', '[live-scope] input, [live-scope] select, [live-scope] textarea', function () {
      handleLiveComputeUnified();
    });

    $(document).on('click', '[live-accordion]', function () {
      handleAccordionClick($(this));
    });

    handleLiveBind();

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const $el = $(entry.target);
          if ($el.attr('live-load-once') === 'true') {
            handleLiveEvent($el, 'load'); // Trigger load event
            observer.unobserve(entry.target); // Stop observing after load
          }
        }
      });
    }, { threshold: 0.1 });

    $('[live-load-once="true"]').each(function () {
      observer.observe(this);
    });

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

  // Event listener for general DOM updates
  document.addEventListener('live-dom:afterUpdate', function () {
    window.LiveState?.init();
    handleLiveComputeUnified();
    handleLiveIf();
    initLiveTriggerEvents(); // Re-initialize triggers for newly added DOM elements
  });

  // Event listener after SPA content loads
  document.addEventListener('live-dom:afterSpa', function () {
    // You might want to re-run other initializations here that depend on SPA content
    initLoadingBar(); // Ensure loading bar is initialized (it's safe to call multiple times)
    handlePollers(); // Restart pollers if needed for new content
  });

  // Handle browser's back/forward buttons for SPA
  window.addEventListener('popstate', function (event) {
      if (event.state && event.state.spa && event.state.url) {
        loadSpaContent(event.state.url, false); // false to prevent pushing state again
      }
  });

  window.ajaxDynamic = ajaxDynamic;
  window.debouncedAjaxDynamic = debouncedAjaxDynamic;
  window.LiveState?.init();

  // Initial setup when the DOM is ready
  $(document).ready(function () {
      initLoadingBar(); // Initialize the loading bar once
      if (document.querySelector('[live-spa-region="main"]')) {
          const currentUrl = window.location.href;
          // Replace initial history state to mark it as SPA-managed
          history.replaceState({
              spa: true,
              url: currentUrl
          }, '', currentUrl);
      }
      window.LiveState?.init();
      handleLiveBind();
      bindLiveDomEvents(); // Bind all event handlers
      handlePollers(); // Start initial pollers
      handleLiveIf(); // Initial evaluation of live-if conditions
      initLiveTriggerEvents(); // Initial setup of live-triggers
      handleLiveComputeUnified(); // Initial computation for live-compute elements
  });

  document.addEventListener('DOMContentLoaded', function() {
    window.LiveState?.init();
  });
})(jQuery);