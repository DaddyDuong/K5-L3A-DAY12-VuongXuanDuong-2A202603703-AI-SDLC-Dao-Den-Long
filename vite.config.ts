import { defineConfig } from "vite";
import { leaderboardApi } from "./src/app/server.js";

export default defineConfig({
  base: "./",
  build: { outDir: "dist-web" },
  test: { include: ["tests/**/*.test.ts"] },
  plugins: [
    {
      // `npm run dev` gets the same on-disk leaderboard API as `npm start` (Ticket-04 §3, P4-A16).
      name: "leaderboard-api",
      configureServer(server: { middlewares: { use: (path: string, fn: (req: never, res: never) => void) => void } }) {
        server.middlewares.use("/api/leaderboard", (req, res) => void leaderboardApi(req, res));
      },
    },
  ],
} as never);
