import React, { useState, useRef, useEffect } from 'react'
import { fetchTrendAI } from '../api' // <-- use shared client
// Minimal assistant robot icon (inherits currentColor)
function AssistantIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="5" r="2" fill="currentColor" />
      <rect x="15" y="6.5" width="2" height="3" rx="1" fill="currentColor" />
      <rect x="7" y="10" width="18" height="14" rx="7" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12.5" cy="17" r="2" fill="currentColor" />
      <circle cx="19.5" cy="17" r="2" fill="currentColor" />
      <path d="M11 21c1.4 1.4 8.6 1.4 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export default function Chatbot({ symbol, period }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! Ask me about the selected stock, indicators, or timeframe.' }
  ])
  const [loading, setLoading] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, open])

  useEffect(() => {
    function onEsc(e){ if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const nextMsgs = [...messages, { role: 'user', content: text }]
    setMessages(nextMsgs)
    setInput('')
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, period, messages: nextMsgs })
      })
      const data = await r.json()
      setMessages(m => {
        const c = [...m, { role: 'assistant', content: data?.answer ?? 'No response' }]
        if (!open) setHasUnread(true)
        return c
      })
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Error contacting chatbot API.' }])
      if (!open) setHasUnread(true)
    } finally {
      setLoading(false)
    }
  }

  function onKey(e){
    // Enter sends, Shift+Enter makes a newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function toggleOpen() {
    setOpen(o => {
      const next = !o
      if (next) setHasUnread(false)
      return next
    })
  }

  return (
    <>
      <button
        className={`chat-fab-clean ${hasUnread && !open ? 'unread' : ''}`}
        onClick={toggleOpen}
        title={open ? 'Close Assistant' : 'Open Assistant'}
        aria-label={open ? 'Close Assistant' : 'Open Assistant'}
      >
        <AssistantIcon />
      </button>

      {open && (
        <div className="chat-panel-clean" role="dialog" aria-label="AI Assistant">
          <div className="chat-header-clean">
            <div className="chat-title">
              <AssistantIcon size={16} />
              <span>AI Assistant</span>
            </div>
            <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          <div className="chat-body-clean" ref={listRef} aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="chat-bubble assistant">…thinking…</div>}
          </div>

          <div className="chat-input-clean">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={`Ask about ${symbol || 'the stock'}…  (Enter=Send · Shift+Enter=New line)`}
              rows={1}
            />
            <button className="btn" onClick={send} disabled={loading || !input.trim()}>Send</button>
          </div>
        </div>
      )}
    </>
  )
}
