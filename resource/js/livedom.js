(function ($) {
  'use strict';

  /* ==============================
  CORE AJAX FUNCTIONALITY
  ============================== */
  const ajaxControllers = {};

  /**
   * Handles AJAX requests with advanced features
   * @param {string} method - HTTP method (GET, POST, etc)
   * @param {string} controller - Controller name
   * @param {string} action - Action name
   * @param {Object|FormData} data - Request data
   * @param {string} target - Target type ('html' or function name)
   * @param {string} targetId - DOM selector
   * @param {boolean} loading - Show loading indicator
   * @param {function} callback - Custom callback
   */
  function ajaxRequest(
    method = 'POST',
    controller,
    action,
    data = {},
    target = 'html',
    targetId = '#',
    loading = true,
    callback = null
  ) {
    const requestKey = targetId || `${controller}_${action}`;
    
    // Cancel previous request if exists
    if (ajaxControllers[requestKey]) {
      ajaxControllers[requestKey].abort();
    }

    const abortController = new AbortController();
    ajaxControllers[requestKey] = abortController;

    if (loading) {
      showLoadingIndicator(targetId);
    }

    const isFormData = data instanceof FormData;
    const config = {
      url: `/ajax/${controller}/${action}`,
      method: method,
      headers: method !== 'GET' && !isFormData ? {
        'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
      } : {},
      data: method === 'GET' ? data : (isFormData ? data : JSON.stringify(data)),
      contentType: method === 'GET' ? undefined : (isFormData ? false : 'application/json'),
      processData: isFormData ? false : true,
      cache: false,
      signal: abortController.signal
    };

    $.ajax(config)
      .done(response => handleSuccess(response, targetId, loading, target, callback))
      .fail((jqXHR, textStatus) => handleError(jqXHR, textStatus, targetId, loading));
  }

  function handleSuccess(response, targetId, loading, target, callback) {
    if (loading) {
      hideLoadingIndicator(targetId);
    }

    if (typeof callback === 'function') {
      callback(response);
    } else {
      processResponse(target, targetId, response);
    }
  }

  function handleError(jqXHR, textStatus, targetId, loading) {
    if (loading) {
      targetId !== '#' ? hideLoadingIndicator(targetId) : $(".loading").hide();
    }

    if (textStatus === 'abort') return;

    const contentType = jqXHR.getResponseHeader('content-type') || '';
    const isHtmlResponse = contentType.includes('text/html');

    if (isHtmlResponse) {
      showErrorModal(jqXHR.responseText);
      return;
    }

    let errorData = {};
    try {
      errorData = jqXHR.responseJSON || JSON.parse(jqXHR.responseText);
    } catch (e) {
      errorData = { message: 'Unparsable response', raw: jqXHR.responseText };
    }

    showErrorModal(errorData);
  }

  function processResponse(target, targetId, response) {
    if (response.success) {
      if (typeof target === "string" && target !== "html" && window[target]) {
        window[target](response.data, targetId);
      } else if (target === "html") {
        $(targetId).html(response.data);
      } else if (typeof target == "function") {
        target(response.data, targetId);
      }
    } else {
      console.error('Error:', response.message);
    }
  }

  /* ==============================
    LOADING INDICATORS
  ============================== */
  function showLoadingIndicator(targetId) {
    const $target = $(targetId);
    if ($target.length === 0) return;

    $target.find('.dynamic-loading-overlay').remove();

    const $overlay = $(`
      <div class="dynamic-loading-overlay">
        <div class="spinner-glow"></div>
      </div>
    `).css({
      position: 'absolute',
      inset: 0,
      background: 'rgba(255, 255, 255, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      borderRadius: 'inherit',
      animation: 'fadeIn 0.3s ease-in-out'
    });

    injectSpinnerStyles();
    ensureTargetPositioning($target);
    $target.append($overlay);
  }

  function hideLoadingIndicator(targetId) {
    $(targetId).find('.dynamic-loading-overlay').fadeOut(300, function () {
      $(this).remove();
    });
  }

  function injectSpinnerStyles() {
    if ($('#spinner-style').length) return;

    const spinnerCSS = `
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

    $('head').append(`<style id="spinner-style">${spinnerCSS}</style>`);
  }

  function ensureTargetPositioning($target) {
    if ($target.css('position') === 'static') {
      $target.css('position', 'relative');
    }
  }

  /* ==============================
    ERROR HANDLING
  ============================== */
  function showErrorModal(errorContent) {
    removeExistingModal();

    const modalHTML = `
      <div id="spa-error-modal">
        <div id="spa-error-box" role="dialog" aria-modal="true" aria-labelledby="spa-error-title">
          <div id="spa-error-header">
            <h3 id="spa-error-title">⚠️ Laravel Error Occurred</h3>
            <button id="spa-error-close" aria-label="Close modal">&times;</button>
          </div>
          <div id="spa-error-content"></div>
        </div>
      </div>
    `;

    const modalCSS = `
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
    `;

    $('head').append(`<style id="error-modal-style">${modalCSS}</style>`);
    $('body').append(modalHTML);

    const $modal = $('#spa-error-modal');
    const $content = $('#spa-error-content');

    try {
      const parsedError = typeof errorContent === 'string' ? 
        JSON.parse(errorContent) : errorContent;
      
      if (parsedError && typeof parsedError === 'object' && parsedError.message) {
        $content.html(formatErrorDetails(parsedError));
      } else {
        $content.html(errorContent);
      }
    } catch {
      $content.html(errorContent);
    }

    $modal.on('click', '#spa-error-close', () => $modal.remove());
    $modal.on('click', e => {
      if (e.target === $modal[0]) $modal.remove();
    });
  }

  function removeExistingModal() {
    $('#spa-error-modal').remove();
    $('#error-modal-style').remove();
  }

  function formatErrorDetails(error) {
    const { message = 'Unknown error', exception = '', file = '', line = '', trace = {} } = error;

    const traceItems = Object.values(trace).map((frame, idx) => {
      const ffile = frame.file || 'unknown file';
      const fline = frame.line || '';
      const func = frame.function || '';
      const className = frame.class || '';
      const type = frame.type || '';
      const fullFunc = className ? `${className}${type}${func}()` : `${func}()`;

      return `
        <li style="margin-bottom:6px;">
          <div><strong>#${idx}</strong> ${fullFunc}</div>
          <div style="color:#999; font-style:italic;">${ffile}${fline ? ` : line ${fline}` : ''}</div>
        </li>
      `;
    }).join('');

    return `
      <h2 style="color:#b91c1c; margin-bottom:12px;">⚠️ Laravel Exception</h2>
      <div style="font-size:1.1rem; margin-bottom:8px;"><strong>Message:</strong> ${message}</div>
      <div style="margin-bottom:8px;"><strong>Exception:</strong> ${exception}</div>
      <div style="margin-bottom:12px;"><strong>File:</strong> ${file} <br><strong>Line:</strong> ${line}</div>
      <details open style="border:1px solid #e5e7eb; border-radius:8px; padding:12px; background:#fafafa;">
        <summary style="font-weight:bold; cursor:pointer; user-select:none;">
          Stack Trace (${Object.keys(trace).length} frames)
        </summary>
        <ol style="font-size:0.85rem; color:#555; padding-left:20px; margin-top:8px; max-height:250px; overflow:auto; border:1px solid #eee; border-radius:6px;">
          ${traceItems}
        </ol>
      </details>
    `;
  }

  /* ==============================
     UTILITY FUNCTIONS
  ============================== */
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function camelToKebab(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  function camelToSnake(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }

  function formatCurrency(num) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num);
  }

  function sanitizeInputNameToJSVariable(name) {
    return name.replace(/\]\[|\[|\]/g, '_').replace(/_+$/, '');
  }

  function autoBindDomFromResponse(data) {
    Object.entries(data).forEach(([key, value]) => {
      const selectors = [
        `#${key}`, `.${key}`,
        `#${camelToKebab(key)}`, `.${camelToKebab(key)}`,
        `#${camelToSnake(key)}`, `.${camelToSnake(key)}`
      ];

      for (const selector of selectors) {
        const $el = $(selector);
        if ($el.length) {
          $el.is('input, textarea, select') ? $el.val(value) : $el.html(value);
        }
      }
    });
  }

  /* ==============================
     EVENT HANDLERS
  ============================== */
  function resolveMethodType($el, eventType, formSelector) {
    let method = 'POST';
    if (eventType === 'submit' && formSelector) {
      method = ($(formSelector).attr('method') || 'POST').toUpperCase();
    }
    if ($el.attr('live-method')) {
      method = $el.attr('live-method').toUpperCase();
    }
    return method;
  }

  function extractData($el, formSelector) {
    if (formSelector) {
      const $form = $(formSelector);
      return $form.length ? new FormData($form[0]) : {};
    }
    
    const $scope = $el.closest('[live-scope]');
    const data = {};
    $scope.find('input[name], select[name], textarea[name]').each(function () {
      data[$(this).attr('name')] = $(this).val();
    });
    return data;
  }

  function extractElementContent($el) {
    if ($el.is('input, select, textarea')) return $el.val();
    if ($el.data('content') !== undefined) return $el.data('content');
    if ($el.attr('live-content') !== undefined) return $el.attr('live-content');
    
    const html = $el.html()?.trim();
    if (html) return html;
    
    const text = $el.text()?.trim();
    if (text) return text;
    
    return '';
  }

  /* ==============================
     ANIMATION HANDLERS
  ============================== */
  function handleAnimation($el) {
    const animateType = $el.attr('live-animate');
    if (!animateType) return false;

    const duration = parseInt($el.attr('live-duration') || 300);
    const easing = $el.attr('live-easing') || 'swing';
    const targetSelectors = $el.attr('live-target') || '';
    const $targets = findLiveTargets($el, targetSelectors);

    if (!$targets.length) return false;

    $targets.each(function () {
      const $target = $(this);
      const originalDisplay = $target.css('display') === 'none' ? 'block' : $target.css('display');

      switch (animateType) {
        case 'fade-in':
          $target.stop(true, true).fadeIn(duration, easing);
          break;
        case 'fade-out':
          $target.stop(true, true).fadeOut(duration, easing);
          break;
        case 'fade-toggle':
          $target.stop(true, true).fadeToggle(duration, easing);
          break;
        case 'slide-up':
          $target.stop(true, true).slideUp(duration, easing);
          break;
        case 'slide-down':
          $target.stop(true, true).slideDown(duration, easing);
          break;
        case 'slide-toggle':
          $target.stop(true, true).slideToggle(duration, easing);
          break;
        case 'slide-left':
          animateSlide($target, '100%', -100, duration, easing, originalDisplay);
          break;
        case 'slide-right':
          animateSlide($target, '-100%', 100, duration, easing, originalDisplay);
          break;
        case 'slide-horizontal-toggle':
          if ($target.is(':visible')) {
            animateSlideOut($target, 100, duration, easing);
          } else {
            animateSlide($target, '-100%', 100, duration, easing, originalDisplay);
          }
          break;
        case 'zoom-in':
          animateZoom($target, 0, 1, duration, easing, originalDisplay);
          break;
        case 'zoom-out':
          animateZoom($target, 1, 0, duration, easing, originalDisplay, true);
          break;
        case 'zoom-toggle':
          $el.attr('live-animate', $target.is(':visible') ? 'zoom-out' : 'zoom-in');
          handleAnimation($el);
          $el.attr('live-animate', 'zoom-toggle');
          break;
        case 'scale-up':
          animateScale($target, 0.8, 1, duration, easing, originalDisplay);
          break;
        case 'scale-down':
          animateScale($target, 1, 0.8, duration, easing, originalDisplay, true);
          break;
        case 'scale-toggle':
          $el.attr('live-animate', $target.is(':visible') ? 'scale-down' : 'scale-up');
          handleAnimation($el);
          $el.attr('live-animate', 'scale-toggle');
          break;
        default:
          handleCustomAnimation($target, animateType, duration);
          break;
      }
    });

    return true;
  }

  function animateSlide($target, startPos, endPos, duration, easing, display) {
    $target.css({ transform: `translateX(${startPos})`, opacity: 0, display })
      .animate({ translateX: endPos, opacity: 1 }, {
        step: (now, fx) => {
          if (fx.prop === 'translateX') {
            $target.css('transform', `translateX(${endPos - now}%)`);
          }
        },
        duration,
        easing,
        complete: () => $target.css('transform', '')
      });
  }

  function animateSlideOut($target, endPos, duration, easing) {
    $target.animate({ translateX: endPos, opacity: 0 }, {
      step: (now, fx) => {
        if (fx.prop === 'translateX') $target.css('transform', `translateX(${now}%)`);
      },
      duration,
      easing,
      complete: () => $target.hide().css('transform', '')
    });
  }

  function animateZoom($target, startScale, endScale, duration, easing, display, hideOnComplete = false) {
    $target.css({ transform: `scale(${startScale})`, display })
      .animate({ scale: endScale }, {
        step: (now, fx) => {
          if (fx.prop === 'scale') $target.css('transform', `scale(${now})`);
        },
        duration,
        easing,
        complete: () => {
          if (hideOnComplete) {
            $target.hide().css('transform', 'scale(1)');
          } else {
            $target.css('transform', 'scale(1)');
          }
        }
      });
  }

  function animateScale($target, startScale, endScale, duration, easing, display, hideOnComplete = false) {
    $target.css({ transform: `scale(${startScale})`, display })
      .animate({ scale: endScale }, {
        step: (now, fx) => {
          if (fx.prop === 'scale') $target.css('transform', `scale(${now})`);
        },
        duration,
        easing,
        complete: () => {
          if (hideOnComplete) {
            $target.hide().css('transform', '');
          } else {
            $target.css('transform', '');
          }
        }
      });
  }

  function handleCustomAnimation($target, animateType, duration) {
    $target.addClass(animateType);
    setTimeout(() => $target.removeClass(animateType), duration);
  }

  /* ==============================
     ACTION HANDLERS
  ============================== */
  function handleAction($el) {
    const actionAttr = $el.attr('live-action');
    if (!actionAttr) return false;

    const targetAttr = $el.attr('live-target');
    const targetList = targetAttr ? targetAttr.split(',').map(s => s.trim()) : ['self'];
    const actions = actionAttr.split(',').map(a => a.trim()).filter(Boolean);

    let halted = false;

    targetList.forEach((targetExpr, i) => {
      const actionStr = actions[i] || actions[actions.length - 1];
      const $targets = findLiveTargets($el, targetExpr);
      const [type, value] = actionStr.split(':').map(s => s.trim());

      $targets.each(function () {
        const $target = $(this);

        switch (type) {
          case 'remove':
            $target.remove();
            halted = true;
            break;
          case 'hide':
            $target.hide();
            break;
          case 'show':
            $target.show();
            break;
          case 'toggle':
            $target.toggle();
            break;
          case 'slide-up':
            $target.slideUp(200);
            break;
          case 'slide-down':
            $target.slideDown(200);
            break;
          case 'slide-toggle':
            $target.slideToggle(200);
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
          case 'disable':
            $target.prop('disabled', true);
            break;
          case 'enable':
            $target.prop('disabled', false);
            break;
        }
      });
    });

    return halted;
  }

  function findLiveTargets($el, targetSelector) {
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

  /* ==============================
     LIVE EVENT PROCESSING
  ============================== */
  function handleLiveEvent($el, eventType) {
    if (handleAction($el)) return;
    if (handleAnimation($el)) return;

    const method = $el.attr(`live-${eventType}`);
    const domAction = $el.attr('live-dom') || 'html';
    const targetSelector = $el.attr('live-target');
    const $targets = targetSelector ? findLiveTargets($el, targetSelector) : $el;

    const formSelector = $el.closest('form').length ? $el.closest('form') : null;
    const controller = $el.closest('[live-scope]').attr('live-scope');
    if (!controller) return;

    const loading = $el.attr('live-loading') === 'true';
    const loadingIndicator = $el.attr('live-loading-indicator');
    const dataArgs = $el.attr('live-data');

    const beforeCallback = $el.attr('live-callback-before');
    if (beforeCallback && typeof window[beforeCallback] === 'function') {
      const result = window[beforeCallback]($el[0]);
      handleCallbackResult(result, proceed);
      return;
    }

    proceed();

    function proceed() {
      const methodType = resolveMethodType($el, eventType, formSelector);
      const data = dataArgs ? { data: dataArgs } : extractData($el, formSelector);

      if (loadingIndicator) $(loadingIndicator).show();

      if (method) {
        const callback = function (response) {
          if (response.success && typeof response.data === 'object') {
            autoBindDomFromResponse(response.data);
          }

          if (typeof response.data === 'string') {
            $targets.each(function () {
              const $t = $(this);
              switch (domAction) {
                case 'append': $t.append(response.data); break;
                case 'prepend': $t.prepend(response.data); break;
                case 'before': $t.before(response.data); break;
                case 'after': $t.after(response.data); break;
                default: $t.html(response.data); break;
              }
            });
          }

          const afterCallback = $el.attr('live-callback-after');
          if (afterCallback && typeof window[afterCallback] === 'function') {
            window[afterCallback]($el[0], response);
          }

          document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
        };

        debounce(ajaxRequest, 300)(methodType, controller, method, data, '', '', loading, callback);
      } else {
        const content = extractElementContent($el);

        if (domAction === 'remove') {
          $targets.remove();
          handleLiveCompute();
          return;
        }

        $targets.each(function () {
          const $t = $(this);
          switch (domAction) {
            case 'append': $t.append(content); break;
            case 'prepend': $t.prepend(content); break;
            case 'before': $t.before(content); break;
            case 'after': $t.after(content); break;
            default: $t.html(content); break;
          }
        });
      }

      handleLiveIf();
    }
  }

  function handleCallbackResult(result, proceed) {
    if (result instanceof Promise) {
      result.then(ok => {
        if (ok !== false) proceed();
      }).catch(() => { });
    } else if (result !== false) {
      proceed();
    }
  }

  /* ==============================
     POLLING HANDLERS
  ============================== */
  function handlePollers() {
    $('[live-poll]').each(function () {
      const $el = $(this);
      const interval = parseInt($el.attr('live-poll'), 10);
      const controller = $el.attr('live-scope');
      const method = $el.attr('live-click') || 'poll';
      const target = '#' + $el.attr('id');

      setInterval(() => {
        ajaxRequest('GET', controller, method, {}, 'html', target);
      }, interval);
    });
  }

  /* ==============================
     COMPUTATION HANDLERS
  ============================== */
  function handleLiveCompute(scope) {
    const $scope = $(scope || document);

    function toNumber(val) {
      const n = parseFloat(val.toString().replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    }

    function toDate(val) {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }

    function rangeDate(startVal, endVal) {
      const d1 = toDate(startVal);
      const d2 = toDate(endVal);
      if (!d1 || !d2) return 0;
      const diffMs = d2 - d1;
      return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    $scope.find('[live-compute]').each(function () {
      const $el = $(this);
      const rawExp = $el.attr('live-compute').trim();
      if (!rawExp) return;

      const globalInputs = {};
      $scope.find('input[name], select[name], textarea[name]').each(function () {
        const rawName = $(this).attr('name');
        const jsName = sanitizeInputNameToJSVariable(rawName);
        globalInputs[jsName] = $(this).val();
      });

      const indices = new Set();
      $scope.find('input[name]').each(function () {
        const m = $(this).attr('name').match(/rows\[(\d+)\]\[/);
        if (m) indices.add(parseInt(m[1], 10));
      });

      function getValue(varName) {
        const m = varName.match(/^rows_(\d+)_(.+)$/);
        if (m) {
          const sel = `input[name="rows[${m[1]}][${m[2]}]"], select[name="rows[${m[1]}][${m[2]}]"], textarea[name="rows[${m[1]}][${m[2]}]"]`;
          const $inp = $scope.find(sel);
          return $inp.length ? $inp.val() : '';
        }
        return globalInputs[varName] ?? '';
      }

      let expr = rawExp;
      const aggRE = /(sum|avg|min|max|count)\(([^()]+)\)/g;

      while (aggRE.test(expr)) {
        expr = expr.replace(aggRE, (_, fn, arg) => {
          arg = arg.trim();
          const vals = [];

          if (arg.includes('?')) {
            indices.forEach(i => vals.push(toNumber(getValue(arg.replace(/\?/g, i)))));
          } else {
            vals.push(toNumber(getValue(arg)));
          }

          switch (fn) {
            case 'sum': return vals.reduce((a, b) => a + b, 0);
            case 'avg': return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            case 'min': return Math.min(...vals);
            case 'max': return Math.max(...vals);
            case 'count': return vals.length;
            default: return 0;
          }
        });
      }

      let result;
      const context = { rangeDate };

      if (expr.includes('?')) {
        result = 0;
        indices.forEach(i => {
          const expIdx = expr.replace(/\?/g, i);
          const vars = Array.from(new Set(expIdx.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []));
          const vals = vars.map(v => getValue(v));
          try {
            result += new Function(...vars, ...Object.keys(context), `return ${expIdx}`)(
              ...vals, ...Object.values(context)
            );
          } catch (e) {
            console.warn('LiveCompute error (per-row):', expIdx, e.message);
          }
        });
      } else {
        const vars = Array.from(new Set(expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []));
        const vals = vars.map(v => getValue(v));
        try {
          result = new Function(...vars, ...Object.keys(context), `return ${expr}`)(
            ...vals, ...Object.values(context)
          );
        } catch (e) {
          console.warn('LiveCompute error:', expr, e.message);
          result = 0;
        }
      }

      const format = $el.attr('live-compute-format');
      $el.html(format === 'currency' ? formatCurrency(result) : result);
    });
  }

  /* ==============================
     CONDITIONAL HANDLERS
  ============================== */
  function handleLiveIf(scope) {
    const $scope = $(scope || document);

    function getInputValue($el) {
      if ($el.is(':checkbox')) return $el.prop('checked');
      if ($el.is(':radio')) {
        const name = $el.attr('name');
        return $el.closest('[live-scope]').find(`input[name="${name}"]:checked`).val() || '';
      }
      const val = $el.val();
      if (val === '') return null;
      if (!isNaN(val)) return parseFloat(val);
      return val;
    }

    function evaluateExpression(expr, context) {
      try {
        return Function('context', `with(context) { return (${expr}) }`)(context);
      } catch (e) {
        console.warn('LiveIf evaluation error:', expr, e.message);
        return false;
      }
    }

    if (!$scope.data('live-if-listener-bound')) {
      $scope.on('input change', 'input[name], select[name], textarea[name]', () => {
        handleLiveIf($scope);
      });
      $scope.data('live-if-listener-bound', true);
    }

    $scope.find('[live-if]').each(function () {
      const $el = $(this);
      const expr = $el.attr('live-if');
      const actions = ($el.attr('live-action') || 'show').split(/\s+/).filter(Boolean);
      const targetSelector = $el.attr('live-target');
      const $targets = targetSelector ? findLiveTargets($el, targetSelector) : $el;

      const context = {};
      $scope.find('input[name], select[name], textarea[name]').each(function () {
        const $input = $(this);
        const name = $input.attr('name');
        const val = getInputValue($input);
        context[name] = val === null || val === undefined ? 0 : val;
      });

      const result = evaluateExpression(expr, context);

      actions.forEach(action => {
        if (action === 'show') {
          result ? $targets.show() : $targets.hide();
        } else if (action === 'hide') {
          result ? $targets.hide() : $targets.show();
        } else if (action === 'enable') {
          $targets.prop('disabled', !result);
        } else if (action === 'disable') {
          $targets.prop('disabled', result);
        } else if (action.startsWith('add-class:')) {
          const cls = action.split(':')[1];
          $targets.toggleClass(cls, result);
        } else if (action.startsWith('remove-class:')) {
          const cls = action.split(':')[1];
          if (result) $targets.removeClass(cls);
        } else if (action.startsWith('toggle-class:')) {
          const cls = action.split(':')[1];
          $targets.toggleClass(cls, result);
        } else if (action.startsWith('set-text:')) {
          const value = action.substring(9);
          if (result) $targets.text(value);
        } else if (action.startsWith('set-html:')) {
          const value = action.substring(9);
          if (result) $targets.html(value);
        } else if (action === 'remove') {
          if (result) $targets.remove();
        }
      });
    });
  }

  /* ==============================
     ACCORDION HANDLERS
  ============================== */
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
    const $target = targetSelector ? findLiveTargets($el, targetSelector) : null;

    // Close accordion
    if (isOpen) {
      if ($target?.length) {
        $target.slideUp(200, function () { $(this).remove(); });
      } else {
        const $panelRows = $row.data('accordion-tr');
        if ($panelRows?.length) {
          $panelRows.slideUp(200, function () { $(this).remove(); });
          $row.removeData('accordion-tr');
        }
      }
      $icon.removeClass('rotate-90').addClass('rotate-0');
      $el.data('accordion-open', false);
      return;
    }

    // Open accordion
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
      const data = dataArg ? { data: dataArg } : extractData($el, null);

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

      debounce(ajaxRequest, 300)('POST', controller, method, data, '', '', true, callback);
    }
  }

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

  /* ==============================
     TRIGGER HANDLERS
  ============================== */
  function initTriggerEvents() {
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

        const bindHandler = (eventName, selector, conditionFn = () => true) => {
          $(document).on(`${eventName}.live-trigger`, function (e) {
            const $target = $(e.target);
            if (conditionFn($target, e)) {
              if (!handleAction($el)) $el.trigger(eventType);
            }
          });
        };

        if (triggerValue.startsWith('outside(')) {
          const selector = triggerValue.match(/^outside\((.+?)\)$/)?.[1];
          bindHandler(eventType, selector, ($target) =>
            !$target.closest(selector).length &&
            !$el.is($target) &&
            !$el.has($target).length &&
            $el.is(':visible')
          );
          return;
        }

        if (triggerValue.startsWith('inside(')) {
          const selector = triggerValue.match(/^inside\((.+?)\)$/)?.[1];
          bindHandler(eventType, selector, ($target) =>
            $target.closest(selector).length
          );
          return;
        }

        if (triggerValue === 'this') {
          $el.on(eventType, function () {
            if (!handleAction($el)) $el.trigger(eventType);
          });
          return;
        }

        if (triggerValue === 'parent') {
          const $parent = $el.parent();
          $parent.on(eventType, function (e) {
            if (!handleAction($el)) $el.trigger(eventType);
          });
          return;
        }

        if (triggerValue.match(/^(\.|#|[a-zA-Z])/)) {
          bindHandler(eventType, triggerValue, () => true);
          return;
        }
      });
    });
  }

  /* ==============================
     SPA ROUTER
  ============================== */
  function initSpaRouter() {
    let currentController = null;

    function ajaxSpa(method, url, data = null, callback, errorCallback) {
      if (currentController) {
        currentController.abort();
      }

      currentController = new AbortController();
      const signal = currentController.signal;

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
            console.log('[SPA] Request canceled:', url);
            return;
          }
          console.error('ajaxSpa error:', error);
          errorCallback?.(error);
        })
        .finally(() => {
          hideLoadingBar();
        });
    }

    function updateSpaRegions(responseHtml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(responseHtml, 'text/html');
      const regions = document.querySelectorAll('[live-spa-region]');
      
      regions.forEach(region => {
        const regionName = region.getAttribute('live-spa-region');
        const newRegion = doc.querySelector(`[live-spa-region="${regionName}"]`);
        if (newRegion) region.innerHTML = newRegion.innerHTML;
        executeScripts(region);
      });
    }

    function loadSpaContent(url, pushState = true) {
      const mainRegion = document.querySelector('[live-spa-region="main"]');
      if (mainRegion) {
        mainRegion.innerHTML = '<div class="text-center p-4 text-gray-400">Loading...</div>';
      }

      ajaxSpa('GET', url, null, res => {
        updateSpaRegions(res);
        document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
        document.dispatchEvent(new CustomEvent('live-dom:afterSpa', { detail: { url } }));
        if (pushState) history.pushState({ spa: true, url }, '', url);
      }, () => {
        if (mainRegion) {
          mainRegion.innerHTML = '<div class="text-red-500 p-4">Failed to load content (network error)</div>';
        }
      });
    }

    function ajaxSpaFormSubmit(form, callbackSuccess, callbackError) {
      const url = form.action;
      const method = form.method.toUpperCase() || 'POST';
      const formData = new FormData(form);

      const beforeCallbackName = form.getAttribute('live-callback-before');
      const afterCallbackName = form.getAttribute('live-callback-after');

      const runBeforeCallback = () => {
        if (beforeCallbackName && typeof window[beforeCallbackName] === 'function') {
          return Promise.resolve(window[beforeCallbackName](form));
        }
        return Promise.resolve(true);
      };

      const runAfterCallback = (response, isError = false) => {
        if (afterCallbackName && typeof window[afterCallbackName] === 'function') {
          window[afterCallbackName](response, form, isError);
        }
      };

      runBeforeCallback()
        .then(result => {
          if (result === false) return;

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
              if (response && typeof response === 'object' && response.redirect) {
                const redirectUrl = response.redirect;
                fetch(redirectUrl, {
                  headers: { 'X-Requested-With': 'XMLHttpRequest' },
                })
                  .then(res => res.text())
                  .then(html => {
                    updateSpaRegions(html);
                    document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
                    document.dispatchEvent(
                      new CustomEvent('live-dom:afterSpa', { detail: { url: redirectUrl } })
                    );
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
                callbackSuccess?.(response);
                runAfterCallback(response, false);
              }
            },
            error: function (xhr) {
              if (xhr.status === 422) {
                const errors = xhr.responseJSON?.errors || {};
                showFormErrors(form, errors);
              } else {
                console.error('Form submit error:', xhr);
                let content = xhr.responseText;
                try {
                  const json = JSON.parse(content);
                  showErrorModal(json);
                } catch {
                  showErrorModal(content);
                }
              }
              callbackError?.(xhr);
              runAfterCallback(xhr, true);
            },
            complete: hideLoadingBar,
          });
        })
        .catch(() => {
          console.log('Form submit canceled by live-callback-before.');
        });
    }

    function clearFormErrors(form) {
      $(form).find('.is-invalid').removeClass('is-invalid');
      $(form).find('.invalid-feedback').remove();
    }

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

    function isSpaExcluded(url) {
      try {
        const path = new URL(url, window.location.origin).pathname;
        const excludes = (window.liveDomConfig?.spaExcludePrefixes || []).filter(Boolean);
        return excludes.some(prefix => path.startsWith(prefix));
      } catch {
        const excludes = (window.liveDomConfig?.spaExcludePrefixes || []).filter(Boolean);
        return excludes.some(prefix => url.startsWith(prefix));
      }
    }

    $(document).on('click', '[live-spa-region] a[href]:not([href^="#"]):not([href=""])', function (e) {
      const url = $(this).attr('href');
      if (!url) return;

      if (isSpaExcluded(url)) return;

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
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
          .then(res => res.text())
          .then(html => {
            updateSpaRegions(html);
            document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
            document.dispatchEvent(new CustomEvent('live-dom:afterSpa', { detail: { url: fullUrl } }));
            history.replaceState({ spa: true, url: fullUrl }, '', fullUrl);
          })
          .catch(err => console.error('SPA GET error:', err));

        return;
      }

      ajaxSpaFormSubmit(form, function (response) {
        if (typeof response === 'string') {
          updateSpaRegions(response);
          document.dispatchEvent(new CustomEvent('live-dom:afterUpdate'));
          document.dispatchEvent(new CustomEvent('live-dom:afterSpa', { detail: { url } }));
          history.pushState({ spa: true, url }, '', url);
        } else if (response && typeof response === 'object' && response.redirect) {
          console.log('SPA redirect already handled.');
        } else {
          console.log('Form SPA submit success:', response);
        }
      });
    });
  }

  /* ==============================
     LOADING BAR
  ============================== */
  function initLoadingBar() {
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

  function showLoadingBar() {
    $('#loading-bar').stop(true).css({ width: '0%', display: 'block' }).animate({ width: '80%' }, 800);
  }

  function hideLoadingBar() {
    $('#loading-bar').stop(true).animate({ width: '100%' }, 300, function () {
      $(this).fadeOut(200, function () {
        $(this).css({ width: '0%' });
      });
    });
  }

  /* ==============================
     SCRIPT HANDLING
  ============================== */
  const scriptCache = new Set();

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
        const newScript = document.createElement('script');
        let code = oldScript.textContent || '';
        const trimmed = code.trim();

        const isAlreadyWrapped = /^\(\s*function\s*\(/.test(trimmed) || /^\(async\s+function\s*\(/.test(trimmed);

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

  /* ==============================
     VIRTUAL DOM
  ============================== */
  function patchVDOM(oldEl, newEl) {
    if (!oldEl || !newEl) return;

    if (shouldSkipVDOM(oldEl)) return;

    if (oldEl.tagName !== newEl.tagName) {
      oldEl.replaceWith(newEl.cloneNode(true));
      return;
    }

    const oldAttrs = oldEl.attributes;
    const newAttrs = newEl.attributes;

    for (const attr of newAttrs) {
      if (oldEl.getAttribute(attr.name) !== attr.value) {
        oldEl.setAttribute(attr.name, attr.value);
      }
    }

    for (const attr of oldAttrs) {
      if (!newEl.hasAttribute(attr.name)) {
        oldEl.removeAttribute(attr.name);
      }
    }

    if (!oldEl.children.length && !newEl.children.length) {
      if (oldEl.textContent !== newEl.textContent) {
        oldEl.textContent = newEl.textContent;
      }
      return;
    }

    const oldChildren = Array.from(oldEl.childNodes);
    const newChildren = Array.from(newEl.childNodes);
    const maxLength = Math.max(oldChildren.length, newChildren.length);

    for (let i = 0; i < maxLength; i++) {
      const oldChild = oldChildren[i];
      const newChild = newChildren[i];

      if (!oldChild && newChild) {
        oldEl.appendChild(newChild.cloneNode(true));
        continue;
      }

      if (oldChild && !newChild) {
        oldEl.removeChild(oldChild);
        continue;
      }

      if (oldChild.nodeType !== newChild.nodeType) {
        oldChild.replaceWith(newChild.cloneNode(true));
        continue;
      }

      if (oldChild.nodeType === Node.TEXT_NODE && newChild.nodeType === Node.TEXT_NODE) {
        if (oldChild.textContent !== newChild.textContent) {
          oldChild.textContent = newChild.textContent;
        }
        continue;
      }

      patchVDOM(oldChild, newChild);
    }
  }

  function shouldSkipVDOM(el) {
    if (el.hasAttribute('data-vdom-skip')) return true;

    const isAlpine = el.hasAttribute('x-data') || 
                    el.hasAttribute('x-init') || 
                    [...el.attributes].some(attr => attr.name.startsWith('x-'));
    if (isAlpine) return true;

    const bootstrapSelectors = [
      '.modal.show',
      '.collapse.show',
      '.dropdown-menu.show',
      '.offcanvas.show',
      '.tooltip.show',
      '.popover.show',
      '.nav-tabs .active',
    ];

    return bootstrapSelectors.some(selector => 
      el.matches(selector) || el.closest(selector));
  }

  /* ==============================
  INITIALIZATION
  ============================== */
  $(document).ready(function () {
    // Event bindings
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

    $(document).on('input change', '[live-model]', function () {
      handleLiveEvent($(this), 'model');
    });

    $(document).on('input change', '[live-scope] input, [live-scope] select, [live-scope] textarea', function () {
      handleLiveCompute();
    });

    $(document).on('click', '[live-accordion]', function () {
      handleAccordionClick($(this));
    });

    // Initialize components
    initLoadingBar();
    initTriggerEvents();
    initSpaRouter();

    // Initial processing
    handlePollers();
    handleLiveIf();
    handleLiveCompute();

    // Event listeners
    document.addEventListener('live-dom:afterUpdate', function () {
      handleLiveCompute();
      handleLiveIf();
      initTriggerEvents();
    });

    document.addEventListener('live-dom:afterSpa', function () {
      initLoadingBar();
    });

    window.addEventListener('popstate', function (event) {
      if (event.state && event.state.spa && event.state.url) {
        loadSpaContent(event.state.url, false);
      }
    });

    // Initialize SPA if needed
    if (document.querySelector('[live-spa-region="main"]')) {
      const currentUrl = window.location.href;
      history.replaceState({ spa: true, url: currentUrl }, '', currentUrl);
    }
  });

})(jQuery);




