# Vigil

**Always watching. Rarely loud.** A calm, real-time observability console for logs, metrics, traces and alerts.

Built with [TanStack Start](https://tanstack.com/start) (React 19, SSR), Tailwind CSS v4, Radix UI primitives, TanStack Query and Recharts. Point it at your backend with `VITE_VIGIL_API_URL` / `VITE_VIGIL_WS_URL`; without them it runs on a built-in in-browser data source.

## Getting started

Requires **Node.js 22+**.

```sh
npm install
npm run dev
```

Open http://localhost:8080.

## Scripts

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload on port 8080                    |
| `npm run build`     | Production build into `.output/`                           |
| `npm start`         | Run the production build (`node .output/server/index.mjs`) |
| `npm run preview`   | Preview the production build via Vite                      |
| `npm test`          | Run the test suite (Vitest)                                |
| `npm run typecheck` | Type-check with `tsc`                                      |
| `npm run lint`      | ESLint + Prettier checks                                   |
| `npm run format`    | Auto-format the codebase                                   |

The production server listens on `PORT` (default `3000`).

## Project layout

```
src/
  api/          Data layer — `VigilClient` interface with mock and HTTP/WebSocket implementations
  components/   App shell, charts, logs, traces and shared UI (shadcn/Radix in components/ui)
  hooks/        Keyboard shortcuts and list navigation
  lib/          Formatting, error handling, VigilQL query parser
  routes/       File-based routes (TanStack Router) — `routeTree.gen.ts` is generated
  stores/       Zustand stores for UI preferences and live-stream state
  server.ts     SSR entry with an error-page fallback
```

## Features

- **Overview** — fleet health at a glance
- **Logs** — live-tailing, virtualised log stream with filters and JSON inspection
- **Traces** — trace list and waterfall detail view
- **Command palette** (`Ctrl/⌘ K`), keyboard shortcuts (`?`), guided tour
- **Incident banner** — active incidents surface across every page, one click to the error logs

See [roadmap.md](roadmap.md) for what's next.
