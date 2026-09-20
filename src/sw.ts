/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

precacheAndRoute(self.__WB_MANIFEST)

// Repli de navigation. La stratégie est injectManifest : vite-plugin-pwa n'ajoute pas de
// navigateFallback, donc sans cette route, ouvrir une route cliente (/atelier, /planning, un
// lien de notification) hors ligne échouait en erreur réseau alors que index.html est pourtant
// préchargé. On sert le shell de l'app, sauf pour l'API et Supabase, qui doivent échouer
// franchement s'ils ne sont pas joignables.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    // `/boutique/<jeton>` est une page statique a part, pas une route de l'app : elle doit
    // venir du reseau, sinon le shell de l'app s'affiche a la place de l'espace de la boutique.
    denylist: [/^\/api/, /supabase/, /^\/boutique/],
  }),
)
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

type PushPayload = { title?: string; body?: string; url?: string }

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Braaise', {
      body: data.body ?? '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const open = clients.find((c) => 'focus' in c) as WindowClient | undefined
      if (!open) return self.clients.openWindow(url)
      await open.focus()
      if ('navigate' in open && !open.url.endsWith(url)) {
        try {
          await open.navigate(url)
        } catch {
          /* navigation refusée (origine différente) : le focus suffit */
        }
      }
    }),
  )
})
