import { NavLink, useLocation } from 'react-router-dom'
import {
  IconLayoutDashboard, IconTrendingUp, IconBriefcase, IconRefresh,
  IconSettings, IconSun, IconMoon, IconShieldCheck, IconLogout, IconX,
} from '@tabler/icons-react'
import { cn } from '../utils/format'
import { useRefreshNAV, useRefreshStocks } from '../hooks/useApi'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../hooks/useAuth'
import { useToast } from './Toast'
import { useEffect } from 'react'

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: IconLayoutDashboard, label: 'Dashboard', end: true },
    ],
  },
  {
    label: 'Investments',
    items: [
      { to: '/insights', icon: IconTrendingUp, label: 'Insights', end: false },
      { to: '/holdings', icon: IconBriefcase, label: 'Holdings', end: false },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin', icon: IconSettings, label: 'Portfolio Management', end: false },
      { to: '/system', icon: IconShieldCheck, label: 'Admin', end: false },
    ],
  },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { toast } = useToast()
  const refreshNAV = useRefreshNAV({
    onSuccess: () => toast('NAV prices updated successfully', 'success'),
    onError: () => toast('Failed to refresh NAV prices', 'error'),
  })
  const refreshStocks = useRefreshStocks({
    onSuccess: () => toast('Stock prices updated successfully', 'success'),
    onError: () => toast('Failed to refresh stock prices', 'error'),
  })
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const location = useLocation()

  // Close drawer on route change (mobile)
  useEffect(() => {
    onClose?.()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const inner = (
    <aside className="w-56 shrink-0 bg-card border-r border-border flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-[18px] border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
            <img src="/favicon.svg" alt="Samridhi logo" className="w-full h-full" />
          </div>
          <span className="font-bold text-[15px] text-foreground tracking-tight">Samridhi</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="lg:hidden p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <IconX size={15} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto" aria-label="Main navigation">
        {navGroups.map(group => (
          <div key={group.label}>
            <div className="text-muted-foreground/70 text-[10px] font-semibold uppercase tracking-[0.1em] px-2 mb-1">
              {group.label}
            </div>
            <div className="space-y-px">
              {group.items.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[hsl(var(--primary))]" />}
                      <Icon size={15} aria-hidden="true" />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2.5 pb-4 pt-3 border-t border-border space-y-px">
        <div className="text-muted-foreground/70 text-[10px] font-semibold uppercase tracking-[0.1em] px-2 mb-1">Actions</div>
        <button
          onClick={() => refreshNAV.mutate()}
          disabled={refreshNAV.isPending}
          aria-label="Refresh mutual fund NAV prices"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <IconRefresh size={14} className={cn(refreshNAV.isPending && 'animate-spin')} aria-hidden="true" />
          {refreshNAV.isPending ? 'Updating NAV…' : 'Refresh NAV'}
        </button>
        <button
          onClick={() => refreshStocks.mutate()}
          disabled={refreshStocks.isPending}
          aria-label="Refresh stock prices"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <IconRefresh size={14} className={cn(refreshStocks.isPending && 'animate-spin')} aria-hidden="true" />
          {refreshStocks.isPending ? 'Updating…' : 'Refresh Stocks'}
        </button>
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          {theme === 'dark' ? <IconSun size={14} aria-hidden="true" /> : <IconMoon size={14} aria-hidden="true" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={() => logout()}
          aria-label="Sign out"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.08)] transition-all"
        >
          <IconLogout size={14} aria-hidden="true" />
          Sign out{user ? ` — ${user.username}` : ''}
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: always visible static sidebar */}
      <div className="hidden lg:flex h-screen sticky top-0">
        {inner}
      </div>

      {/* Mobile: slide-in drawer */}
      {open && (
        <>
          <div
            className="sidebar-overlay lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden flex h-full">
            {inner}
          </div>
        </>
      )}
    </>
  )
}
