<?php

namespace GadingRengga\LiveDomJS\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DynamicBroadcastEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $controller;
    public string $function;
    public string $target;
    public $data;
    public string $channel;
    public string $eventName;

    /**
     * Create a new event instance.
     */
    public function __construct(
        string $controller,
        string $function,
        string $target,
        $data,
        string $channel = 'realtime-updates',
        string $eventName = 'html-render'
    ) {
        $this->controller = $controller;
        $this->function = $function;
        $this->target = $target;
        $this->data = $data;
        $this->channel = $channel;
        $this->eventName = $eventName;
    }

    public function broadcastOn(): Channel
    {
        [$type, $name] = explode('-', $this->channel, 2);

        return match ($type) {
            'private'  => new PrivateChannel($name),
            'presence' => new PresenceChannel($name),
            'public'   => new Channel($name),
            default    => throw new \InvalidArgumentException("Invalid channel type prefix: $type"),
        };
    }

    public function broadcastAs(): string
    {
        return $this->eventName;
    }

    public function broadcastWith(): array
    {
        return [
            'controller' => $this->controller,
            'func' => $this->function,
            'target' => $this->target,
            'data' => $this->data,
        ];
    }
}
