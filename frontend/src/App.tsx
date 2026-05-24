import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Marquee from './components/Marquee'
import { Spinner } from './components/UI'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider, useToast } from './components/Toast'
import Login from './pages/Login'
import Signup from './pages/Signup'
import NotFound from './pages/NotFound'
import { IconMenu2 } from '@tabler/icons-react'

const Dashboard  = lazy(() => import('./pages/Dashboard'))
const Insights   = lazy(() => import('./pages/Insights'))
const Holdings   = lazy(() => import('./pages/Holdings'))
const Admin      = lazy(() => import('./pages/Admin'))
const SystemAdmin = lazy(() => import('./pages/SystemAdmin'))

function AuthGate() {
  const { user, isLoading, logout } = useAuth()
  const { toast } = useToast()
  const [view, setView] = useState<'login' | 'signup'>('login')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // If a protected API call returns 401 (token expired mid-session), force logout
  useEffect(() => {
    const handler = () => {
      toast('Session expired. Please sign in again.', 'error')
      logout()
    }
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [logout, toast])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner />
      </div>
    )
  }

  if (!user) {
    return view === 'login'
      ? <Login onGoSignup={() => setView('signup')} />
      : <Signup onGoLogin={() => setView('login')} />
  }

  return (
    <BrowserRouter>
      {/* Skip to content — accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to content
      </a>

      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-card border-b border-border shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <IconMenu2 size={18} />
            </button>
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="Samridhi" className="w-5 h-5" />
              <span className="text-foreground font-bold text-[14px] tracking-tight">Samridhi</span>
            </div>
          </div>

          <div data-marquee>
            <Marquee />
          </div>

          <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-6">
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/"        element={<Dashboard />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/holdings" element={<Holdings />} />
                <Route path="/admin"    element={<Admin />} />
                <Route path="/system"   element={<SystemAdmin />} />
                {/* Legacy redirects */}
                <Route path="/summary"   element={<Navigate to="/insights" replace />} />
                <Route path="/analytics" element={<Navigate to="/insights" replace />} />
                <Route path="/stocks"    element={<Navigate to="/holdings" replace />} />
                <Route path="/mf"        element={<Navigate to="/holdings" replace />} />
                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate />
      </ToastProvider>
    </AuthProvider>
  )
}
