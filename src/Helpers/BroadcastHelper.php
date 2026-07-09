<?php

use GadingRengga\LiveDomJS\Events\DynamicBroadcastEvent;

if (!function_exists('reverbDynamic')) {
    /**
     * Broadcast a dynamic controller/action call to LiveDomJS clients via Laravel Reverb.
     *
     * @param string $controller   Controller path as used by AjaxController (e.g. "User/ProfileController")
     * @param string $function     Method name to call on the controller when clients re-fetch
     * @param string $target       CSS selector target on the client (e.g. '#result', 'auto')
     * @param mixed  $data         Extra payload sent along with the broadcast
     * @param string $typeChannel  'public' | 'private' | 'presence'
     * @param array  $recipients   e.g. [1, 2, 3] or ['chatroom.5']. Defaults to ['realtime-updates'] for public channel.
     * @param string $eventName    Event name the client listens to ('html-render' | 'livedom-realtime')
     * @return void
     */
    function reverbDynamic(
        string $controller,
        string $function,
        string $target,
        $data = null,
        string $typeChannel = 'public',
        array $recipients = [],
        string $eventName = 'html-render'
    ): void {
        // Default channel jika public dan recipients kosong
        if (empty($recipients)) {
            if ($typeChannel === 'public') {
                $recipients = ['realtime-updates'];
            } else {
                throw new \InvalidArgumentException("Recipients harus diisi untuk channel type: $typeChannel");
            }
        }

        foreach ($recipients as $recipient) {
            $channelName = match ($typeChannel) {
                'private'  => "private-user.$recipient",
                'presence' => "presence-$recipient",
                'public'   => "public-$recipient",
                default    => throw new \InvalidArgumentException("Invalid channel type: $typeChannel"),
            };

            broadcast(new DynamicBroadcastEvent($controller, $function, $target, $data, $channelName, $eventName));
        }
    }
}
