import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { setApiTokenAccessor } from './useApi'

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number
  username: string
  email?: string
  is_admin: boolean
  is_approved: boolean
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, email: string, password: string) => Promise<{ message: string; autoLoggedIn: boolean }>
  logout: () => Promise<void>
  getToken: () => string | null
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────────────────

// Access token lives only in memory — never in localStorage (XSS-safe)
// Refresh token is an httpOnly cookie managed by the browser automatically

const BASE = '/api'

async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include', // send refresh_token cookie
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail || `Request failed`)
  }
  return res.json()
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
  })
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Decode JWT payload without verifying signature (verification is backend's job)
  function tokenExpiresInMs(token: string): number {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.exp * 1000 - Date.now() - 60_000 // 60s buffer
    } catch {
      return 0
    }
  }

  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const ms = tokenExpiresInMs(token)
    if (ms <= 0) return
    refreshTimerRef.current = setTimeout(() => silentRefresh(), ms)
  }, [])

  const setAuth = useCallback((token: string, user: AuthUser) => {
    setState({ user, accessToken: token, isLoading: false })
    setApiTokenAccessor(() => token)
    scheduleRefresh(token)
  }, [scheduleRefresh])

  const clearAuth = useCallback(() => {
    setState({ user: null, accessToken: null, isLoading: false })
    setApiTokenAccessor(() => null)
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
  }, [])

  // Try to get a new access token using the httpOnly refresh cookie
  async function silentRefresh(): Promise<string | null> {
    try {
      const data = await apiPost<{ access_token: string; user: AuthUser }>(
        '/auth/refresh', {}
      )
      setAuth(data.access_token, data.user)
      return data.access_token
    } catch {
      clearAuth()
      return null
    }
  }

  // On mount: attempt silent refresh (restores session after page reload)
  useEffect(() => {
    silentRefresh().finally(() => {
      setState(s => s.isLoading ? { ...s, isLoading: false } : s)
    })
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current) }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiPost<{ access_token: string; user: AuthUser }>(
      '/auth/login', { username, password }
    )
    setAuth(data.access_token, data.user)
  }, [setAuth])

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const data = await apiPost<{
      access_token: string | null
      user: AuthUser | null
      message: string
    }>('/auth/signup', { username, email, password })

    if (data.access_token && data.user) {
      setAuth(data.access_token, data.user)
      return { message: data.message, autoLoggedIn: true }
    }
    return { message: data.message, autoLoggedIn: false }
  }, [setAuth])

  const logout = useCallback(async () => {
    try { await apiPost('/auth/logout', {}, state.accessToken) } catch { /* ignore */ }
    clearAuth()
  }, [state.accessToken, clearAuth])

  const getToken = useCallback(() => state.accessToken, [state.accessToken])

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}
