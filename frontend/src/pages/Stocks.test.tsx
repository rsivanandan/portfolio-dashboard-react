import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Stocks from '../pages/Stocks'
import { renderWithProviders, mockFetch } from '../test/helpers'

const ALL_STOCKS = [
  { Ticker: 'INFY', Qty: 10, Purchase_cost: 1500, LTP: 1600, Value_now: 16000, Value_at_cost: 15000, Returns: 1000, Returns_pct: 6.67 },
  { Ticker: 'TCS', Qty: 5, Purchase_cost: 3500, LTP: 3700, Value_now: 18500, Value_at_cost: 17500, Returns: 1000, Returns_pct: 5.71 },
]

const RAJESH_STOCKS = [ALL_STOCKS[0]]
const SANDHYA_STOCKS = [ALL_STOCKS[1]]

describe('Stocks Page', () => {
  let cleanup: () => void

  beforeEach(() => {
    cleanup = mockFetch({
      '/api/stocks/rajesh': RAJESH_STOCKS,
      '/api/stocks/sandhya': SANDHYA_STOCKS,
      '/api/stocks': ALL_STOCKS,
    })
  })

  afterEach(() => cleanup())

  it('renders page header', () => {
    renderWithProviders(<Stocks />)
    expect(screen.getByText('Stocks & Smallcase')).toBeInTheDocument()
  })

  it('shows tab switcher with All/Rajesh/Sandhya', () => {
    renderWithProviders(<Stocks />)
    expect(screen.getByText('All Stocks')).toBeInTheDocument()
    expect(screen.getByText('Rajesh')).toBeInTheDocument()
    expect(screen.getByText('Sandhya')).toBeInTheDocument()
  })

  it('loads and shows all stocks by default', async () => {
    renderWithProviders(<Stocks />)
    await waitFor(() => {
      expect(screen.getByText('INFY')).toBeInTheDocument()
      expect(screen.getByText('TCS')).toBeInTheDocument()
    })
  })

  it('switches to Rajesh tab and shows only Rajesh stocks', async () => {
    renderWithProviders(<Stocks />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('INFY')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Rajesh'))

    await waitFor(() => {
      expect(screen.getByText('INFY')).toBeInTheDocument()
      expect(screen.queryByText('TCS')).not.toBeInTheDocument()
    })
  })

  it('switches to Sandhya tab and shows only Sandhya stocks', async () => {
    renderWithProviders(<Stocks />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('TCS')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Sandhya'))

    await waitFor(() => {
      expect(screen.getByText('TCS')).toBeInTheDocument()
      expect(screen.queryByText('INFY')).not.toBeInTheDocument()
    })
  })

  it('shows search input', () => {
    renderWithProviders(<Stocks />)
    expect(screen.getByPlaceholderText('Search ticker…')).toBeInTheDocument()
  })

  it('filters stocks by search', async () => {
    renderWithProviders(<Stocks />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('INFY')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('Search ticker…'), 'TCS')

    await waitFor(() => {
      expect(screen.getByText('TCS')).toBeInTheDocument()
      expect(screen.queryByText('INFY')).not.toBeInTheDocument()
    })
  })

  it('shows stat cards', async () => {
    renderWithProviders(<Stocks />)
    await waitFor(() => {
      expect(screen.getByText('Total Invested')).toBeInTheDocument()
      expect(screen.getByText('Total Returns')).toBeInTheDocument()
    })
  })
})
