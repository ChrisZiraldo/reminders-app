import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['server/reminders/**/*.test.ts', 'reminders/client/**/*.test.tsx'] },
});
