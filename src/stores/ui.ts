/**
 * Persisted UI preferences (localStorage key "vigil.ui").
 * Hydration is deferred until mount (see PreferencesHydrator) so SSR markup matches.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Aggregation, GroupBy, MetricName, ServiceName, TimeRange } from "@/api/types";

export type Theme = "dark" | "light";

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  createdAt: number;
}

export type WidgetConfig =
  | {
      kind: "metric";
      metric: MetricName;
      aggregation: Aggregation;
      groupBy: GroupBy;
      services?: ServiceName[];
      chart: "line" | "area" | "bar";
    }
  | { kind: "kpi"; kpi: "rps" | "errors" | "p95" | "alerts" }
  | { kind: "query"; query: string }
  | { kind: "alerts" }
  | { kind: "services" };

export interface Widget {
  id: string;
  title: string;
  /** Column span on a 3-column grid. */
  size: 1 | 2 | 3;
  config: WidgetConfig;
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_DASHBOARD: Dashboard = {
  id: "default",
  name: "Production",
  widgets: [
    { id: "w1", title: "Requests / sec", size: 1, config: { kind: "kpi", kpi: "rps" } },
    { id: "w2", title: "Error rate", size: 1, config: { kind: "kpi", kpi: "errors" } },
    { id: "w3", title: "Active alerts", size: 1, config: { kind: "kpi", kpi: "alerts" } },
    {
      id: "w4",
      title: "p95 latency by service",
      size: 2,
      config: {
        kind: "metric",
        metric: "latency.p95",
        aggregation: "avg",
        groupBy: "service",
        chart: "line",
      },
    },
    { id: "w5", title: "Open alerts", size: 1, config: { kind: "alerts" } },
    {
      id: "w6",
      title: "Errors by service, last 15m",
      size: 1,
      config: { kind: "query", query: "level:error | count by service | last 15m" },
    },
    {
      id: "w7",
      title: "Throughput by region",
      size: 2,
      config: {
        kind: "metric",
        metric: "requests.rate",
        aggregation: "avg",
        groupBy: "region",
        chart: "area",
      },
    },
  ],
};

interface UIState {
  theme: Theme;
  timeRange: TimeRange;
  savedQueries: SavedQuery[];
  queryHistory: string[];
  tourDone: boolean;
  tourOpen: boolean;
  dashboards: Dashboard[];
  activeDashboardId: string;
  logDensity: "compact" | "comfortable";

  setTheme: (t: Theme) => void;
  setTimeRange: (r: TimeRange) => void;
  saveQuery: (name: string, query: string) => void;
  deleteSavedQuery: (id: string) => void;
  pushHistory: (q: string) => void;
  clearHistory: () => void;
  setTour: (open: boolean, done?: boolean) => void;
  setLogDensity: (d: "compact" | "comfortable") => void;

  addDashboard: (name: string) => string;
  renameDashboard: (id: string, name: string) => void;
  deleteDashboard: (id: string) => void;
  setActiveDashboard: (id: string) => void;
  addWidget: (dashboardId: string, widget: Omit<Widget, "id">) => void;
  updateWidget: (dashboardId: string, widgetId: string, patch: Partial<Widget>) => void;
  removeWidget: (dashboardId: string, widgetId: string) => void;
  reorderWidgets: (dashboardId: string, ids: string[]) => void;
  resetPreferences: () => void;
}

const initial = {
  theme: "light" as Theme,
  timeRange: { kind: "relative", value: "1h" } as TimeRange,
  savedQueries: [
    {
      id: "sq1",
      name: "Checkout errors by status",
      query: "service:checkout level:error | count by status | last 15m",
      createdAt: 0,
    },
    {
      id: "sq2",
      name: "Payments p95, 5m buckets",
      query: "metric:latency.p95 service:payments | timeseries 5m | last 6h",
      createdAt: 0,
    },
  ] as SavedQuery[],
  queryHistory: [] as string[],
  tourDone: false,
  tourOpen: false,
  dashboards: [DEFAULT_DASHBOARD],
  activeDashboardId: "default",
  logDensity: "compact" as const,
};

const mapDash = (s: UIState, id: string, fn: (d: Dashboard) => Dashboard) => ({
  dashboards: s.dashboards.map((d) => (d.id === id ? fn(d) : d)),
});

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      ...initial,
      setTheme: (theme) => set({ theme }),
      setTimeRange: (timeRange) => set({ timeRange }),
      saveQuery: (name, query) =>
        set((s) => ({
          savedQueries: [{ id: uid(), name, query, createdAt: Date.now() }, ...s.savedQueries],
        })),
      deleteSavedQuery: (id) =>
        set((s) => ({ savedQueries: s.savedQueries.filter((q) => q.id !== id) })),
      pushHistory: (q) =>
        set((s) => ({ queryHistory: [q, ...s.queryHistory.filter((x) => x !== q)].slice(0, 30) })),
      clearHistory: () => set({ queryHistory: [] }),
      setTour: (tourOpen, done) =>
        set({ tourOpen, ...(done !== undefined ? { tourDone: done } : {}) }),
      setLogDensity: (logDensity) => set({ logDensity }),

      addDashboard: (name) => {
        const id = uid();
        set((s) => ({
          dashboards: [...s.dashboards, { id, name, widgets: [] }],
          activeDashboardId: id,
        }));
        return id;
      },
      renameDashboard: (id, name) => set((s) => mapDash(s, id, (d) => ({ ...d, name }))),
      deleteDashboard: (id) =>
        set((s) => {
          const dashboards = s.dashboards.filter((d) => d.id !== id);
          return {
            dashboards: dashboards.length ? dashboards : [{ ...DEFAULT_DASHBOARD }],
            activeDashboardId: dashboards[0]?.id ?? "default",
          };
        }),
      setActiveDashboard: (activeDashboardId) => set({ activeDashboardId }),
      addWidget: (dashboardId, widget) =>
        set((s) =>
          mapDash(
            s,
            get().dashboards.some((d) => d.id === dashboardId) ? dashboardId : s.dashboards[0].id,
            (d) => ({ ...d, widgets: [...d.widgets, { ...widget, id: uid() }] }),
          ),
        ),
      updateWidget: (dashboardId, widgetId, patch) =>
        set((s) =>
          mapDash(s, dashboardId, (d) => ({
            ...d,
            widgets: d.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)),
          })),
        ),
      removeWidget: (dashboardId, widgetId) =>
        set((s) =>
          mapDash(s, dashboardId, (d) => ({
            ...d,
            widgets: d.widgets.filter((w) => w.id !== widgetId),
          })),
        ),
      reorderWidgets: (dashboardId, ids) =>
        set((s) =>
          mapDash(s, dashboardId, (d) => ({
            ...d,
            widgets: ids.map((id) => d.widgets.find((w) => w.id === id)!).filter(Boolean),
          })),
        ),
      resetPreferences: () => set({ ...initial, tourDone: true }),
    }),
    {
      name: "vigil.ui",
      // v2: the paper look became the default; move everyone off the old dark default once.
      version: 2,
      migrate: (state, version) =>
        (version < 2 ? { ...(state as object), theme: "light" } : state) as UIState,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ tourOpen: _t, ...rest }) => rest,
    },
  ),
);
