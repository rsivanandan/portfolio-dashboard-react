import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, mockFetch } from '../test/helpers'
import Insights from './Insights'

// Smoke test for the AI tab consolidation: every AI component (briefing,
// insights, allocation/tax/risk, retirement check, holding news, ask
// assistant) must mount under one tab without throwing, with every
// /api/ai/* + supporting endpoint mocked. This does not require a live
// backend or login — it verifies the React tree actually renders.

const emptySummary = {
  mf_invested: 0, mf_now: 0, mf_returns: 0, mf_pct: 0,
  sto_invested: 0, sto_now: 0, sto_returns: 0, sto_pct: 0,
  pf_invested: 0, pf_now: 0, pf_returns: 0, pf_pct: 0,
  total_invested: 0, total_now: 0, total_returns: 0, total_pct: 0,
  appreciation_x: 0,
}

const routes: Record<string, unknown> = {
  '/api/summary': emptySummary,
  '/api/analytics/timeline': [],
  '/api/analytics/monthly': [],
  '/api/analytics/snapshots': [],
  '/api/mutual-funds': [],
  '/api/stocks': [],

  '/api/ai/status': { ai_enabled: false },
  '/api/ai/briefing': { brief: 'Markets steady today.', items: [], ai_enabled: false },
  '/api/ai/insights': {
    summary: 'Your portfolio looks fine.',
    insights: [],
    risks: [],
    ai_enabled: false,
    metrics: {
      totals: { total_invested: 0, total_now: 0 },
      overall_return_pct: 0,
      mf_count: 0,
      stock_count: 0,
      top_holding_share_pct: 0,
      stale_nav_count: 0,
      stale_nav_funds: [],
      biggest_laggards: [],
      biggest_gainers: [],
    },
  },
  '/api/ai/holding-news': { terms: [], matches: [], items: [], ai_enabled: false },
  '/api/ai/rebalance': {
    plan: {
      allocation: { equity_pct: 0, debt_pct: 0, pf_pct: 0, equity_inr: 0, debt_inr: 0, pf_inr: 0, stock_inr: 0 },
      category_concentration: { top_category: null, top_category_value: 0, top_category_share_pct: 0 },
      mf_count: 0, stock_count: 0,
    },
    narrative: null, ai_enabled: false,
  },
  '/api/ai/tax': {
    rows: [],
    summary: {
      total_unrealized_gain: 0, equity_ltcg_gain: 0, equity_ltcg_exemption_remaining: 0,
      equity_ltcg_vs_exemption_excess: 0, stcg_gain: 0, holding_count: 0,
    },
    as_of: '2026-09-12', narrative: null, ai_enabled: false,
  },
  '/api/ai/retirement': {
    readiness: 'progress', buckets: [], years_covered: { safety: null, growth: null },
    refill: { action_needed: false, topup: 0, market: null, nifty_12m_pct: null },
    narrative: null, ai_enabled: false,
  },
  '/api/ai/risk': {
    portfolio_risk: 0, tier: 'low', drivers: [], top_holding_share_pct: 0,
    equity_share_pct: 0, underwater_count: 0, narrative: null, ai_enabled: false,
  },
}

describe('Insights — AI tab', () => {
  it('renders every AI component when the AI tab is selected', async () => {
    const restore = mockFetch(routes)
    try {
      renderWithProviders(<Insights />)
      const user = userEvent.setup()

      await user.click(screen.getByRole('tab', { name: 'AI' }))

      // One card per AI component — proves each mounted without throwing.
      await waitFor(() => expect(screen.getByText('Today in Markets')).toBeInTheDocument())
      expect(screen.getByText('AI Portfolio Insights')).toBeInTheDocument()
      expect(screen.getByText('Allocation Check')).toBeInTheDocument()
      expect(screen.getByText('Tax Snapshot')).toBeInTheDocument()
      expect(screen.getByText('Portfolio Risk')).toBeInTheDocument()
      expect(screen.getByText('Retirement Check')).toBeInTheDocument()
      expect(screen.getByText('Holding News')).toBeInTheDocument()
      expect(screen.getByText('Ask Samridhi')).toBeInTheDocument()

      // Header buttons for the AI tab's tools.
      expect(screen.getByText('Scenario')).toBeInTheDocument()
      expect(screen.getByText('Report')).toBeInTheDocument()
    } finally {
      restore()
    }
  })

  it('does not render AI components on the Overview tab', async () => {
    const restore = mockFetch(routes)
    try {
      renderWithProviders(<Insights />)
      await waitFor(() => expect(screen.getAllByText(/Total Invested/i).length).toBeGreaterThan(0))
      expect(screen.queryByText('Today in Markets')).not.toBeInTheDocument()
      expect(screen.queryByText('Ask Samridhi')).not.toBeInTheDocument()
    } finally {
      restore()
    }
  })
})
