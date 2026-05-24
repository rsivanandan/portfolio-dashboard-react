import { useCallback, useRef, useState } from 'react'
import {
  useAdminMF,
  useAdminCreateMF,
  useAdminUpdateMF,
  useAdminDeleteMF,
  useUploadStocks,
  useAMFILookup,
  type AdminMFRow,
  type MFFormData,
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
    const purchaseNav = parseFloat(form.Purchase_NAV) || 0
    const data: MFFormData = {
      ...form,
      Value_at_cost: Math.round(form.Units * purchaseNav * 100) / 100,
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

// ── Form Helpers ────────────────────────────────────────────────────────────

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="block text-muted-foreground text-xs mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      <PageHeader title="Portfolio Management" subtitle="Manage mutual funds and upload stock data" />
      <MFAdmin />
      <StocksUpload />
    </div>
  )
}



