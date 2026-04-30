import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { 
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"]
        }
      },
    },
  ],
  // webServer: [
  //   {
  //     command: "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000",
  //     cwd: "../backend",
  //     url: "http://127.0.0.1:8000/health",
  //     reuseExistingServer: true,
  //     timeout: 120_000,
  //   },
  //   {
  //     command: "NODE_OPTIONS=--max-old-space-size=1536 npm run dev -- --port 3000",
  //     cwd: "..",
  //     url: "http://127.0.0.1:3000",
  //     reuseExistingServer: true,
  //     timeout: 180_000,
  //   },
  // ],
});
