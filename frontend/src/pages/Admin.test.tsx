import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Admin from '../pages/Admin'
import { renderWithProviders, mockFetch } from '../test/helpers'

const SEED_MF_ROWS = [
  {
    rowid: 1,
    Fund_House: 'HDFC',
    Fund_Name: 'HDFC Mid-Cap',
    Folio_Number: '1234',
    AMFI_CODE: 100123,
    Units: 50,
    Purchase_NAV: '25.5',
    Purchase_Date: '2024-01-01',
    Current_NAV: 30,
    Value_at_cost: 1275,
    Value_now: 1500,
  },
]

describe('Admin Page', () => {
  let cleanup: () => void

  beforeEach(() => {
    cleanup = mockFetch({
      '/api/admin/mf/rajesh': SEED_MF_ROWS,
      '/api/admin/mf/sandhya': [],
      '/api/admin/mf': { status: 'ok', rowid: 99 },
    })
  })

  afterEach(() => cleanup())

  it('renders page header', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Manage mutual funds and upload stock data')).toBeInTheDocument()
  })

  it('renders MF CRUD section with title', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByText('Mutual Funds — CRUD')).toBeInTheDocument()
  })

  it('renders Stocks upload section', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByText('Stocks — Upload Excel / CSV')).toBeInTheDocument()
  })

  it('shows MF rows after loading', async () => {
    renderWithProviders(<Admin />)
    await waitFor(() => {
      expect(screen.getByText('HDFC Mid-Cap')).toBeInTheDocument()
    })
  })

  it('shows owner tabs (rajesh/sandhya)', async () => {
    renderWithProviders(<Admin />)
    const buttons = screen.getAllByRole('button')
    const rajesh = buttons.find((b) => b.textContent === 'rajesh')
    const sandhya = buttons.find((b) => b.textContent === 'sandhya')
    expect(rajesh).toBeInTheDocument()
    expect(sandhya).toBeInTheDocument()
  })

  it('switches to sandhya owner tab', async () => {
    renderWithProviders(<Admin />)
    const user = userEvent.setup()

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('HDFC Mid-Cap')).toBeInTheDocument()
    })

    // Find the sandhya button in the MF section (first occurrence)
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent === 'sandhya')
    await user.click(buttons[0])

    // After switch, HDFC Mid-Cap should disappear (sandhya has empty list)
    await waitFor(() => {
      expect(screen.queryByText('HDFC Mid-Cap')).not.toBeInTheDocument()
    })
  })

  it('shows "Add Fund" button', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByText('Add Fund')).toBeInTheDocument()
  })

  it('opens create form when Add Fund is clicked', async () => {
    renderWithProviders(<Admin />)
    const user = userEvent.setup()

    await user.click(screen.getByText('Add Fund'))

    await waitFor(() => {
      expect(screen.getByText('New Fund')).toBeInTheDocument()
      expect(screen.getByText('Create')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })
  })

  it('shows search input', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByPlaceholderText('Search fund name or house…')).toBeInTheDocument()
  })

  it('filters MF rows by search', async () => {
    renderWithProviders(<Admin />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('HDFC Mid-Cap')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search fund name or house…')
    await user.type(searchInput, 'xyz')

    await waitFor(() => {
      expect(screen.queryByText('HDFC Mid-Cap')).not.toBeInTheDocument()
      expect(screen.getByText('No funds found')).toBeInTheDocument()
    })
  })

  it('shows MF table headers after loading', async () => {
    renderWithProviders(<Admin />)
    await waitFor(() => {
      // Check that table headers exist via column header role
      const headers = screen.getAllByRole('columnheader')
      const headerTexts = headers.map((h) => h.textContent?.trim())
      expect(headerTexts).toContain('Folio')
      expect(headerTexts).toContain('AMFI')
      expect(headerTexts).toContain('Units')
      expect(headerTexts).toContain('Actions')
    })
  })
})

describe('Stocks Upload Section', () => {
  let cleanup: () => void

  beforeEach(() => {
    cleanup = mockFetch({
      '/api/admin/mf/rajesh': [],
      '/api/admin/mf/sandhya': [],
    })
  })

  afterEach(() => cleanup())

  it('shows file input accepting csv/xlsx', async () => {
    renderWithProviders(<Admin />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    expect(fileInput.getAttribute('accept')).toBe('.csv,.xlsx,.xls')
  })

  it('shows owner picker for upload', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByText('Upload for:')).toBeInTheDocument()
  })

  it('shows upload button', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByText('Upload & Replace')).toBeInTheDocument()
  })

  it('shows expected columns help text', async () => {
    renderWithProviders(<Admin />)
    expect(screen.getByText('Instrument')).toBeInTheDocument()
    expect(screen.getByText('Qty')).toBeInTheDocument()
    expect(screen.getByText('Avg.Cost')).toBeInTheDocument()
  })
})
