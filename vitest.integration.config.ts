import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const TEST_DATABASE_URL =
  'postgresql://notifier:notifier@localhost:5433/notifier_test';
const TEST_REDIS_URL = 'redis://localhost:6380';
const TEST_RABBITMQ_URL = 'amqp://localhost:5673';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    clearMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: TEST_REDIS_URL,
      RABBITMQ_URL: TEST_RABBITMQ_URL,
      APP_URL: 'http://localhost:3001',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_USER: 'test',
      SMTP_PASS: 'testpassword',
      SMTP_FROM: 'noreply@test.example.com',
      GITHUB_CACHE_TTL_SECONDS: '1',
    },
  },
});
