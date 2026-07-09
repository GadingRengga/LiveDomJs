window.addEventListener("load", function () {
    const userLists = window.userGlobal;

    function subscribeChannel(channelName) {
        if (channelName.startsWith('private-')) {
            return Echo.private(channelName.replace(/^private-/, ''));
        }
        if (channelName.startsWith('presence-')) {
            return Echo.join(channelName.replace(/^presence-/, ''));
        }
        return Echo.channel(channelName.replace(/^public-/, ''));
    }

    // Channels yang otomatis disubscribe
    let channelsToSubscribe = ['public-realtime-updates'];

    if (userLists) {
        channelsToSubscribe.push(`private-user.${userLists}`);
    }

    const fetchingKeys = new Set();
    const FETCH_DEBOUNCE_MS = 3000; // reset key setelah 3 detik

    function isFetching(key) {
        return fetchingKeys.has(key);
    }

    function markFetching(key) {
        fetchingKeys.add(key);
        setTimeout(() => fetchingKeys.delete(key), FETCH_DEBOUNCE_MS);
    }

    // FIX (vanilla): dulu pakai $('[live-scope]').filter(...).first(), yang
    // hasilnya (objek jQuery) langsung dilempar ke runAjaxRequest() sebagai
    // targetEls. Tapi toElements() di livedom.js (vanilla) HANYA mengenali
    // Element / NodeList / Array / selector string — objek jQuery tidak
    // masuk kategori manapun, jadi diam-diam selalu resolve ke [] dan DOM
    // tidak pernah ter-update. Sekarang cari Element aslinya langsung
    // dengan querySelectorAll + Array#find (setara .filter().first()).
    function findScopeContaining(controller) {
        const candidates = document.querySelectorAll('[live-scope]');
        for (const el of candidates) {
            const scope = el.getAttribute('live-scope');
            if (scope && scope.includes(controller)) {
                return el;
            }
        }
        return null;
    }

    channelsToSubscribe.forEach(channelName => {
        subscribeChannel(channelName).listen('.livedom-realtime', function (e) {
            const controller = e.controller;
            const func = e.func;
            const data = e.data;

            // Cek apakah ada container live-scope yang mengandung controller
            const targetScope = findScopeContaining(controller);

            if (!targetScope) return; // tidak ada yang cocok → skip

            // FIX: key per controller+func, bukan flag global
            const fetchKey = `livedom-realtime::${controller}::${func}`;
            if (isFetching(fetchKey)) return;
            markFetching(fetchKey);

            runAjaxRequest(
                'GET',
                controller,
                func,
                { data: data, fetch: true },
                'html',
                targetScope,
                false
            );
        });

        subscribeChannel(channelName).listen('.html-render', function (e) {
            const controller = e.controller;
            const func = e.func;
            const target = e.target;
            const data = e.data;

            // FIX: key per controller+func+target, bukan flag global
            const fetchKey = `html-render::${controller}::${func}::${target}`;
            if (isFetching(fetchKey)) return;
            markFetching(fetchKey);

            // FIX (vanilla): `target` sudah berupa selector string (dikirim
            // dari reverbDynamic() di sisi PHP) — toElements() di
            // runAjaxRequest() sudah bisa terima string selector langsung,
            // jadi tidak perlu dibungkus $(target) lagi.
            runAjaxRequest(
                'GET',
                controller,
                func,
                {
                    data: data,
                    fetch: true
                },
                'html',
                target,
                false
            );
        });
    });

});
