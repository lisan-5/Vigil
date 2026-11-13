/**
 * The one place that decides which backend the UI talks to.
 *
 *   VITE_VIGIL_API_URL  set   → HttpVigilClient (REST)
 *   VITE_VIGIL_WS_URL   set   → WebSocketStreamClient (live data)
 *   unset                     → in-browser mock (MockVigilClient / MockStreamClient)
 *
 * Swapping the mock stream for a real WebSocket is a single env var change.
 */
import type { StreamClient, VigilClient } from "./client";
import { HttpVigilClient } from "./http/HttpVigilClient";
import { WebSocketStreamClient } from "./http/WebSocketStreamClient";
import { MockStreamClient } from "./mock/MockStreamClient";
import { MockVigilClient } from "./mock/MockVigilClient";
import { MockWorld } from "./mock/world";

const API_URL = import.meta.env.VITE_VIGIL_API_URL as string | undefined;
const WS_URL = import.meta.env.VITE_VIGIL_WS_URL as string | undefined;

let world: MockWorld | null = null;
const getWorld = () => (world ??= new MockWorld());

export const isMock = !API_URL;

export const vigil: VigilClient = API_URL
  ? new HttpVigilClient(API_URL, () =>
      typeof localStorage === "undefined" ? null : localStorage.getItem("vigil.token"),
    )
  : new MockVigilClient(getWorld());

export const stream: StreamClient = WS_URL
  ? new WebSocketStreamClient(WS_URL)
  : new MockStreamClient(getWorld());

export type { VigilClient, StreamClient } from "./client";
export * from "./types";
