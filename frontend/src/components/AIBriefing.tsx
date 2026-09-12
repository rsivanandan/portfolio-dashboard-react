import { useBriefing } from '../hooks/useApi'
import { Card, Badge, Spinner } from './UI'
import { cn } from '../utils/format'

// "Today in Markets" — the AI-distilled India market briefing (feature N1).
// Degrades gracefully: without an API key the backend returns raw headlines
// with ai_enabled: false, and news feed failures surface as a subtle offline state.
export default function AIBriefing() {
  const { data, isLoading, isError } = useBriefing()

  return (
    <Card title="Today in Markets" className="h-full">
      <div className="flex items-center justify-between mb-3">
        <Badge variant={data?.ai_enabled ? 'green' : 'zinc'}>
          {data?.ai_enabled ? 'AI distilled' : 'Raw headlines'}
        </Badge>
        <span className="text-muted-foreground text-[11px] uppercase tracking-wider">India markets</span>
      </div>

      {isLoading && !data ? (
        <Spinner />
      ) : isError || !data ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          Market briefing unavailable right now.
        </div>
      ) : (
        <div className="space-y-4">
          {data.brief && (
            <p className="text-sm leading-relaxed text-foreground/90 border-l-2 border-indigo-400 pl-3">
              {data.brief}
            </p>
          )}

          {data.items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2 text-center">
              No headlines retrieved.
            </div>
          ) : (
            <ul className="space-y-3">
              {data.items.map((item, i) => {
                const Wrapper = item.link ? 'a' : 'div'
                return (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <Wrapper
                      {...(item.link ? { href: item.link, target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="group text-sm leading-snug"
                    >
                      <span className={cn(
                        'font-medium',
                        item.link && 'group-hover:text-indigo-400 transition-colors',
                      )}>
                        {item.title}
                      </span>
                      {item.takeaway && (
                        <span className="block text-muted-foreground text-xs mt-0.5">
                          {item.takeaway}
                        </span>
                      )}
                    </Wrapper>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}