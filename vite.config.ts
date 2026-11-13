import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  server: { port: 8080 },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  plugins: [
    tsConfigPaths(),
    // Route the bundled server entry through src/server.ts (our SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    // Nitro produces the deployable Node server in .output/ — only needed for builds.
    command === "build" && nitro(),
    viteReact(),
    tailwindcss(),
  ],
}));
