import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { mockFetch } from '../test/helpers'

// Minimal version of routing to test that lazy routes resolve
const Admin = lazy(() => import('../pages/Admin'))
const Retirement = lazy(() => import('../pages/Retirement'))

function TestApp({ route }: { route: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Suspense fallback={<div>Loading…</div>}>
          <Routes>
            <Route path="/admin" element={<Admin />} />
            <Route path="/retirement" element={<Retirement />} />
            <Route path="*" element={<div>Not Found</div>} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const emptyBucket = { actual: 0, target: 0, slices: [], years_covered: null }
const retirementMock = {
  config: { swr_pct: 4, inflation_pct: 6, bucket1_years: 3, bucket2_years: 5, cash_amount: 0 },
  holdings: [],
  buckets: {
    cash: emptyBucket,
    safety: emptyBucket,
    growth: { ...emptyBucket, target: null },
  },
  corpus: 0,
  annual_affordable: 0,
  monthly_affordable: 0,
}

describe('App Routing', () => {
  let cleanup: () => void

  beforeEach(() => {
    cleanup = mockFetch({
      '/api/admin/mf/user1': [],
      '/api/admin/mf/user2': [],
      '/api/admin/pf/user1': [],
      '/api/admin/pf/user2': [],
      '/api/admin/pf-config/user1': { user: 'user1', UAN: '', initial_balance: 0, initial_month: '' },
      '/api/admin/pf-config/user2': { user: 'user2', UAN: '', initial_balance: 0, initial_month: '' },
      '/api/market/ticker': [],
      '/api/retirement': retirementMock,
    })
  })

  afterEach(() => cleanup())

  it('/admin route loads Admin page', async () => {
    render(<TestApp route="/admin" />)
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })
  })

  it('/retirement route loads Retirement page', async () => {
    render(<TestApp route="/retirement" />)
    await waitFor(() => {
      expect(screen.getByText('Retirement Buckets')).toBeInTheDocument()
    })
  })

  it('unknown route shows Not Found', async () => {
    render(<TestApp route="/unknown" />)
    await waitFor(() => {
      expect(screen.getByText('Not Found')).toBeInTheDocument()
    })
  })
})
