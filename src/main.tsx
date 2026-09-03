import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'
import { AuthProvider } from './lib/auth.tsx'
import { applyColors, loadColors } from './lib/theme.ts'

applyColors(loadColors())

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Pas de retry sur les erreurs d'autorisation / de validation : inutile et bruyant.
      retry: (count, error) => {
        const code = (error as { code?: string; status?: number })?.code
        const status = (error as { status?: number })?.status
        if (code === '42501' || code === 'PGRST301' || status === 401 || status === 403) return false
        return count < 2
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
