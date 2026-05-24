import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const BASE = '/api'

// ── Token accessor ─────────────────────────────────────────────────────────
// useApi.ts cannot call useAuth() (hooks only in components), so we expose a
// module-level setter that AuthProvider calls after every token update.
let _getToken: (() => string | null) = () => null
export function setApiTokenAccessor(fn: () => string | null) { _getToken = fn }

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = _getToken()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
}

// On 401, dispatch a custom event so AuthGate can redirect to login
function handle401() {
  window.dispatchEvent(new Event('auth:unauthorized'))
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: authHeaders(), credentials: 'include' })
  if (res.status === 401) { handle401(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'POST', headers: authHeaders(), credentials: 'include' })
  if (res.status === 401) { handle401(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (res.status === 401) { handle401(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (res.status === 401) { handle401(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'DELETE', headers: authHeaders(), credentials: 'include' })
  if (res.status === 401) { handle401(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(BASE + path, { method: 'POST', headers: authHeaders(), credentials: 'include', body: formData })
  if (res.status === 401) { handle401(); throw new Error('Unauthorized') }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail || `API error: ${res.status}`)
  }
  return res.json()
}

export interface Summary {
  mf_invested: number
  mf_now: number
  mf_returns: number
  mf_pct: number
  sto_invested: number
  sto_now: number
  sto_returns: number
  sto_pct: number
  total_invested: number
  total_now: number
  total_returns: number
  total_pct: number
  appreciation_x: number
}

export interface Stock {
  Ticker: string
  Qty: number
  Purchase_cost: number
  LTP: number
  Value_now: number
  Value_at_cost: number
  Returns: number
  Returns_pct: number
}

export interface MutualFund {
  Fund_Name: string
  Units: number
  Purchase_NAV: number
  Current_NAV: number
  Value_at_cost: number
  Value_now: number
  AMFI_CODE: number
  Returns: number
  Returns_pct: number
  Category: string
  Purchase_Date?: string
}

export interface MFCategory {
  Category: string
  Value_at_cost: number
  Value_now: number
  Returns: number
  Returns_pct: number
}

export interface TimelineItem {
  year: string
  invested: number
  value_now: number
  gains: number
}
export interface MonthlyItem {
  month: string
  amount: number
}
export interface Snapshot {
  year: number
  month: number
  label: string
  total_invested: number
  total_value: number
  mf_invested: number
  mf_value: number
  stock_invested: number
  stock_value: number
}

export interface TickerItem {
  label: string
  value: number
  change: number
}
export interface NiftyPoint {
  date: string
  close: number
}

export const useSummary = () => useQuery({ queryKey: ['summary'], queryFn: () => get<Summary>('/summary') })
export const useStocks = () => useQuery({ queryKey: ['stocks'], queryFn: () => get<Stock[]>('/stocks') })
export const useStocksRajesh = () =>
  useQuery({ queryKey: ['stocks-user1'], queryFn: () => get<Stock[]>('/stocks/user1') })
export const useStocksSandhya = () =>
  useQuery({ queryKey: ['stocks-user2'], queryFn: () => get<Stock[]>('/stocks/user2') })
export const useMutualFunds = () => useQuery({ queryKey: ['mf'], queryFn: () => get<MutualFund[]>('/mutual-funds') })
export const useMFRajesh = () =>
  useQuery({ queryKey: ['mf-user1'], queryFn: () => get<MutualFund[]>('/mutual-funds/user1') })
export const useMFSandhya = () =>
  useQuery({ queryKey: ['mf-user2'], queryFn: () => get<MutualFund[]>('/mutual-funds/user2') })
export const useMFCategories = () =>
  useQuery({ queryKey: ['mf-cats'], queryFn: () => get<MFCategory[]>('/mutual-funds/categories') })
export const useTimeline = () =>
  useQuery({ queryKey: ['timeline'], queryFn: () => get<TimelineItem[]>('/analytics/timeline') })
export const useMonthly = () =>
  useQuery({ queryKey: ['monthly'], queryFn: () => get<MonthlyItem[]>('/analytics/monthly') })
export const useSnapshots = () =>
  useQuery({ queryKey: ['snapshots'], queryFn: () => get<Snapshot[]>('/analytics/snapshots') })
export const useMarketTicker = () =>
  useQuery({ queryKey: ['ticker'], queryFn: () => get<TickerItem[]>('/market/ticker'), staleTime: 60000 })
export const useNiftyHistory = () =>
  useQuery({ queryKey: ['nifty-hist'], queryFn: () => get<NiftyPoint[]>('/market/nifty-history'), staleTime: 60000 })

interface RefreshResponse {
  status: string
  updated: (string | number)[]
}
interface SnapshotResponse {
  status: string
  message: string
}

export function useRefreshNAV(callbacks?: { onSuccess?: () => void; onError?: () => void }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post<RefreshResponse>('/refresh/nav'),
    onSuccess: () => { qc.invalidateQueries(); callbacks?.onSuccess?.() },
    onError: () => callbacks?.onError?.(),
  })
}

export function useRefreshStocks(callbacks?: { onSuccess?: () => void; onError?: () => void }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post<RefreshResponse>('/refresh/stocks'),
    onSuccess: () => { qc.invalidateQueries(); callbacks?.onSuccess?.() },
    onError: () => callbacks?.onError?.(),
  })
}

export function useSaveSnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post<SnapshotResponse>('/analytics/snapshots'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })
}

// ── AMFI Lookup ─────────────────────────────────────────────────────────────

export interface AMFILookup {
  AMFI_CODE: number
  Fund_Name: string
  Fund_House: string
  Current_NAV: number
  NAV_Date: string
}

export function useAMFILookup() {
  return useMutation({
    mutationFn: (code: number) => get<AMFILookup>(`/amfi-lookup/${code}`),
  })
}

// ── ADMIN: Mutual Fund CRUD ─────────────────────────────────────────────────

export interface AdminMFRow {
  rowid: number
  Fund_House: string
  Fund_Name: string
  Folio_Number: string
  AMFI_CODE: number | null
  Units: number
  Purchase_NAV: string
  Purchase_Date: string
  Current_NAV: number
  Value_at_cost: number
  Value_now: number
}

export interface MFFormData {
  owner: string
  Fund_House: string
  Fund_Name: string
  Folio_Number: string
  AMFI_CODE: number | null
  Units: number
  Purchase_NAV: string
  Purchase_Date: string
  Current_NAV: number
  Value_at_cost: number
  Value_now: number
}

export const useAdminMF = (owner: string) =>
  useQuery({
    queryKey: ['admin-mf', owner],
    queryFn: () => get<AdminMFRow[]>(`/admin/mf/${owner}`),
    enabled: !!owner,
  })

export function useAdminCreateMF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MFFormData) => postJSON<{ status: string; rowid: number }>('/admin/mf', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-mf'] }),
  })
}

export function useAdminUpdateMF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, rowid, data }: { owner: string; rowid: number; data: MFFormData }) =>
      putJSON<{ status: string }>(`/admin/mf/${owner}/${rowid}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-mf'] }),
  })
}

export function useAdminDeleteMF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, rowid }: { owner: string; rowid: number }) =>
      del<{ status: string }>(`/admin/mf/${owner}/${rowid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-mf'] }),
  })
}

// ── ADMIN: Stocks Upload ────────────────────────────────────────────────────

export function useUploadStocks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, file }: { owner: string; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      return postFormData<{ status: string; rows: number; message: string }>(`/admin/upload-stocks/${owner}`, fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocks'] })
      qc.invalidateQueries({ queryKey: ['stocks-rajesh'] })
      qc.invalidateQueries({ queryKey: ['stocks-sandhya'] })
    },
  })
}
