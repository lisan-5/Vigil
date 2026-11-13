/**
 * WebSocketStreamClient — StreamClient over a single multiplexed WebSocket.
 * Protocol (see docs/API_CONTRACT.md):
 *   client → { "type": "subscribe" | "unsubscribe", "topic": "logs" | "metrics" | "alerts" | "incidents" }
 *   server → { "type": "event", "topic": <topic>, "data": <payload> }
 * Reconnects with capped exponential backoff and re-subscribes automatically.
 */
import type {
  ConnectionStatus,
  StreamClient,
  StreamTopic,
  StreamTopics,
  Unsubscribe,
} from "../client";

type Handler = (m: unknown) => void;

export class WebSocketStreamClient implements StreamClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<StreamTopic, Set<Handler>>();
  private status: ConnectionStatus = "closed";
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private retry = 0;

  constructor(private url: string) {}

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }

  private connect() {
    if (this.ws || typeof window === "undefined") return;
    this.setStatus("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("open");
      for (const topic of this.handlers.keys())
        ws.send(JSON.stringify({ type: "subscribe", topic }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "event") this.handlers.get(msg.topic)?.forEach((h) => h(msg.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      this.setStatus("closed");
      if (this.handlers.size === 0) return;
      const wait = Math.min(15_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  subscribe<T extends StreamTopic>(
    topic: T,
    handler: (message: StreamTopics[T]) => void,
  ): Unsubscribe {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ type: "subscribe", topic }));
    }
    set.add(handler as Handler);
    this.connect();
    return () => {
      set!.delete(handler as Handler);
      if (set!.size === 0) {
        this.handlers.delete(topic);
        if (this.ws?.readyState === WebSocket.OPEN)
          this.ws.send(JSON.stringify({ type: "unsubscribe", topic }));
      }
    };
  }

  getStatus() {
    return this.status;
  }

  onStatusChange(handler: (s: ConnectionStatus) => void) {
    this.statusHandlers.add(handler);
    return () => void this.statusHandlers.delete(handler);
  }
}
