import { defineConfig } from "vitest/config";

// Unit tests run in a plain Node environment and do NOT load the Remix Vite
// plugin (which is only for the app build). Keep unit tests fast and isolated.
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
