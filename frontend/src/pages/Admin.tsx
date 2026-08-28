import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useAdminMF,
  useAdminCreateMF,
  useAdminUpdateMF,
  useAdminDeleteMF,
  useAdminPF,
  useAdminCreatePF,
  useAdminUpdatePF,
  useAdminDeletePF,
  usePFConfig,
  usePFImportPreview,
  usePFImport,
  usePFBulkImport,
  useAdminPFAccounts,
  useAdminSetPFAccount,
  useAdminDeletePFAccount,
  useUploadStocks,
  useAMFILookup,
  putJSON,
  type AdminMFRow,
  type MFFormData,
  type AdminPFRow,
  type PFFormData,
  type PFConfig,
  type PFImportRow,
  type PFImportMeta,
  type PFBulkResult,
  type PFAccount,
} from '../hooks/useApi'
import { PageHeader, Card, Spinner, Btn } from '../components/UI'
import { formatINR } from '../utils/format'
import { cn } from '../utils/format'
import { IconSearch, IconPlus, IconPencil, IconTrash, IconUpload, IconX, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useUsers } from '../hooks/useUsers'

type Owner = string

function getInitialOwnerKey(): Owner {
  const stored = (() => { try { const s = localStorage.getItem('portfolio-users'); return s ? JSON.parse(s) : null } catch { return null } })()
  return stored?.[0]?.key ?? 'user1'
}

const EMPTY_FORM: MFFormData = {
  owner: getInitialOwnerKey(),
  Fund_House: '',
  Fund_Name: '',
  Folio_Number: '',
  AMFI_CODE: null,
  Units: 0,
  Purchase_NAV: '',
  Purchase_Date: new Date().toISOString().slice(0, 10),
  Current_NAV: 0,
  Value_at_cost: 0,
  Value_now: 0,
}

// ── MF CRUD Section ─────────────────────────────────────────────────────────

function MFAdmin() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AdminMFRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<MFFormData>(EMPTY_FORM)
  const [expanded, setExpanded] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const { users } = useUsers()
  // Only first 2 users have backend support
  const ownerUsers = users.slice(0, 2)
  const [owner, setOwner] = useState<Owner>(() => ownerUsers[0]?.key ?? 'user1')

  const { data: rows, isLoading } = useAdminMF(owner)
  const createMut = useAdminCreateMF()
  const updateMut = useAdminUpdateMF()
  const deleteMut = useAdminDeleteMF()
  const amfiLookup = useAMFILookup()

  const handleLookup = async () => {
    if (!form.AMFI_CODE) return
    try {
      const result = await amfiLookup.mutateAsync(form.AMFI_CODE)
      const existingFolio = (rows || []).find((r) => r.AMFI_CODE === form.AMFI_CODE)?.Folio_Number || ''
      setForm((f) => ({
        ...f,
        Fund_Name: result.Fund_Name,
        Fund_House: result.Fund_House,
        Current_NAV: result.Current_NAV,
        Folio_Number: f.Folio_Number || existingFolio,
      }))
    } catch {
      // error handled by mutation state
    }
  }

  const filtered = (rows || []).filter(
    (r) =>
      (r.Fund_Name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.Fund_House || '').toLowerCase().includes(search.toLowerCase()),
  )

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, owner })
    setCreating(true)
  }

  const openEdit = (row: AdminMFRow) => {
    setCreating(false)
    setEditing(row)
    setForm({
      owner,
      Fund_House: row.Fund_House || '',
      Fund_Name: row.Fund_Name || '',
      Folio_Number: row.Folio_Number || '',
      AMFI_CODE: row.AMFI_CODE,
      Units: row.Units || 0,
      Purchase_NAV: row.Purchase_NAV || '',
      Purchase_Date: (row.Purchase_Date || '').slice(0, 10),
      Current_NAV: row.Current_NAV || 0,
      Value_at_cost: row.Value_at_cost || 0,
      Value_now: row.Value_now || 0,
    })
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }

  const handleSave = async () => {
    if (!form.Fund_Name.trim()) return
    const purchaseNav = parseFloat(form.Purchase_NAV)
    // Only recompute the invested amount when Purchase_NAV is a real number —
    // a blank/non-numeric NAV must not silently zero a stored Value_at_cost.
    const valueAtCost = Number.isFinite(purchaseNav) && purchaseNav > 0
      ? Math.round(form.Units * purchaseNav * 100) / 100
      : (editing ? editing.Value_at_cost : 0)
    const data: MFFormData = {
      ...form,
      Value_at_cost: valueAtCost,
      Value_now: Math.round(form.Units * form.Current_NAV * 100) / 100,
    }
    if (editing) {
      await updateMut.mutateAsync({ owner, rowid: editing.rowid, data })
    } else {
      await createMut.mutateAsync(data)
    }
    closeForm()
  }

  const handleDelete = async (rowid: number) => {
    if (!confirm('Delete this mutual fund entry?')) return
    await deleteMut.mutateAsync({ owner, rowid })
  }

  const setField = (key: keyof MFFormData, value: string | number | null) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isSaving = createMut.isPending || updateMut.isPending

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors rounded-xl"
      >
        <span className="text-sm font-semibold text-foreground tracking-tight">Mutual Funds — CRUD</span>
        {expanded ? <IconChevronDown size={16} className="text-muted-foreground" /> : <IconChevronRight size={16} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-border">
      {/* Owner tabs */}
      <div className="flex items-center gap-4 mb-4 mt-4">
        <div className="flex gap-2">
          {ownerUsers.map((u) => (
            <button
              key={u.key}
              onClick={() => {
                setOwner(u.key as Owner)
                closeForm()
              }}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium border transition-all capitalize',
                owner === u.key
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {u.name}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fund name or house…"
            className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
        >
          <IconPlus size={14} /> Add Fund
        </button>
      </div>

      {/* Inline form */}
      {(creating || editing) && (
        <div ref={formRef} className="mb-4 p-4 bg-muted/50 border border-border rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-foreground text-sm font-semibold">{editing ? 'Edit Fund' : 'New Fund'}</h4>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <IconX size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-zinc-500 text-xs mb-1">AMFI Code</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={form.AMFI_CODE ?? ''}
                  onChange={(e) => setField('AMFI_CODE', e.target.value ? Number(e.target.value) : null)}
                  placeholder="e.g. 119551"
                  className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleLookup}
                  disabled={!form.AMFI_CODE || amfiLookup.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {amfiLookup.isPending ? '…' : 'Lookup'}
                </button>
              </div>
              {amfiLookup.isError && (
                <p className="text-rose-400 text-xs mt-1">Not found — check the AMFI code</p>
              )}
            </div>
            <FormInput label="Fund Name" value={form.Fund_Name} onChange={(v) => setField('Fund_Name', v)} />
            <FormInput label="Fund House" value={form.Fund_House} onChange={(v) => setField('Fund_House', v)} />
            <FormInput label="Folio Number" value={form.Folio_Number} onChange={(v) => setField('Folio_Number', v)} />
            <FormInput
              label="Units"
              value={form.Units}
              onChange={(v) => setField('Units', Number(v) || 0)}
              type="number"
            />
            <FormInput label="Purchase NAV" value={form.Purchase_NAV} onChange={(v) => setField('Purchase_NAV', v)} />
            <FormInput
              label="Purchase Date"
              value={form.Purchase_Date}
              onChange={(v) => setField('Purchase_Date', v)}
              type="date"
            />
            <FormInput
              label="Current NAV"
              value={form.Current_NAV}
              onChange={(v) => setField('Current_NAV', Number(v) || 0)}
              type="number"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Btn onClick={handleSave} loading={isSaving} variant="primary">
              {editing ? 'Update' : 'Create'}
            </Btn>
            <Btn onClick={closeForm}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <Th>#</Th>
                <Th>Fund Name</Th>
                <Th>Folio</Th>
                <Th>AMFI</Th>
                <Th align="right">Units</Th>
                <Th>Purchase Date</Th>
                <Th align="right">Invested</Th>
                <Th align="right">Current</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.rowid} className="border-b border-border hover:bg-muted/40 transition-colors">
                  <td className="py-2.5 px-3 text-muted-foreground text-xs font-mono">{i + 1}</td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-medium max-w-[220px] truncate">
                    {r.Fund_Name}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs font-mono">{r.Folio_Number}</td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs font-mono">{r.AMFI_CODE}</td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-mono text-right">
                    {r.Units?.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs">
                    {r.Purchase_Date ? new Date(r.Purchase_Date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-mono text-right">
                    {formatINR(r.Value_at_cost)}
                  </td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-mono text-right">
                    {formatINR(r.Value_now)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-all"
                        title="Edit"
                      >
                        <IconPencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(r.rowid)}
                        disabled={deleteMut.isPending}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-muted transition-all"
                        title="Delete"
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground text-sm">
                    No funds found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
        </div>
      )}
    </div>
  )
}

// ── Stocks Upload Section ───────────────────────────────────────────────────

function StocksUpload() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const uploadMut = useUploadStocks()
  const { users } = useUsers()
  const ownerUsers = users.slice(0, 2)
  const [stockOwner, setStockOwner] = useState<Owner>(() => ownerUsers[0]?.key ?? 'user1')

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return
    setMessage(null)
    try {
      const res = await uploadMut.mutateAsync({ owner: stockOwner, file: selectedFile })
      setMessage({ text: res.message, ok: true })
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Upload failed', ok: false })
    }
  }, [selectedFile, stockOwner, uploadMut])

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors rounded-xl"
      >
        <span className="text-sm font-semibold text-foreground tracking-tight">Stocks — Upload Excel / CSV</span>
        {expanded ? <IconChevronDown size={16} className="text-muted-foreground" /> : <IconChevronRight size={16} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-border">
      <p className="text-muted-foreground text-sm mb-4 mt-4">
        Upload your broker&apos;s holdings export (<span className="text-foreground">.csv</span> or{' '}
        <span className="text-foreground">.xlsx</span>). Expected columns:{' '}
        <code className="text-amber-600 dark:text-amber-400">Instrument</code>, <code className="text-amber-600 dark:text-amber-400">Qty</code>,{' '}
        <code className="text-amber-600 dark:text-amber-400">Avg.Cost</code>, plus optional{' '}
        <code className="text-muted-foreground">LTP</code>, <code className="text-muted-foreground">Invested</code>,{' '}
        <code className="text-muted-foreground">Current Value</code>.
        {' '}Columns like P&amp;L, Net Change, Day Change are ignored. This <span className="text-rose-600 dark:text-rose-400">replaces</span> all existing stock data for the selected owner.
      </p>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-zinc-500 text-sm">Upload for:</span>
        {ownerUsers.map((u) => (
          <button
            key={u.key}
            onClick={() => setStockOwner(u.key as Owner)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium border transition-all capitalize',
              stockOwner === u.key
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {u.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            setSelectedFile(e.target.files?.[0] || null)
            setMessage(null)
          }}
          className="block text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-border file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/70 file:transition-all file:cursor-pointer"
        />
        <Btn onClick={handleUpload} loading={uploadMut.isPending} variant="primary">
          <IconUpload size={14} />
          Upload & Replace
        </Btn>
      </div>

      {selectedFile && (
        <p className="mt-2 text-muted-foreground text-xs">
          Selected: <span className="text-foreground">{selectedFile.name}</span> (
          {(selectedFile.size / 1024).toFixed(1)} KB)
        </p>
      )}

      {message && (
        <div
          className={cn(
            'mt-3 px-4 py-2.5 rounded-lg border text-sm',
            message.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-400'
              : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-400',
          )}
        >
          {message.text}
        </div>
      )}
        </div>
      )}
    </div>
  )
}

// ── PF CRUD Section ─────────────────────────────────────────────────────────

const EMPTY_PF_FORM: PFFormData = {
  owner: getInitialOwnerKey(),
  account: '',
  employee_contrib: 0,
  employer_contrib: 0,
  interest: 0,
  entry_date: new Date().toISOString().slice(0, 7),
  notes: '',
}

function PFConfigSection({ owner }: { owner: string }) {
  const qc = useQueryClient()
  const { data: config } = usePFConfig(owner)
  const [form, setForm] = useState<PFConfig>({ owner, UAN: '', initial_balance: 0, initial_month: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (config) setForm(config)
  }, [config])

  const handleSave = async () => {
    setMessage(null)
    setSaving(true)
    try {
      const res = await putJSON<{ status: string }>(`/admin/pf-config/${owner}`, form)
      if (res.status === 'ok') {
        setMessage({ text: 'Configuration saved', ok: true })
        qc.invalidateQueries({ queryKey: ['pf-config'] })
      } else {
        setMessage({ text: 'Unexpected response', ok: false })
      }
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      console.error('PF config save error:', e)
      setMessage({ text: e instanceof Error ? e.message : 'Save failed', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const setField = (key: keyof PFConfig, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="mb-6 p-4 bg-muted/30 border border-border rounded-xl">
      <h4 className="text-foreground text-sm font-semibold mb-3">Configuration</h4>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FormInput label="UAN" value={form.UAN} onChange={(v) => setField('UAN', v)} placeholder="e.g. UAN123456789" />
        <FormInput label="Starting Balance (₹)" value={form.initial_balance} onChange={(v) => setField('initial_balance', Number(v) || 0)} type="number" />
        <FormInput label="Starting Month (YYYY-MM)" value={form.initial_month} onChange={(v) => setField('initial_month', v)} placeholder="e.g. 2026-07" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Btn onClick={handleSave} loading={saving} variant="primary">Save Config</Btn>
        {message && (
          <span className={cn('text-sm', message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{message.text}</span>
        )}
      </div>
    </div>
  )
}

function PFAccountsSection({ owner }: { owner: string }) {
  const qc = useQueryClient()
  const { data: accounts, isLoading } = useAdminPFAccounts(owner)
  const [editing, setEditing] = useState<PFAccount | null>(null)
  const [form, setForm] = useState<PFAccount>({
    user: owner, account: '', establishment: '', opening_balance: 0, opening_month: '', UAN: '',
  })
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const setAcctMut = useAdminSetPFAccount()
  const delAcctMut = useAdminDeletePFAccount()

  useEffect(() => {
    if (editing) setForm({ ...editing })
    else setForm({ user: owner, account: '', establishment: '', opening_balance: 0, opening_month: '', UAN: '' })
  }, [editing, owner])

  const setField = (key: keyof PFAccount, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    setMessage(null)
    try {
      await setAcctMut.mutateAsync({ owner, data: form })
      setMessage({ text: 'Account saved', ok: true })
      setEditing(null)
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Save failed', ok: false })
    }
  }

  const handleDelete = async (account: string) => {
    if (!confirm(`Delete PF account ${account}?`)) return
    try {
      await delAcctMut.mutateAsync({ owner, account })
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Delete failed', ok: false })
    }
  }

  return (
    <div className="mb-6 p-4 bg-muted/30 border border-border rounded-xl">
      <h4 className="text-foreground text-sm font-semibold mb-1">Accounts &amp; Opening Balances</h4>
      <p className="text-muted-foreground text-sm mb-3">
        Each EPFO account number gets its own opening balance (e.g. ₹5,00,102 for the pre-2009 balance).
      </p>

      {isLoading ? <Spinner /> : (
        <div className="space-y-2 mb-4">
          {(accounts || []).length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts configured. Add one below or import a passbook.</p>
          )}
          {accounts?.map((a) => (
            <div key={a.account} className="flex items-center gap-3 flex-wrap border border-border rounded-lg px-3 py-2 bg-card">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-foreground truncate">{a.account}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {a.establishment || 'No establishment'}
                  {a.opening_month ? ` · opening ${formatINR(a.opening_balance)} from ${a.opening_month}` : ''}
                  {a.UAN ? ` · UAN ${a.UAN}` : ''}
                </div>
              </div>
              <button onClick={() => setEditing(a)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-all" title="Edit">
                <IconPencil size={13} />
              </button>
              <button onClick={() => handleDelete(a.account)} disabled={delAcctMut.isPending} className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-muted transition-all" title="Delete">
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <FormInput label="Account Number" value={form.account} onChange={(v) => setField('account', v)} placeholder="e.g. BGBNG00258970000000456" />
          <FormInput label="Establishment" value={form.establishment} onChange={(v) => setField('establishment', v)} placeholder="e.g. Juniper Networks" />
          <FormInput label="Opening Balance (₹)" value={form.opening_balance} onChange={(v) => setField('opening_balance', Number(v) || 0)} type="number" />
          <FormInput label="Opening Month (YYYY-MM)" value={form.opening_month} onChange={(v) => setField('opening_month', v)} placeholder="e.g. 2009-03" />
          <FormInput label="UAN" value={form.UAN} onChange={(v) => setField('UAN', v)} placeholder="e.g. 100296804732" />
        </div>
        <div className="flex items-center gap-3">
          <Btn onClick={handleSave} loading={setAcctMut.isPending} variant="primary">
            {editing ? 'Update Account' : 'Add Account'}
          </Btn>
          {editing && <Btn onClick={() => setEditing(null)}>Cancel</Btn>}
          {message && (
            <span className={cn('text-sm', message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{message.text}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function PFImportSection({ owner }: { owner: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const bulkRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [bulkFiles, setBulkFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<PFImportRow[] | null>(null)
  const [previewMeta, setPreviewMeta] = useState<PFImportMeta | null>(null)
  const [bulkResults, setBulkResults] = useState<PFBulkResult[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const previewMut = usePFImportPreview()
  const importMut = usePFImport()
  const bulkMut = usePFBulkImport()

  const reset = () => {
    setFile(null)
    setBulkFiles([])
    setPreview(null)
    setPreviewMeta(null)
    setBulkResults(null)
    setWarnings([])
    setMessage(null)
    if (fileRef.current) fileRef.current.value = ''
    if (bulkRef.current) bulkRef.current.value = ''
  }

  const handleFile = (f: File | null) => {
    setFile(f)
    setPreview(null)
    setPreviewMeta(null)
    setWarnings([])
    setMessage(null)
  }

  const handleBulkFiles = (files: File[]) => {
    setBulkFiles(files)
    setBulkResults(null)
    setMessage(null)
  }

  const handlePreview = async () => {
    if (!file) return
    setMessage(null)
    try {
      const res = await previewMut.mutateAsync({ owner, file })
      setPreview(res.rows)
      setPreviewMeta(res.meta)
      setWarnings(res.warnings || [])
      if (res.count === 0) {
        setMessage({ text: 'No entries found in this PDF. Check the format.', ok: false })
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Parse failed', ok: false })
    }
  }

  const handleImport = async () => {
    if (!file) return
    setMessage(null)
    try {
      const res = await importMut.mutateAsync({ owner, file })
      setMessage({
        text: `Imported ${res.inserted} new, updated ${res.updated} existing entries${res.warnings?.length ? ` (${res.warnings.length} warnings)` : ''}`,
        ok: true,
      })
      setPreview(null)
      setPreviewMeta(null)
      setWarnings(res.warnings || [])
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Import failed', ok: false })
    }
  }

  const handleBulkImport = async () => {
    if (!bulkFiles.length) return
    setMessage(null)
    try {
      const res = await bulkMut.mutateAsync({ owner, files: bulkFiles })
      setBulkResults(res.results)
      const ok = res.results.filter((r) => r.status === 'ok')
      const err = res.results.filter((r) => r.status !== 'ok')
      setMessage({
        text: `Bulk import done: ${ok.length} file(s) ok (${ok.reduce((s, r) => s + (r.inserted || 0), 0)} new, ${ok.reduce((s, r) => s + (r.updated || 0), 0)} updated)${err.length ? `, ${err.length} failed` : ''}`,
        ok: err.length === 0,
      })
      if (bulkRef.current) bulkRef.current.value = ''
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Bulk import failed', ok: false })
    }
  }

  return (
    <div className="mb-6 p-4 bg-muted/30 border border-border rounded-xl">
      <h4 className="text-foreground text-sm font-semibold mb-3">Import Passbook (PDF)</h4>
      <p className="text-muted-foreground text-sm mb-3">
        Upload one EPFO Member Passbook PDF at a time, or bulk-import the whole folder. Entries are
        tracked per account number, so the Juniper (2009–2021) and Unisys (2018–) passbooks never
        overwrite each other. Re-uploading the same passbook is safe.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
          className="block text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-border file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/70 file:transition-all file:cursor-pointer"
        />
        {file && (
          <>
            <Btn onClick={handlePreview} loading={previewMut.isPending}>
              Parse &amp; Preview
            </Btn>
            <Btn onClick={handleImport} loading={importMut.isPending} variant="primary">
              <IconUpload size={14} />
              Import {preview ? `${preview.length} Entries` : 'Entries'}
            </Btn>
            <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-center gap-3 flex-wrap">
        <input
          ref={bulkRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={(e) => handleBulkFiles(Array.from(e.target.files || []))}
          className="block text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-border file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/70 file:transition-all file:cursor-pointer"
        />
        {bulkFiles.length > 0 && (
          <>
            <Btn onClick={handleBulkImport} loading={bulkMut.isPending} variant="primary">
              <IconUpload size={14} />
              Bulk Import {bulkFiles.length} File{bulkFiles.length > 1 ? 's' : ''}
            </Btn>
            <span className="text-sm text-muted-foreground">{bulkFiles.map((f) => f.name).join(', ')}</span>
            <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </>
        )}
      </div>

      {bulkResults && bulkResults.length > 0 && (
        <div className="mt-4 overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <Th>File</Th>
                <Th>Status</Th>
                <Th>Account</Th>
                <Th align="right">Inserted</Th>
                <Th align="right">Updated</Th>
                <Th align="right">Warnings</Th>
              </tr>
            </thead>
            <tbody>
              {bulkResults.map((r, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/40">
                  <td className="py-2 px-3 text-foreground text-xs font-mono">{r.filename}</td>
                  <td className="py-2 px-3 text-xs font-medium">
                    {r.status === 'ok'
                      ? <span className="text-emerald-600 dark:text-emerald-400">ok</span>
                      : <span className="text-rose-600 dark:text-rose-400">{r.message || 'error'}</span>}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground text-xs font-mono">{r.account || '—'}</td>
                  <td className="py-2 px-3 text-foreground text-xs font-mono text-right">{r.inserted ?? 0}</td>
                  <td className="py-2 px-3 text-foreground text-xs font-mono text-right">{r.updated ?? 0}</td>
                  <td className="py-2 px-3 text-foreground text-xs font-mono text-right">{r.warnings?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="mt-4 overflow-x-auto border border-border rounded-lg">
          <div className="px-3 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground">
            {previewMeta?.account && <span className="font-mono text-foreground">{previewMeta.account}</span>}
            {previewMeta?.establishment && <span> · {previewMeta.establishment}</span>}
            {previewMeta?.UAN && <span> · UAN {previewMeta.UAN}</span>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <Th>#</Th>
                <Th>Month</Th>
                <Th align="right">Employee</Th>
                <Th align="right">Employer</Th>
                <Th align="right">Interest</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className={cn('border-b border-border hover:bg-muted/40', r.interest > 0 && 'bg-indigo-50 dark:bg-indigo-950/40')}>
                  <td className="py-2 px-3 text-muted-foreground text-xs font-mono">{i + 1}</td>
                  <td className="py-2 px-3 text-foreground text-xs font-medium">{r.entry_date}</td>
                  <td className="py-2 px-3 text-foreground text-xs font-mono text-right">{formatINR(r.employee_contrib)}</td>
                  <td className="py-2 px-3 text-foreground text-xs font-mono text-right">{formatINR(r.employer_contrib)}</td>
                  <td className="py-2 px-3 text-foreground text-xs font-mono text-right">{formatINR(r.interest)}</td>
                  <td className="py-2 px-3 text-muted-foreground text-xs">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400 text-xs space-y-1">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {message && (
        <div className={cn(
          'mt-3 px-4 py-2.5 rounded-lg border text-sm',
          message.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-400'
            : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-400',
        )}>
          {message.text}
        </div>
      )}
    </div>
  )
}

function PFCrud() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AdminPFRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<PFFormData>(EMPTY_PF_FORM)
  const [expanded, setExpanded] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const { users } = useUsers()
  const ownerUsers = users.slice(0, 2)
  const [owner, setOwner] = useState<Owner>(() => ownerUsers[0]?.key ?? 'user1')

  const { data: rows, isLoading } = useAdminPF(owner)
  const createMut = useAdminCreatePF()
  const updateMut = useAdminUpdatePF()
  const deleteMut = useAdminDeletePF()

  const filtered = (rows || []).filter(
    (r) => (r.entry_date || '').includes(search),
  )

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_PF_FORM, owner })
    setCreating(true)
  }

  const openEdit = (row: AdminPFRow) => {
    setCreating(false)
    setEditing(row)
    setForm({
      owner,
      account: row.account || '',
      employee_contrib: row.employee_contrib || 0,
      employer_contrib: row.employer_contrib || 0,
      interest: row.interest || 0,
      entry_date: (row.entry_date || '').slice(0, 7),
      notes: row.notes || '',
    })
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }

  const handleSave = async () => {
    if (!form.entry_date.trim()) return
    const data: PFFormData = { ...form }
    if (editing) {
      await updateMut.mutateAsync({ owner, rowid: editing.rowid, data })
    } else {
      await createMut.mutateAsync(data)
    }
    closeForm()
  }

  const handleDelete = async (rowid: number) => {
    if (!confirm('Delete this PF entry?')) return
    await deleteMut.mutateAsync({ owner, rowid })
  }

  const setField = (key: keyof PFFormData, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isSaving = createMut.isPending || updateMut.isPending

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors rounded-xl"
      >
        <span className="text-sm font-semibold text-foreground tracking-tight">PF (EPF) — Passbook Entries</span>
        {expanded ? <IconChevronDown size={16} className="text-muted-foreground" /> : <IconChevronRight size={16} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-border">
      <PFConfigSection owner={owner} />
      <PFAccountsSection owner={owner} />
      <PFImportSection owner={owner} />
      <div className="flex items-center gap-4 mb-4">
        <div className="flex gap-2">
          {ownerUsers.map((u) => (
            <button
              key={u.key}
              onClick={() => { setOwner(u.key as Owner); closeForm() }}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium border transition-all capitalize',
                owner === u.key
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {u.name}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search month…"
            className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
        >
          <IconPlus size={14} /> Add Entry
        </button>
      </div>

      {(creating || editing) && (
        <div ref={formRef} className="mb-4 p-4 bg-muted/50 border border-border rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-foreground text-sm font-semibold">{editing ? 'Edit PF Entry' : 'New PF Entry'}</h4>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <IconX size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <FormInput label="Month (YYYY-MM)" value={form.entry_date} onChange={(v) => setField('entry_date', v)} placeholder="e.g. 2026-07" />
            <FormInput label="Account Number" value={form.account} onChange={(v) => setField('account', v)} placeholder="e.g. BGBNG00258970000000456" />
            <FormInput label="Employee Contribution" value={form.employee_contrib} onChange={(v) => setField('employee_contrib', Number(v) || 0)} type="number" />
            <FormInput label="Employer Contribution" value={form.employer_contrib} onChange={(v) => setField('employer_contrib', Number(v) || 0)} type="number" />
            <FormInput label="Interest" value={form.interest} onChange={(v) => setField('interest', Number(v) || 0)} type="number" />
            <FormInput label="Notes" value={form.notes} onChange={(v) => setField('notes', v)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Btn onClick={handleSave} loading={isSaving} variant="primary">
              {editing ? 'Update' : 'Create'}
            </Btn>
            <Btn onClick={closeForm}>Cancel</Btn>
          </div>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <Th>#</Th>
                <Th>Month</Th>
                <Th>Account</Th>
                <Th align="right">Employee</Th>
                <Th align="right">Employer</Th>
                <Th align="right">Interest</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.rowid} className="border-b border-border hover:bg-muted/40 transition-colors">
                  <td className="py-2.5 px-3 text-muted-foreground text-xs font-mono">{i + 1}</td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-medium">{r.entry_date}</td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs font-mono truncate max-w-[180px]">{r.account || '—'}</td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-mono text-right">{formatINR(r.employee_contrib)}</td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-mono text-right">{formatINR(r.employer_contrib)}</td>
                  <td className="py-2.5 px-3 text-foreground text-xs font-mono text-right">{formatINR(r.interest)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-all" title="Edit">
                        <IconPencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(r.rowid)} disabled={deleteMut.isPending} className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-muted transition-all" title="Delete">
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">No PF entries found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
        </div>
      )}
    </div>
  )
}

// ── Form Helpers ────────────────────────────────────────────────────────────

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-muted-foreground text-xs mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'py-2.5 px-3 text-xs font-semibold text-muted-foreground tracking-wider uppercase',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function Admin() {
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" subtitle="Manage mutual funds, EPF passbook, and upload stock data" />
      <MFAdmin />
      <PFCrud />
      <StocksUpload />
    </div>
  )
}



