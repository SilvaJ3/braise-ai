import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ConfigEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Deux variables sont indispensables AU BUILD. Sans elles, `src/lib/supabase.ts` lève à l'import :
// Rollup considère alors tout ce qui en dépend comme mort et retire l'application ENTIÈRE du
// bundle. Le build « réussit » et produit un paquet d'environ 265 Ko sans une seule ligne de
// l'application — c'est ce qui a fait chercher un bug Node/Vite inexistant sur le VPS (constat du
// 04/10 au matin, reproduit en clone neuf). Un build rouge vaut mieux qu'un dist/ sans application.
export const VARIABLES_BUILD_REQUISES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const

export function variablesBuildManquantes(env: Record<string, string | undefined>): string[] {
  return VARIABLES_BUILD_REQUISES.filter((nom) => !env[nom])
}

export default defineConfig(({ command, mode }: ConfigEnv) => {
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
    const manquantes = variablesBuildManquantes(env)
    if (manquantes.length > 0) {
      throw new Error(
        `Build interrompu : ${manquantes.join(', ')} manquant(s). ` +
          "Sans elles le bundle est produit SANS le code de l'application. " +
          "Renseigner ces valeurs dans .env.local (voir .env.example) ou dans l'environnement du build.",
      )
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: "Braaise — l'assistant de l'atelier",
          short_name: 'Braaise',
          description: "Braaise — l'assistant de l'atelier : dépôts, commandes, planning",
          lang: 'fr',
          theme_color: '#b5451b',
          background_color: '#fdf6ee',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        devOptions: { enabled: true, type: 'module' },
      }),
    ],
  }
})
