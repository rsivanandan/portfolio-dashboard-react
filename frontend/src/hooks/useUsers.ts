import { useState, useEffect } from 'react'
import { get, putJSON } from './useApi'

export type PortfolioUser = { id: number; name: string; key: string }

// Backend owner keys are positional and fixed (backend tables/routes use these exact strings)
const BACKEND_KEYS = ['user1', 'user2']

export const DEFAULT_USERS: PortfolioUser[] = [
  { id: 1, name: 'User 1', key: 'user1' },
  { id: 2, name: 'User 2', key: 'user2' },
]

export const STORAGE_KEY = 'portfolio-users'
const EVENT_NAME = 'portfolio-users-updated'

function normalize(users: PortfolioUser[]): PortfolioUser[] {
  // A user's key is its permanent link to backend data (User1_MF, user1 PF, …).
  // Keep existing keys; only assign a free backend key to users that lack one.
  // Positional re-keying would re-attach a surviving user's name to the
  // DELETED user's holdings.
  const taken = new Set(users.map((u) => u.key).filter(Boolean))
  const free = BACKEND_KEYS.filter((k) => !taken.has(k))
  return users.map((u) => ({ ...u, key: u.key || free.shift() || '' }))
}

export function getStoredUsers(): PortfolioUser[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (!s) return DEFAULT_USERS
    const parsed = JSON.parse(s) as PortfolioUser[]
    return normalize(parsed)
  } catch {
    return DEFAULT_USERS
  }
}

function cacheUsersLocal(users: PortfolioUser[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(users))) } catch { /* ignore */ }
}

/** Load display names from the backend DB (survives browser/origin changes). */
export async function fetchServerUsers(): Promise<PortfolioUser[] | null> {
  try {
    const rows = await get<{ owner: string; name: string }[]>('/user-names')
    if (!Array.isArray(rows) || rows.length === 0) return null
    return normalize(rows.map((r, i) => ({ id: i + 1, name: r.name, key: r.owner })))
  } catch {
    return null
  }
}

export async function saveUsers(users: PortfolioUser[]): Promise<void> {
  const normalized = normalize(users)
  cacheUsersLocal(normalized)
  try {
    await putJSON<{ status: string }>('/user-names', {
      users: normalized.map(u => ({ owner: u.key, name: u.name })),
    })
  } catch {
    // Backend unreachable — local copy still applies for this session.
  }
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function useUsers(): { users: PortfolioUser[]; loading: boolean } {
  const [users, setUsers] = useState<PortfolioUser[]>(getStoredUsers)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchServerUsers().then(server => {
      if (cancelled) return
      if (server) {
        setUsers(server)
        cacheUsersLocal(server)
      }
      setLoading(false)
    })
    const handler = () => setUsers(getStoredUsers())
    window.addEventListener(EVENT_NAME, handler)
    return () => {
      cancelled = true
      window.removeEventListener(EVENT_NAME, handler)
    }
  }, [])

  return { users, loading }
}
