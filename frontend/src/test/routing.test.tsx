import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { mockFetch } from '../test/helpers'

// Minimal version of routing to test that Admin route resolves
const Admin = lazy(() => import('../pages/Admin'))

function TestApp({ route }: { route: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Suspense fallback={<div>Loading…</div>}>
          <Routes>
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<div>Not Found</div>} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('App Routing', () => {
  let cleanup: () => void

  beforeEach(() => {
    cleanup = mockFetch({
      '/api/admin/mf/rajesh': [],
      '/api/admin/mf/sandhya': [],
      '/api/market/ticker': [],
    })
  })

  afterEach(() => cleanup())

  it('/admin route loads Admin page', async () => {
    render(<TestApp route="/admin" />)
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })
  })

  it('unknown route shows Not Found', async () => {
    render(<TestApp route="/unknown" />)
    await waitFor(() => {
      expect(screen.getByText('Not Found')).toBeInTheDocument()
    })
  })
})
