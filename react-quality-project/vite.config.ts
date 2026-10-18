import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    include: [
      "src/App.test.tsx",
      "src/domain/schemas.test.ts",
      "src/data/provider.test.ts",
      "src/state/dashboardReducer.test.ts",
      "src/components/**/*.test.tsx",
    ],
  },
});
