import {
  Activity,
  BellRing,
  ChartLine,
  LayoutDashboard,
  Network,
  ScrollText,
  Settings,
  Terminal,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to:
    | "/"
    | "/logs"
    | "/metrics"
    | "/traces"
    | "/service-map"
    | "/alerts"
    | "/query"
    | "/dashboards"
    | "/settings";
  label: string;
  icon: LucideIcon;
  /** Second key of the "g <key>" go-to shortcut. */
  key: string;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: Activity, key: "o" },
  { to: "/logs", label: "Logs", icon: ScrollText, key: "l" },
  { to: "/metrics", label: "Metrics", icon: ChartLine, key: "m" },
  { to: "/traces", label: "Traces", icon: Waypoints, key: "t" },
  { to: "/service-map", label: "Service map", icon: Network, key: "s" },
  { to: "/alerts", label: "Alerts", icon: BellRing, key: "a" },
  { to: "/query", label: "Query console", icon: Terminal, key: "q" },
  { to: "/dashboards", label: "Dashboards", icon: LayoutDashboard, key: "d" },
  { to: "/settings", label: "Settings", icon: Settings, key: "," },
];

export const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: "Everywhere",
    items: [
      { keys: ["⌘", "K"], label: "Command palette" },
      { keys: ["/"], label: "Focus search on this page" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["Esc"], label: "Close panel or dialog" },
    ],
  },
  {
    group: "Lists",
    items: [
      { keys: ["j"], label: "Next item" },
      { keys: ["k"], label: "Previous item" },
      { keys: ["Enter"], label: "Open selected item" },
    ],
  },
  {
    group: "Go to",
    items: NAV.map((n) => ({ keys: ["g", n.key], label: n.label })),
  },
  {
    group: "Logs",
    items: [
      { keys: ["Space"], label: "Pause or resume the log tail" },
      { keys: ["e"], label: "Expand the selected log line" },
    ],
  },
];
