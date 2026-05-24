import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../utils/format'
import { IconUserPlus, IconEye, IconEyeOff } from '@tabler/icons-react'

interface Props {
  onGoLogin: () => void
}

export default function Signup({ onGoLogin }: Props) {
  const { signup } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const result = await signup(username.trim(), email.trim(), password)
      if (!result.autoLoggedIn) {
        // Not the first user — show pending message
        setPending(true)
      }
      // If autoLoggedIn, AuthProvider updated state → App.tsx will re-render to main app
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 dark:login-bg login-bg-light">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-xl overflow-hidden mx-auto mb-4 ring-1 ring-border bg-[hsl(var(--warning)/0.12)] border border-[hsl(var(--warning)/0.3)] flex items-center justify-center text-xl">
            ⏳
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">Pending Approval</h2>
          <p className="text-muted-foreground text-[13px] mb-6">
            Your account has been created. An admin needs to approve it before you can sign in.
          </p>
          <button onClick={onGoLogin} className="text-[hsl(var(--primary))] hover:underline text-[13px] font-medium">
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 dark:login-bg login-bg-light">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl overflow-hidden mb-4 ring-1 ring-border shadow-md">
            <img src="/favicon.svg" alt="Samridhi logo" className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Create Account</h1>
          <p className="text-muted-foreground text-[13px] mt-1">Join Samridhi</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card/90 backdrop-blur-sm border border-border rounded-2xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-username" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Username</label>
            <input
              id="signup-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="letters, numbers, _ or -"
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3 py-2.5 bg-muted/60 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.5)] focus:border-[hsl(var(--ring))] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className="text-xs font-semibold text-foreground uppercase tracking-wider">Email</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-password" className="text-xs font-semibold text-foreground uppercase tracking-wider">Password</label>
            <div className="relative">
              <input
                id="signup-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="min. 8 characters"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPw ? <IconEyeOff size={15} /> : <IconEye size={15} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-confirm" className="text-xs font-semibold text-foreground uppercase tracking-wider">Confirm Password</label>
            <input
              id="signup-confirm"
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="repeat password"
              required
              autoComplete="new-password"
              className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <div role="alert" className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-2.5 rounded-lg text-sm font-semibold transition-all',
              loading
                ? 'bg-primary/60 text-primary-foreground cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-md hover:shadow-primary/20',
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <IconUserPlus size={14} aria-hidden="true" />
              {loading ? 'Creating account…' : 'Create Account'}
            </span>
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{' '}
          <button onClick={onGoLogin} className="text-primary hover:underline font-medium">
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
