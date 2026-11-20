import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Frontend unit tests. Pure-utility tests (dates, csv) run in node; component
// tests run in jsdom. Nothing here talks to a backend.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    include: ["src/**/*.test.{js,jsx}"],
    // Windows EMFILE flake: transforming lucide-react's thousands of icon
    // modules in parallel workers exhausts file handles. Serialize the files.
    fileParallelism: false,
  },
});
