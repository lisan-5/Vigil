/**
 * MockStreamClient — timer-driven stand-in for the WebSocket stream.
 * Timers start lazily on first subscription and stop when the last subscriber leaves.
 */
import type {
  ConnectionStatus,
  StreamClient,
  StreamTopic,
  StreamTopics,
  Unsubscribe,
} from "../client";
import { BUCKET_MS, generateBucket } from "./logs";
import type { MockWorld } from "./world";

type Handler = (m: unknown) => void;

export class MockStreamClient implements StreamClient {
  private handlers: { [K in StreamTopic]: Set<Handler> } = {
    logs: new Set(),
    metrics: new Set(),
    alerts: new Set(),
    incidents: new Set(),
  };
  private timers: Partial<Record<StreamTopic, ReturnType<typeof setInterval>>> = {};
  private worldUnsubs: Partial<Record<StreamTopic, () => void>> = {};
  private status: ConnectionStatus = "open";
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private lastBucket = Math.floor(Date.now() / BUCKET_MS) - 1;

  constructor(private world: MockWorld) {}

  subscribe<T extends StreamTopic>(
    topic: T,
    handler: (message: StreamTopics[T]) => void,
  ): Unsubscribe {
    const set = this.handlers[topic];
    set.add(handler as Handler);
    if (set.size === 1) this.start(topic);
    return () => {
      set.delete(handler as Handler);
      if (set.size === 0) this.stop(topic);
    };
  }

  getStatus() {
    return this.status;
  }

  onStatusChange(handler: (s: ConnectionStatus) => void) {
    this.statusHandlers.add(handler);
    return () => void this.statusHandlers.delete(handler);
  }

  private emit<T extends StreamTopic>(topic: T, message: StreamTopics[T]) {
    this.handlers[topic].forEach((h) => h(message));
  }

  private start(topic: StreamTopic) {
    if (typeof window === "undefined") return;
    switch (topic) {
      case "logs":
        this.lastBucket = Math.floor(Date.now() / BUCKET_MS) - 1;
        this.timers.logs = setInterval(() => {
          const current = Math.floor(Date.now() / BUCKET_MS) - 1;
          const batch = [];
          for (let b = this.lastBucket + 1; b <= current; b++)
            batch.push(...generateBucket(this.world, b));
          this.lastBucket = current;
          if (batch.length) this.emit("logs", batch);
        }, BUCKET_MS);
        break;
      case "metrics": {
        const tick = () => {
          const t = Math.floor(Date.now() / 1000) * 1000;
          this.emit("metrics", { t, services: this.world.snapshotsAt(t) });
        };
        this.timers.metrics = setInterval(tick, 1000);
        break;
      }
      case "alerts":
        this.worldUnsubs.alerts = this.world.onAlert((e) => this.emit("alerts", e));
        break;
      case "incidents":
        this.worldUnsubs.incidents = this.world.onIncident((e) => this.emit("incidents", e));
        break;
    }
  }

  private stop(topic: StreamTopic) {
    const t = this.timers[topic];
    if (t) clearInterval(t);
    delete this.timers[topic];
    this.worldUnsubs[topic]?.();
    delete this.worldUnsubs[topic];
  }
}
