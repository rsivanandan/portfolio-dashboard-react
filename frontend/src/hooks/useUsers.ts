import { useState, useEffect } from 'react'

export type PortfolioUser = { id: number; name: string; key: string }

// Backend owner keys are positional and fixed (backend tables/routes use these exact strings)
const BACKEND_KEYS = ['user1', 'user2']

export const DEFAULT_USERS: PortfolioUser[] = [
  { id: 1, name: 'User 1', key: 'user1' },
  { id: 2, name: 'User 2', key: 'user2' },
]

const STORAGE_KEY = 'portfolio-users'
const EVENT_NAME = 'portfolio-users-updated'

export function getStoredUsers(): PortfolioUser[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (!s) return DEFAULT_USERS
    const parsed = JSON.parse(s) as PortfolioUser[]
    // Backend keys are enforced by position — only display names are configurable
    return parsed.map((u, i) => ({ ...u, key: BACKEND_KEYS[i] ?? u.key }))
  } catch {
    return DEFAULT_USERS
  }
}

export function saveUsers(users: PortfolioUser[]): void {
  const normalized = users.map((u, i) => ({ ...u, key: BACKEND_KEYS[i] ?? u.key }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function useUsers(): { users: PortfolioUser[] } {
  const [users, setUsers] = useState<PortfolioUser[]>(getStoredUsers)

  useEffect(() => {
    const handler = () => setUsers(getStoredUsers())
    window.addEventListener(EVENT_NAME, handler)
    return () => window.removeEventListener(EVENT_NAME, handler)
  }, [])

  return { users }
}
