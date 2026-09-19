import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'supabase/functions/_shared/**/*.test.ts'],
    environment: 'node',
  },
})
