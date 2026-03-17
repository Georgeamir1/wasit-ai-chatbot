'use client'

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Send, Bot, User, ShoppingCart, Check, Wrench, Sparkles, RefreshCw, Gauge, Brain, AlertTriangle, Zap, Car } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"

const QUICK_PROMPTS = [
  { icon: "🔊", text: "Strange engine noise" },
  { icon: "🔴", text: "Warning light on" },
  { icon: "🛑", text: "Brake issues" },
  { icon: "❄️", text: "AC not cooling" },
  { icon: "🔋", text: "Battery problem" },
  { icon: "💧", text: "Car overheating" },
]

interface Part {
  name: string
  price: string
  category: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  parts: Part[]
  thinking?: string | null
  timestamp: Date
  isStreaming?: boolean
}

function parseMessageParts(text: string): { text: string; parts: Part[] } {
  const parts: Part[] = []
  const partRegex = /\[PART:\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/g
  const cleanText = text.replace(partRegex, (_, name, price, category) => {
    parts.push({ name: name.trim(), price: price.trim(), category: category.trim() })
    return ""
  })
  return { text: cleanText, parts }
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold text-rose-50 mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold text-rose-50 mt-4 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold text-rose-50 mt-3 mb-1">{children}</h3>,
        strong: ({ children }) => <strong className="font-semibold text-rose-50">{children}</strong>,
        ul: ({ children }) => <ul className="list-none space-y-1 my-2">{children}</ul>,
        li: ({ children }) => <li className="text-sm text-rose-100/90">{children}</li>,
        p: ({ children }) => <p className="text-sm text-rose-100/90 my-1.5">{children}</p>,
        hr: () => <hr className="border-rose-500/20 my-3" />,
        code: ({ children }) => <code className="bg-rose-500/20 text-rose-200 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default function WasitChatbot() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [mileage, setMileage] = useState("")
  const [showMileage, setShowMileage] = useState(true)
  const [enableThinking, setEnableThinking] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)
  const [addedParts, setAddedParts] = useState<Set<string>>(new Set())
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const sendMessage = useCallback(
    async (text?: string) => {
      const userMsg = text || input.trim()
      if (!userMsg || loading) return
      setInput("")
      setRateLimitError(null)

      const newUserMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: userMsg,
        parts: [],
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, newUserMessage])
      setLoading(true)

      const aiMessageId = `ai-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: aiMessageId,
          role: "assistant",
          content: "",
          parts: [],
          timestamp: new Date(),
          isStreaming: true,
        },
      ])

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message: userMsg,
            mileage: mileage || undefined,
            enableThinking,
            stream: true,
          }),
        })

        if (res.status === 429) {
          const errorData = await res.json()
          setRateLimitError(errorData.message)
          setMessages((prev) => prev.filter((m) => m.id !== aiMessageId))
          setLoading(false)
          return
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No reader")
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split("\n\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === "thinking") {
                setMessages((prev) =>
                  prev.map((m) => (m.id === aiMessageId ? { ...m, thinking: data.content } : m))
                )
              } else if (data.type === "content") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMessageId
                      ? { ...m, content: data.content, isStreaming: !data.done }
                      : m
                  )
                )
              } else if (data.type === "done") {
                setRemaining(data.remaining)
                setMessages((prev) =>
                  prev.map((m) => (m.id === aiMessageId ? { ...m, isStreaming: false } : m))
                )
              } else if (data.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMessageId
                      ? { ...m, content: data.message, isStreaming: false }
                      : m
                  )
                )
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMessageId
            ? { ...m, content: "Connection error. Please try again.", isStreaming: false }
            : m
        )
      )
    }
      setLoading(false)
  },
  [input, loading, sessionId, mileage, enableThinking]
  )

  const clearChat = async () => {
    await fetch(`/api/chat?sessionId=${sessionId}`, { method: "DELETE" })
    setMessages([])
    setRemaining(null)
    setRateLimitError(null)
    setShowMileage(true)
    setMileage("")
    setAddedParts(new Set())
  }

  return (
    <div className="min-h-screen bg-rose-950 flex flex-col font-sans">
      {/* Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-rose-500/10 rounded-full blur-[80px]" />
        <div className="absolute top-1/2 -left-20 w-52 h-52 bg-rose-500/5 rounded-full blur-[80px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-rose-950/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-500/5 border border-rose-500/25 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-rose-300" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-rose-50">Wasit AI</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-rose-300/60">Car Diagnostics</span>
              </div>
              {remaining !== null && (
                <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-300/70">
                  <Zap className="w-2.5 h-2.5 mr-1" />
                  {remaining} left
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearChat}
            className="text-rose-300/60 hover:text-rose-200 hover:bg-rose-500/10"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Thinking Mode Toggle */}
        <div className="max-w-md mx-auto px-4 pb-3">
          <div className="flex items-center justify-between bg-rose-500/5 border border-rose-500/10 rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-300" />
              <Label htmlFor="thinking-mode" className="text-xs text-rose-200 cursor-pointer">
                Deep Analysis Mode
              </Label>
            </div>
            <Switch
              id="thinking-mode"
              checked={enableThinking}
              onCheckedChange={setEnableThinking}
              className="data-[state=checked]:bg-amber-500/70"
            />
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="max-w-md mx-auto px-4 py-5 pb-32">
          {/* Rate Limit Error */}
          {rateLimitError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-200">{rateLimitError}</p>
            </div>
          )}

          {/* Mileage Banner */}
          {showMileage && (
            <div className="bg-gradient-to-br from-rose-500/10 to-transparent border border-rose-500/18 rounded-2xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Car className="w-4 h-4 text-rose-300" />
                <span className="text-xs font-semibold text-rose-200">
                  Enter your mileage for personalized tips
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder="e.g. 42000"
                  type="number"
                  className="flex-1 bg-white/5 border-white/10 text-rose-50 placeholder:text-rose-300/40 focus:border-rose-500/30"
                />
                <span className="flex items-center text-rose-300/50 text-sm">km</span>
                <Button
                  size="sm"
                  onClick={() => mileage && setShowMileage(false)}
                  className="bg-rose-200 hover:bg-rose-100 text-rose-950 font-semibold"
                >
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Mileage Badge */}
          {!showMileage && mileage && (
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="outline" className="border-rose-500/30 text-rose-300/80">
                <Gauge className="w-3 h-3 mr-1" />
                {parseInt(mileage).toLocaleString()} km
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMileage(true)}
                className="h-6 text-xs text-rose-300/50 hover:text-rose-200"
              >
                Edit
              </Button>
            </div>
          )}

          {/* Welcome State */}
          {messages.length === 0 && (
            <div className="text-center py-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500/18 to-rose-500/5 border border-rose-500/25 flex items-center justify-center mx-auto mb-5">
                <Wrench className="w-9 h-9 text-rose-300" />
              </div>
              <h2 className="text-lg font-bold text-rose-50 mb-2">What&apos;s wrong with your car?</h2>
              <p className="text-sm text-rose-300/55 leading-relaxed max-w-xs mx-auto">
                Describe any symptom, noise, or warning light and I&apos;ll diagnose it for you.
              </p>

              {/* Quick Prompts */}
              <div className="flex flex-wrap gap-2 justify-center mt-6">
                {QUICK_PROMPTS.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(q.text)}
                    className="bg-white/5 border-rose-500/18 text-rose-200 hover:bg-rose-500/12 hover:border-rose-500/25 rounded-full"
                  >
                    {q.icon} {q.text}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => {
            const isAI = msg.role === "assistant"
            const { text, parts } = isAI
              ? parseMessageParts(msg.content)
              : { text: msg.content, parts: [] }
            return (
              <div key={msg.id} className={cn("flex gap-2 mb-4", isAI ? "justify-start" : "justify-end")}>
                {isAI && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500/20 to-rose-500/5 border border-rose-500/25 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-rose-300" />
                  </div>
                )}
                <div className={cn("max-w-[85%]", isAI ? "" : "order-first")}>
                  {/* Thinking Block */}
                  {msg.thinking && (
                    <div className="mb-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/80">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Brain className="w-3.5 h-3.5 text-amber-300" />
                        <span className="font-semibold text-amber-300">Thinking...</span>
                      </div>
                      <p className="whitespace-pre-wrap opacity-80 line-clamp-4">{msg.thinking}</p>
                    </div>
                  )}

                  <div
                    className={cn(
                      "px-4 py-3 backdrop-blur-sm",
                      isAI
                        ? "bg-gradient-to-br from-rose-500/10 to-transparent border border-rose-500/15 rounded-2xl rounded-bl-sm"
                        : "bg-rose-500/20 border border-rose-500/25 rounded-2xl rounded-br-sm"
                    )}
                  >
                    {isAI ? (
                      <>
                        <MarkdownContent content={text} />
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-4 bg-rose-300 animate-pulse ml-0.5" />
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-rose-50/90 whitespace-pre-wrap">{text}</p>
                    )}

                    {/* Part Cards */}
                    {parts.length > 0 &&
                      parts.map((part, i) => (
                        <div
                          key={i}
                          className="bg-gradient-to-br from-rose-500/10 to-transparent border border-rose-500/20 rounded-xl p-3 mt-3 flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                            <Wrench className="w-5 h-5 text-rose-300" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-rose-50 truncate">{part.name}</div>
                            <div className="text-xs text-rose-300/70 mt-0.5">
                              {part.price} · {part.category}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => setAddedParts((prev) => new Set(prev).add(part.name))}
                            className={cn(
                              "shrink-0 text-xs font-bold",
                              addedParts.has(part.name)
                                ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                                : "bg-rose-200 hover:bg-rose-100 text-rose-950"
                            )}
                          >
                            {addedParts.has(part.name) ? (
                              <>
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Added
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                                Cart
                              </>
                            )}
                          </Button>
                        </div>
                      ))}
                  </div>

                  <div
                    className={cn(
                      "text-[10px] text-rose-300/40 mt-1.5 px-1",
                      isAI ? "text-left" : "text-right"
                    )}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {!isAI && (
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/25 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4 text-rose-300" />
                  </div>
                )}
              </div>
            )
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-rose-950/92 backdrop-blur-xl border-t border-white/5">
        <div className="max-w-md mx-auto px-4 py-3 pb-6">
          <div className="flex gap-2 items-end bg-white/5 border border-white/10 rounded-2xl p-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Describe your car problem..."
              rows={1}
              className="flex-1 bg-transparent border-0 text-rose-50 placeholder:text-rose-300/40 resize-none focus-visible:ring-0 min-h-[40px] max-h-24"
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className={cn(
                "w-10 h-10 rounded-full shrink-0",
                input.trim() && !loading
                  ? "bg-rose-200 hover:bg-rose-100 text-rose-950"
                  : "bg-rose-500/20 text-rose-300/40 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
