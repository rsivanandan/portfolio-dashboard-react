/**
 * Shared test utilities: wrappers for React Query + Router providers, fetch mocking.
 */
import { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(ui: ReactNode, { route = '/' } = {}) {
  const qc = createTestQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * Helper to mock global fetch for a set of routes.
 *
 * ```ts
 * mockFetch({
 *   '/api/admin/mf/rajesh': [{ rowid: 1, Fund_Name: 'Test' }],
 * })
 * ```
 */
export function mockFetch(routes: Record<string, unknown>) {
  const original = globalThis.fetch
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    // fallback – return 404
    return new Response(JSON.stringify({ detail: 'not found' }), { status: 404 })
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}
