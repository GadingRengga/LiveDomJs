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

    // FIX: ganti satu flag global dengan per-key Set
    // Mencegah duplicate fetch untuk controller+func yang sama dalam window waktu tertentu
    // tapi tetap allow event berikutnya yang berbeda controller/func
    const fetchingKeys = new Set();
    const FETCH_DEBOUNCE_MS = 3000; // reset key setelah 3 detik

    function isFetching(key) {
        return fetchingKeys.has(key);
    }

    function markFetching(key) {
        fetchingKeys.add(key);
        setTimeout(() => fetchingKeys.delete(key), FETCH_DEBOUNCE_MS);
    }

    channelsToSubscribe.forEach(channelName => {
        subscribeChannel(channelName).listen('.livedom-realtime', function (e) {
            const controller = e.controller;
            const func = e.func;
            const data = e.data;

            // Cek apakah ada container live-scope yang mengandung controller
            const $targetScope = $('[live-scope]').filter(function () {
                const scope = $(this).attr('live-scope');
                return scope && scope.includes(controller);
            }).first();

            if (!$targetScope.length) return; // tidak ada yang cocok → skip

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
                $targetScope,
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

            const $target = $(target);

            runAjaxRequest(
                'GET',
                controller,
                func,
                {
                    data: data,
                    fetch: true
                },
                'html',
                $target,
                false
            );
        });
    });

});
