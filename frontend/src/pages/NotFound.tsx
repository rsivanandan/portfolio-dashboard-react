import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="relative mb-8">
        <div className="text-[96px] font-extrabold tracking-tighter bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent select-none leading-none">
          404
        </div>
        <div className="absolute -inset-4 rounded-full bg-primary/5 blur-2xl" />
      </div>

      <h1 className="text-foreground text-xl font-bold mb-2">Page not found</h1>
      <p className="text-muted-foreground text-sm mb-8 max-w-xs">
        The page you're looking for doesn't exist or has been moved.
      </p>

      <button
        onClick={() => navigate('/', { replace: true })}
        className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all hover:shadow-md hover:shadow-primary/20"
      >
        Go to Dashboard
      </button>
    </div>
  )
}
