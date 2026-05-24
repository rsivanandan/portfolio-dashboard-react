import { useState, useEffect } from 'react'
import { PageHeader } from '../components/UI'
import { cn } from '../utils/format'
import { IconChevronDown, IconChevronRight, IconUser, IconMail, IconBell, IconShield, IconDatabase, IconWorld, IconPlus, IconTrash, IconLock, IconPencil, IconLogout, IconCircleCheck, IconCircleX, IconUsers } from '@tabler/icons-react'
import { saveUsers, getStoredUsers, DEFAULT_USERS, type PortfolioUser } from '../hooks/useUsers'
import { useAuth } from '../hooks/useAuth'

// ── Users Section ─────────────────────────────────────────────────────────────

const MAX_USERS = 4

function isDefaultUsers(users: PortfolioUser[]): boolean {
  return users.length === DEFAULT_USERS.length &&
    users.every((u, i) => u.name === DEFAULT_USERS[i].name)
}

function UsersSection() {
  const [users, setUsers] = useState<PortfolioUser[]>(() => getStoredUsers())
  const [multiView, setMultiView] = useState(true)
  const [saved, setSaved] = useState(false)
  // Locked if names have been customised (not the out-of-box defaults)
  const [locked, setLocked] = useState<boolean>(() => !isDefaultUsers(getStoredUsers()))
  const nextId = () => Math.max(0, ...users.map(u => u.id)) + 1

  const addUser = () => {
    if (users.length >= MAX_USERS) return
    const id = nextId()
    setUsers(u => [...u, { id, name: '', key: `user${id}` }])
  }

  const removeUser = (id: number) => {
    if (users.length <= 1) return
    setUsers(u => u.filter(x => x.id !== id))
  }

  const updateName = (id: number, name: string) =>
    setUsers(u => u.map(x => x.id === id ? { ...x, name } : x))

  const handleSave = () => {
    saveUsers(users)
    setSaved(true)
    setLocked(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mt-4 mb-1">
        Names entered here appear as tabs across Holdings and Portfolio Management. Up to {MAX_USERS} users supported.
      </p>

      {locked ? (
        // ── Locked view ────────────────────────────────────────────────────
        <div className="mt-3 space-y-2">
          {users.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 bg-muted/50 border border-border rounded-lg">
              <IconLock size={13} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold block">
                  {i === 0 ? 'Primary User' : `User ${i + 1}`}
                </span>
                <span className="text-sm font-medium text-foreground">{u.name || <span className="text-muted-foreground italic">unnamed</span>}</span>
              </div>
              <span className="text-xs text-primary/60 font-mono shrink-0">{u.key}</span>
            </div>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setLocked(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <IconPencil size={13} /> Edit Users
            </button>
            <button
              onClick={() => { const reset = DEFAULT_USERS; saveUsers(reset); setUsers(reset); setLocked(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 hover:border-rose-300 transition-all"
            >
              <IconTrash size={13} /> Reset to Defaults
            </button>
          </div>
        </div>
      ) : (
        // ── Edit view ──────────────────────────────────────────────────────
        <>
          <div className="mt-3 space-y-3">
            {users.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {i === 0 ? 'Primary User' : `User ${i + 1}`}
                    <span className="ml-2 text-primary/60 normal-case font-normal font-mono">({u.key})</span>
                  </label>
                  <input
                    type="text"
                    value={u.name}
                    onChange={e => updateName(u.id, e.target.value)}
                    placeholder={`Enter name for ${u.key}`}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {users.length > 1 && (
                  <button
                    onClick={() => removeUser(u.id)}
                    className="mt-5 p-2 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                    title="Remove user"
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {users.length < MAX_USERS && (
            <button
              onClick={addUser}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary hover:bg-muted transition-all"
            >
              <IconPlus size={13} /> Add User ({MAX_USERS - users.length} remaining)
            </button>
          )}

          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-foreground">Enable multi-user view</span>
            <button
              onClick={() => setMultiView(v => !v)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                multiView ? 'bg-primary' : 'bg-muted border border-border',
              )}
            >
              <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', multiView ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </div>

          <button
            onClick={handleSave}
            className={cn(
              'mt-5 px-4 py-2 text-sm font-semibold rounded-lg transition-all',
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground',
            )}
          >
            {saved ? '✓ Saved & Locked' : 'Save & Lock'}
          </button>
        </>
      )}
    </>
  )
}

// ── Account Access Section (admin-only) ──────────────────────────────────────

interface AppUser {
  id: number
  username: string
  email: string
  is_admin: boolean
  is_approved: boolean
  created_at: string
}

function AccountAccessSection() {
  const { getToken, user: currentUser } = useAuth()
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const token = getToken()
      const res = await fetch('/api/auth/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to load users')
      setAppUsers(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const doAction = async (endpoint: string, method = 'PUT') => {
    const token = getToken()
    await fetch(endpoint, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
    setActionMsg('Done')
    setTimeout(() => setActionMsg(''), 2000)
    fetchUsers()
  }

  if (!currentUser?.is_admin) return null

  return (
    <div className="mt-4 space-y-3">
      {error && <p className="text-rose-500 text-xs">{error}</p>}
      {actionMsg && <p className="text-emerald-600 dark:text-emerald-400 text-xs">{actionMsg}</p>}
      {loading && <p className="text-muted-foreground text-xs">Loading…</p>}
      {appUsers.map(u => (
        <div key={u.id} className="flex items-center gap-3 px-3 py-3 bg-muted/50 border border-border rounded-lg">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{u.username}</span>
              {u.is_admin && <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-semibold">Admin</span>}
              {!u.is_approved && <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 px-1.5 py-0.5 rounded font-semibold">Pending</span>}
            </div>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
          {u.id !== currentUser.id && (
            <div className="flex items-center gap-1.5 shrink-0">
              {!u.is_approved ? (
                <button
                  onClick={() => doAction(`/api/auth/users/${u.id}/approve`)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                >
                  <IconCircleCheck size={12} /> Approve
                </button>
              ) : (
                <button
                  onClick={() => doAction(`/api/auth/users/${u.id}/revoke`)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-muted border border-border text-muted-foreground hover:text-rose-500 hover:border-rose-400 transition-all"
                >
                  <IconCircleX size={12} /> Revoke
                </button>
              )}
              {!u.is_admin && (
                <button
                  onClick={() => doAction(`/api/auth/users/${u.id}/make-admin`)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-muted border border-border text-muted-foreground hover:text-primary hover:border-primary transition-all"
                >
                  Make Admin
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <Icon size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground tracking-tight">{title}</span>
        </div>
        {open
          ? <IconChevronDown size={16} className="text-muted-foreground" />
          : <IconChevronRight size={16} className="text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 mt-4">
      <label className="text-xs font-semibold text-foreground uppercase tracking-wider">{label}</label>
      {hint && <p className="text-xs text-muted-foreground mb-1">{hint}</p>}
      {children}
    </div>
  )
}

function TextInput({ placeholder, defaultValue, type = 'text' }: { placeholder?: string; defaultValue?: string; type?: string }) {
  return (
    <input
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

function Toggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked)
  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-sm text-foreground">{label}</span>
      <button
        onClick={() => setOn(v => !v)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
          on ? 'bg-primary' : 'bg-muted border border-border',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            on ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}

function SaveBtn() {
  return (
    <button className="mt-5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-all">
      Save Changes
    </button>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SystemAdmin() {
  const { user, logout } = useAuth()
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Admin" subtitle="System configuration and preferences" />
        <button
          onClick={() => logout()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-rose-500 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-all"
        >
          <IconLogout size={14} /> Sign out ({user?.username})
        </button>
      </div>

      {/* Account Access — admin only */}
      {user?.is_admin && (
        <Section title="Account Access" icon={IconUsers}>
          <p className="text-xs text-muted-foreground mt-4 mb-2">Manage who can access this dashboard. Approve pending signups or revoke access.</p>
          <AccountAccessSection />
        </Section>
      )}

      {/* Users */}
      <Section title="Users" icon={IconUser}>
        <UsersSection />
      </Section>

      {/* Email / Notifications */}
      <Section title="Email & Notifications" icon={IconMail}>
        <Field label="Email Address" hint="Used for daily NAV and portfolio alerts.">
          <TextInput type="email" placeholder="you@example.com" />
        </Field>
        <Toggle label="Daily portfolio summary email" />
        <Toggle label="Alert when NAV drops > 5% in a day" />
        <Toggle label="Alert on new MF purchase recorded" />
        <SaveBtn />
      </Section>

      {/* Alerts */}
      <Section title="Alerts & Thresholds" icon={IconBell}>
        <Field label="XIRR alert threshold (%)" hint="Get notified when portfolio XIRR falls below this value.">
          <TextInput type="number" defaultValue="10" />
        </Field>
        <Field label="Loss alert threshold (%)" hint="Alert when any holding is down more than this % from cost.">
          <TextInput type="number" defaultValue="15" />
        </Field>
        <Toggle label="Enable in-app notifications" defaultChecked={true} />
        <SaveBtn />
      </Section>

      {/* Security */}
      <Section title="Security" icon={IconShield}>
        <Field label="Current Password">
          <TextInput type="password" placeholder="••••••••" />
        </Field>
        <Field label="New Password">
          <TextInput type="password" placeholder="••••••••" />
        </Field>
        <Field label="Confirm New Password">
          <TextInput type="password" placeholder="••••••••" />
        </Field>
        <Toggle label="Enable two-factor authentication" />
        <SaveBtn />
      </Section>

      {/* Data */}
      <Section title="Data & Storage" icon={IconDatabase}>
        <Field label="Auto-refresh interval (minutes)" hint="How often the dashboard polls for new NAV data.">
          <TextInput type="number" defaultValue="30" />
        </Field>
        <Toggle label="Cache NAV data locally" defaultChecked={true} />
        <Toggle label="Keep snapshot history (last 365 days)" defaultChecked={true} />
        <SaveBtn />
      </Section>

      {/* Locale */}
      <Section title="Locale & Display" icon={IconWorld}>
        <Field label="Currency" hint="Primary currency for display.">
          <select className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="INR">INR — Indian Rupee (₹)</option>
            <option value="USD">USD — US Dollar ($)</option>
          </select>
        </Field>
        <Field label="Date Format">
          <select className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </select>
        </Field>
        <Toggle label="Show values in Lakhs (L) / Crores (Cr)" defaultChecked={true} />
        <SaveBtn />
      </Section>
    </div>
  )
}



