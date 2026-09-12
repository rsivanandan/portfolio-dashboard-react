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

export async function get<T>(path: string): Promise<T> {
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

export async function putJSON<T>(path: string, body: unknown): Promise<T> {
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
  pf_invested: number
  pf_now: number
  pf_returns: number
  pf_pct: number
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
  Previous_NAV?: number | null
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

export interface MFReturnRow {
  AMFI_CODE: number | null
  Fund_Name: string
  Category: string
  invested: number
  value_now: number
  r1y: number | null
  r2y: number | null
  r3y: number | null
  r5y: number | null
  r10y: number | null
}
export interface PFEntry {
  id: number
  owner?: string
  UAN: string
  account: string
  employee_contrib: number
  employer_contrib: number
  total_contrib: number
  interest: number
  running_balance: number
  entry_date: string
  notes: string
}

export interface AdminPFRow {
  rowid: number
  account: string
  employee_contrib: number
  employer_contrib: number
  interest: number
  entry_date: string
  notes: string
}

export interface PFFormData {
  owner: string
  account: string
  employee_contrib: number
  employer_contrib: number
  interest: number
  entry_date: string
  notes: string
}

export interface PFConfig {
  owner: string
  UAN: string
  initial_balance: number
  initial_month: string
}

export interface PFAccount {
  user: string
  account: string
  establishment: string
  opening_balance: number
  opening_month: string
  UAN: string
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
  pf_invested?: number
  pf_value?: number
}

export interface TickerItem {
  label: string
  value: number
  change: number
}
export interface NiftyPoint {
  date: string
  close: number
  /** Day-over-day % move; null for the oldest point in the window (no prior close). */
  pct_change: number | null
  /** % below the trailing 30-calendar-day high; 0 when this day IS the high. */
  pct_from_high: number | null
}

export const useSummary = () => useQuery({ queryKey: ['summary'], queryFn: () => get<Summary>('/summary') })
export const useStocks = () => useQuery({ queryKey: ['stocks'], queryFn: () => get<Stock[]>('/stocks') })
export const useStocksUser1 = () =>
  useQuery({ queryKey: ['stocks-user1'], queryFn: () => get<Stock[]>('/stocks/user1') })
export const useStocksUser2 = () =>
  useQuery({ queryKey: ['stocks-user2'], queryFn: () => get<Stock[]>('/stocks/user2') })
export const useMutualFunds = () => useQuery({ queryKey: ['mf'], queryFn: () => get<MutualFund[]>('/mutual-funds') })
export const useMFUser1 = () =>
  useQuery({ queryKey: ['mf-user1'], queryFn: () => get<MutualFund[]>('/mutual-funds/user1') })
export const useMFUser2 = () =>
  useQuery({ queryKey: ['mf-user2'], queryFn: () => get<MutualFund[]>('/mutual-funds/user2') })
export const useMFCategories = () =>
  useQuery({ queryKey: ['mf-cats'], queryFn: () => get<MFCategory[]>('/mutual-funds/categories') })
export const useMFReturns = (owner?: string) =>
  useQuery({
    queryKey: ['mf-returns', owner ?? 'all'],
    queryFn: () => get<MFReturnRow[]>(owner ? `/mutual-funds/returns/${owner}` : '/mutual-funds/returns'),
  })
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

export interface AssetPulseEntry {
  label: string
  /** % above (+) or below (-) the trailing 200-day average — how extended the price is vs its own recent trend. */
  pct_vs_200dma: number | null
  /** Plain % change over the last ~22 trading days. */
  pct_month: number | null
  /** Plain % change since the first trading day of the current calendar year. */
  pct_ytd: number | null
}
export type AssetKey = 'large' | 'mid' | 'small' | 'gold' | 'silver' | 'oil'
export type AssetPulseData = Partial<Record<AssetKey, AssetPulseEntry>>
export const useAssetPulse = () =>
  useQuery({
    queryKey: ['asset-pulse'],
    queryFn: () => get<AssetPulseData>('/market/asset-pulse'),
    staleTime: 60000,
  })

// Everything derived from PF rows / opening balances — admin edits must bust all of it
const PF_QUERY_KEYS = [['pf'], ['pf-user1'], ['pf-user2'], ['summary'], ['admin-pf']] as const
// Everything derived from MF rows — admin edits must bust all of it
const MF_QUERY_KEYS = [['mf'], ['mf-user1'], ['mf-user2'], ['mf-cats'], ['mf-returns'], ['summary'], ['admin-mf']] as const

function invalidateAll(qc: ReturnType<typeof useQueryClient>, keys: readonly (readonly string[])[]) {
  for (const key of keys) qc.invalidateQueries({ queryKey: key as unknown as string[] })
}

export const usePF = () => useQuery({ queryKey: ['pf'], queryFn: () => get<PFEntry[]>('/pf') })
export const usePFUser1 = () =>
  useQuery({ queryKey: ['pf-user1'], queryFn: () => get<PFEntry[]>('/pf/user1') })
export const usePFUser2 = () =>
  useQuery({ queryKey: ['pf-user2'], queryFn: () => get<PFEntry[]>('/pf/user2') })

export const useAdminPF = (owner: string) =>
  useQuery({
    queryKey: ['admin-pf', owner],
    queryFn: () => get<AdminPFRow[]>(`/admin/pf/${owner}`),
    enabled: !!owner,
  })

export function useAdminCreatePF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PFFormData) => postJSON<{ status: string; rowid: number }>('/admin/pf', data),
    onSuccess: () => invalidateAll(qc, PF_QUERY_KEYS),
  })
}

export function useAdminUpdatePF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, rowid, data }: { owner: string; rowid: number; data: PFFormData }) =>
      putJSON<{ status: string }>(`/admin/pf/${owner}/${rowid}`, data),
    onSuccess: () => invalidateAll(qc, PF_QUERY_KEYS),
  })
}

export function useAdminDeletePF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, rowid }: { owner: string; rowid: number }) =>
      del<{ status: string }>(`/admin/pf/${owner}/${rowid}`),
    onSuccess: () => invalidateAll(qc, PF_QUERY_KEYS),
  })
}

export const usePFConfig = (owner: string) =>
  useQuery({
    queryKey: ['pf-config', owner],
    queryFn: () => get<PFConfig>(`/admin/pf-config/${owner}`),
    enabled: !!owner,
  })

export function useUpdatePFConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, data }: { owner: string; data: PFConfig }) =>
      putJSON<{ status: string }>(`/admin/pf-config/${owner}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pf-config'] })
      invalidateAll(qc, PF_QUERY_KEYS)
    },
  })
}

// ── ADMIN: PF Accounts (per-account opening balance) ────────────────────────

export const useAdminPFAccounts = (owner: string) =>
  useQuery({
    queryKey: ['pf-accounts', owner],
    queryFn: () => get<PFAccount[]>(`/admin/pf-accounts/${owner}`),
    enabled: !!owner,
  })

export function useAdminSetPFAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, data }: { owner: string; data: PFAccount }) =>
      putJSON<{ status: string }>(`/admin/pf-accounts/${owner}`, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pf-accounts', vars.owner] })
      invalidateAll(qc, PF_QUERY_KEYS)
    },
  })
}

export function useAdminDeletePFAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, account }: { owner: string; account: string }) =>
      del<{ status: string }>(`/admin/pf-accounts/${owner}/${encodeURIComponent(account)}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pf-accounts', vars.owner] })
      invalidateAll(qc, PF_QUERY_KEYS)
    },
  })
}

// ── ADMIN: PF Passbook PDF Import ───────────────────────────────────────────

export interface PFImportRow {
  entry_date: string
  account: string
  employee_contrib: number
  employer_contrib: number
  interest: number
  notes: string
}

export interface PFImportMeta {
  account: string
  establishment: string
  UAN: string
  member_name: string
}

export interface PFImportPreview {
  status: string
  meta: PFImportMeta
  rows: PFImportRow[]
  warnings: string[]
  count: number
}

export interface PFImportResult {
  status: string
  meta: PFImportMeta
  inserted: number
  updated: number
  warnings: string[]
  count: number
}

export interface PFBulkResult {
  filename: string
  status: string
  account?: string
  inserted?: number
  updated?: number
  warnings?: string[]
  count?: number
  message?: string
}

export interface PFBulkImportResult {
  status: string
  results: PFBulkResult[]
}

function pfImportFormData(file: File): FormData {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

function pfBulkImportFormData(files: File[]): FormData {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  return fd
}

export function usePFImportPreview() {
  return useMutation({
    mutationFn: ({ owner, file }: { owner: string; file: File }) =>
      postFormData<PFImportPreview>(`/admin/pf-import/preview/${owner}`, pfImportFormData(file)),
  })
}

export function usePFImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, file }: { owner: string; file: File }) =>
      postFormData<PFImportResult>(`/admin/pf-import/${owner}`, pfImportFormData(file)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pf'] })
      qc.invalidateQueries({ queryKey: ['pf'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

export function usePFBulkImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, files }: { owner: string; files: File[] }) =>
      postFormData<PFBulkImportResult>(`/admin/pf-import/bulk/${owner}`, pfBulkImportFormData(files)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pf'] })
      qc.invalidateQueries({ queryKey: ['pf'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

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
    onSuccess: () => invalidateAll(qc, MF_QUERY_KEYS),
  })
}

export function useAdminUpdateMF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, rowid, data }: { owner: string; rowid: number; data: MFFormData }) =>
      putJSON<{ status: string }>(`/admin/mf/${owner}/${rowid}`, data),
    onSuccess: () => invalidateAll(qc, MF_QUERY_KEYS),
  })
}

export function useAdminDeleteMF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ owner, rowid }: { owner: string; rowid: number }) =>
      del<{ status: string }>(`/admin/mf/${owner}/${rowid}`),
    onSuccess: () => invalidateAll(qc, MF_QUERY_KEYS),
  })
}

// ── Retirement: 3-Bucket Strategy ───────────────────────────────────────────

export type BucketName = 'cash' | 'safety' | 'growth'

export interface RetirementConfig {
  swr_pct: number
  inflation_pct: number
  bucket1_years: number
  bucket2_years: number
  cash_amount: number
  refill_trigger_years: number
}

export interface RefillSignal {
  nifty_12m_pct: number | null
  market: 'up' | 'down' | null
  source: 'growth' | 'safety' | null
  trigger_years: number
  b1_years: number | null
  action_needed: boolean
  topup_amount: number
}

export interface BucketHolding {
  entity: 'mf' | 'stock' | 'pf'
  key: string
  name: string
  category: string
  value: number
  bucket: BucketName
}

export interface BucketSlice {
  entity: BucketHolding['entity'] | 'cash'
  key: string
  name: string
  amount: number
  partial: boolean
  /** The bucket this money was assigned to pour into first */
  priority: BucketName
}

export interface RetirementData {
  config: RetirementConfig
  holdings: BucketHolding[]
  buckets: Record<BucketName, { actual: number; target: number | null; slices: BucketSlice[]; years_covered: number | null }>
  corpus: number
  annual_affordable: number
  monthly_affordable: number
  refill: RefillSignal
}

export const useRetirement = () =>
  useQuery({ queryKey: ['retirement'], queryFn: () => get<RetirementData>('/retirement') })

export function useUpdateRetirementConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RetirementConfig) => putJSON<{ status: string }>('/retirement/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retirement'] }),
  })
}

export function useAssignBucket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { entity: string; key: string; bucket: BucketName }) =>
      putJSON<{ status: string }>('/retirement/assign', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retirement'] }),
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
      qc.invalidateQueries({ queryKey: ['stocks-user1'] })
      qc.invalidateQueries({ queryKey: ['stocks-user2'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

// ── AI: News briefing, portfolio insights, Q&A ─────────────────────────────

export interface AIStatus {
  ai_enabled: boolean
  model: string | null
}

export interface BriefingHeadline {
  title: string
  url: string
  source: string
  published: string | null
}

export interface BriefingItem {
  title: string
  link?: string
  takeaway: string
}

export interface Briefing {
  headlines: BriefingHeadline[]
  brief: string | null
  items: BriefingItem[]
  ai_enabled?: boolean
}

export interface InsightText {
  title: string
  detail: string
}

export interface AITopHolding {
  name: string
  value: number
  ret_pct: number
}

export interface AISummaryTotals {
  mf_invested: number
  mf_now: number
  stocks_invested: number
  stocks_now: number
  pf_invested: number
  pf_now: number
  total_invested: number
  total_now: number
}

export interface AIInsightsMetrics {
  as_of?: string
  totals: AISummaryTotals
  overall_return_pct: number
  mf_count: number
  stock_count: number
  top_funds: AITopHolding[]
  top_stocks: { ticker: string; value: number; ret_pct: number }[]
  biggest_gainers: { name: string; ret_pct: number }[]
  biggest_laggards: { name: string; ret_pct: number }[]
  stale_nav_count: number
  stale_nav_funds: string[]
  category_allocation: Record<string, number>
  top_holding_share_pct: number
}

export interface AIInsights {
  metrics: AIInsightsMetrics
  summary: string | null
  insights: InsightText[]
  risks: InsightText[]
  ai_enabled?: boolean
}

export const useAIStatus = () =>
  useQuery({ queryKey: ['ai-status'], queryFn: () => get<AIStatus>('/ai/status'), staleTime: 60000 })

export const useBriefing = () =>
  useQuery({
    queryKey: ['ai-briefing'],
    queryFn: () => get<Briefing>('/ai/briefing'),
    staleTime: 15 * 60 * 1000,
  })

export const useAIInsights = () =>
  useQuery({
    queryKey: ['ai-insights'],
    queryFn: () => get<AIInsights>('/ai/insights'),
    staleTime: 15 * 60 * 1000,
  })

export function useAskAI() {
  return useMutation({
    mutationFn: (question: string) =>
      postJSON<{ question: string; answer: string }>('/ai/ask', { question }),
  })
}

// ── AI: deep-dive, holding news, rebalance, tax, retirement, risk, scenario, report ──

export interface RebalancePlan {
  allocation: {
    equity_pct: number
    debt_pct: number
    pf_pct: number
    equity_inr: number
    debt_inr: number
    pf_inr: number
    stock_inr: number
  }
  category_concentration: {
    top_category: string | null
    top_category_value: number
    top_category_share_pct: number
  }
  mf_count: number
  stock_count: number
}

export interface NarrativeBlock {
  summary: string
  points?: string[]
}

export interface RebalanceResponse {
  plan: RebalancePlan
  narrative: NarrativeBlock | null
  ai_enabled: boolean
}

export interface TaxRow {
  name: string
  category: string
  gain: number
  held_years: number | null
  nature: string
  equity: boolean
}

export interface TaxResponse {
  rows: TaxRow[]
  summary: {
    total_unrealized_gain: number
    equity_ltcg_gain: number
    equity_ltcg_exemption_remaining: number
    equity_ltcg_vs_exemption_excess: number
    stcg_gain: number
    holding_count: number
  }
  as_of: string
  narrative: NarrativeBlock | null
  ai_enabled: boolean
}

export interface RetirementAIBucket {
  name: string
  actual: number
  target: number | null
  filled_pct: number | null
}

export interface RetirementAIResponse {
  readiness: 'on-track' | 'gap' | 'progress'
  buckets: RetirementAIBucket[]
  years_covered: { safety: number | null; growth: number | null }
  refill: {
    action_needed: boolean
    topup: number
    market: string | null
    nifty_12m_pct: number | null
  }
  narrative: NarrativeBlock | null
  ai_enabled: boolean
}

export interface RiskScore {
  factor: string
  weight: number
  note: string
}

export interface RiskResponse {
  portfolio_risk: number
  tier: 'low' | 'medium' | 'high'
  drivers: RiskScore[]
  top_holding_share_pct: number
  equity_share_pct: number
  underwater_count: number
  narrative: NarrativeBlock | null
  ai_enabled: boolean
}

export interface HoldingNewsMatch {
  title: string
  url: string
  source?: string
  published?: string | null
  related?: string
  matched_terms?: string[]
}

export interface HoldingNewsResponse {
  terms: { term: string; label: string; kind: string }[]
  matches: HoldingNewsMatch[]
  items: { title: string; link?: string; related?: string; matched_terms?: string[]; why?: string }[]
  ai_enabled: boolean
}

export interface DeepDiveResponse {
  metrics: Record<string, unknown> & {
    entity: string
    key: string
    name: string
    invested: number
    now: number
    ret_pct: number
    ret_abs: number
    category?: string
    peer_avg_ret_pct?: number | null
    vs_peer_pct?: number | null
  }
  summary?: string
  points?: string[]
  ai_enabled: boolean
}

export interface ScenarioResponse {
  sim: {
    assumption: string
    equity_exposure: number
    debt_exposure: number
    total_before: number
    delta_inr: number
    delta_pct: number
    total_after: number
  }
  summary: string | null
  points: string[]
  ai_enabled: boolean
}

export interface ReportResponse {
  as_of: string
  metrics: AIInsightsMetrics
  rebalance: RebalancePlan
  tax: Pick<TaxResponse, 'rows' | 'summary'>
  risk: { portfolio_risk: number; tier: string; drivers: RiskScore[] }
  stocks: Record<string, { Instrument: string; now: number; ret_pct: number }>
  narrative: NarrativeBlock | null
  ai_enabled: boolean
}

export const useHoldingDeepDive = () =>
  useMutation({
    mutationFn: ({ entity, key }: { entity: string; key: string }) =>
      get<DeepDiveResponse>(`/ai/holding/${entity}/${encodeURIComponent(key)}`),
  })

export const useHoldingNews = () =>
  useQuery({
    queryKey: ['ai-holding-news'],
    queryFn: () => get<HoldingNewsResponse>('/ai/holding-news'),
    staleTime: 15 * 60 * 1000,
  })

export const useRebalance = () =>
  useQuery({ queryKey: ['ai-rebalance'], queryFn: () => get<RebalanceResponse>('/ai/rebalance'), staleTime: 15 * 60 * 1000 })

export const useTax = () =>
  useQuery({ queryKey: ['ai-tax'], queryFn: () => get<TaxResponse>('/ai/tax'), staleTime: 15 * 60 * 1000 })

export const useRetirementAI = () =>
  useQuery({ queryKey: ['ai-retirement'], queryFn: () => get<RetirementAIResponse>('/ai/retirement'), staleTime: 15 * 60 * 1000 })

export const useRisk = () =>
  useQuery({ queryKey: ['ai-risk'], queryFn: () => get<RiskResponse>('/ai/risk'), staleTime: 15 * 60 * 1000 })

export const useReport = () =>
  useQuery({ queryKey: ['ai-report'], queryFn: () => get<ReportResponse>('/ai/report'), staleTime: 60 * 60 * 1000 })

export function useScenario() {
  return useMutation({
    mutationFn: (niftyChangePct: number) =>
      postJSON<ScenarioResponse>('/ai/scenario', { nifty_change_pct: niftyChangePct }),
  })
}
