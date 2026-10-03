import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure', timezoneId: 'Asia/Kolkata', locale: 'en-IN' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_GOOGLE_CLIENT_ID: 'e2e-test-client.apps.googleusercontent.com' },
  },
});
