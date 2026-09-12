import { useEffect, useRef, useState } from 'react'
import { IconRobot, IconSend } from '@tabler/icons-react'
import { useAskAI, useAIStatus } from '../hooks/useApi'
import { Card, Badge } from './UI'
import { cn } from '../utils/format'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

const SUGGESTIONS = [
  'What is my largest holding?',
  'How exposed am I to a single fund house?',
  'Which holdings are underperforming?',
  'Is my portfolio concentrated?',
]

// "Ask Samridhi" — inline Q&A panel wired to /api/ai/ask (features I3 + C1).
// Lives in the Insights → AI tab alongside the other AI cards, rather than as
// a floating widget on every page, so all AI surfaces sit in one place.
export default function AskAssistant() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const ask = useAskAI()
  const { data: status } = useAIStatus()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, ask.isPending])

  const send = (q: string) => {
    const text = q.trim()
    if (!text || ask.isPending) return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    ask.mutate(text, {
      onSuccess: (res) => setMessages((m) => [...m, { role: 'assistant', text: res.answer }]),
      onError: () =>
        setMessages((m) => [
          ...m,
          { role: 'assistant', text: 'Sorry, I could not reach the assistant right now. Try again shortly.' },
        ]),
    })
  }

  const tips = SUGGESTIONS.filter(
    (s) => !messages.some((m) => m.role === 'user' && m.text === s),
  )

  return (
    <Card title="Ask Samridhi" beam>
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <IconRobot className="text-indigo-500" style={{ width: 16, height: 16 }} />
          Plain-English questions about your portfolio — answers cite your numbers.
        </span>
        <Badge variant={status?.ai_enabled ? 'green' : 'amber'}>
          {status?.ai_enabled ? 'AI ready' : 'AI not configured'}
        </Badge>
      </div>

      <div
        ref={listRef}
        className="overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-2.5"
        style={{ maxHeight: 360, minHeight: 120 }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tips.map((t) => (
              <button
                key={t}
                onClick={() => send(t)}
                className="px-2 py-1 rounded-md border border-border bg-card text-[11px] text-muted-foreground hover:text-foreground hover:border-indigo-400 transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-card text-foreground rounded-bl-sm border border-border',
                )}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        {ask.isPending && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl text-[13px] bg-card border border-border">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your portfolio…"
          className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-400 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || ask.isPending}
          aria-label="Send"
          className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          <IconSend className="w-4 h-4" />
        </button>
      </form>
    </Card>
  )
}
