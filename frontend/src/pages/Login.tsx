import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../utils/format'
import { IconLock, IconEye, IconEyeOff } from '@tabler/icons-react'
import { Meteors } from '../components/Meteors'

interface Props {
  onGoSignup: () => void
}

export default function Login({ onGoSignup }: Props) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 dark:login-bg login-bg-light relative overflow-hidden">
      {/* Meteors background effect */}
      <Meteors count={16} />

      {/* subtle grain overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.025] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJuIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWx0ZXI9InVybCgjbikiIG9wYWNpdHk9IjEiLz48L3N2Zz4=')] bg-repeat" />

      <div className="w-full max-w-[340px] relative">
        {/* Logo block */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl overflow-hidden mb-4 ring-1 ring-border shadow-md">
            <img src="/favicon.svg" alt="Samridhi logo" className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Samridhi</h1>
          <p className="text-muted-foreground text-[13px] mt-1">Personal portfolio tracker</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card/90 backdrop-blur-sm border border-border rounded-2xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] space-y-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-username" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Username</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your username"
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3 py-2.5 bg-muted/60 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.5)] focus:border-[hsl(var(--ring))] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Password</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 pr-10 bg-muted/60 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.5)] focus:border-[hsl(var(--ring))] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPw ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="px-3 py-2 rounded-lg bg-[hsl(var(--danger)/0.08)] border border-[hsl(var(--danger)/0.25)] text-[hsl(var(--danger))] text-[13px]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-2.5 rounded-lg text-[14px] font-semibold transition-all mt-1',
              loading
                ? 'bg-[hsl(var(--primary)/0.5)] text-primary-foreground cursor-not-allowed'
                : 'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.88)] text-primary-foreground shadow-sm hover:shadow-md',
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <IconLock size={13} aria-hidden="true" />
              {loading ? 'Signing in…' : 'Sign in'}
            </span>
          </button>
        </form>

        <p className="text-center text-[13px] text-muted-foreground mt-4">
          No account?{' '}
          <button onClick={onGoSignup} className="text-[hsl(var(--primary))] hover:underline font-medium">
            Create one
          </button>
        </p>
      </div>
    </div>
  )
}
