import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'supabase/functions/_shared/**/*.test.ts',
      // Le garde-fou d'environnement de build vit à la racine, à côté de vite.config.ts.
      'vite.config.test.ts',
    ],
    environment: 'node',
  },
})
