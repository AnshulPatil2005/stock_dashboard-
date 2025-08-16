// frontend/src/components/NewsSummarizer.jsx
import React, { useMemo, useState } from 'react'
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function NewsSummarizer({ symbol }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [out, setOut] = useState(null)
  const [err, setErr] = useState(null)
  const [sources, setSources] = useState([])

  const items = useMemo(() => {
    return text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        let title=line, snippet=null
        for (const sep of [' — ', ' | ', ' - ']) {
          const i = line.indexOf(sep)
          if (i>0) { title=line.slice(0,i); snippet=line.slice(i+sep.length); break }
        }
        return { title, snippet }
      })
      .slice(0, 20)
  }, [text])

  const summarizePasted = async () => {
    if (!items.length) return
    setLoading(true); setErr(null); setOut(null); setSources([])
    try {
      const res = await fetch(`${API_BASE}/api/news_summarize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, items })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setOut(await res.json())
    } catch (e) {
      setErr(e.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  const fetchLatest = async () => {
    if (!symbol) return
    setLoading(true); setErr(null); setOut(null)
    try {
      const region = symbol?.endsWith('.NS') ? 'IN' : 'US'
      const res = await fetch(`${API_BASE}/api/news_summarize_live?symbol=${encodeURIComponent(symbol)}&n=10&region=${region}&lang=en`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setOut(data)
      // We don’t return raw source links from the backend (RSS parsing lives there).
      // If you want to show raw headlines/links, add a /api/news_live endpoint that returns entries.
    } catch (e) {
      setErr(e.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  const badgeClass = out?.sentiment === 'positive' ? 'bullish'
                    : out?.sentiment === 'negative' ? 'bearish' : 'neutral'

  return (
    <div className="card" style={{display:'flex', flexDirection:'column', gap:10}}>
      <div className="label">News (AI)</div>

      <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
        <button className="btn" onClick={fetchLatest} disabled={loading || !symbol}>
          {loading ? 'Fetching…' : `Fetch latest for ${symbol || '—'}`}
        </button>
        <span className="label" style={{margin:'0 6px'}}>or</span>
        <button className="chip" onClick={summarizePasted} disabled={loading || !items.length}>
          {loading ? 'Analyzing…' : 'Summarize pasted'}
        </button>
        <div style={{flex:1}} />
        {out && <span className={`trend-badge ${badgeClass}`}>Sentiment: {out.sentiment}</span>}
      </div>

      {/* Optional paste area (kept as a fallback/manual mode) */}
      <textarea
        value={text}
        onChange={e=>setText(e.target.value)}
        placeholder="(Optional) Paste 3–10 headlines, one per line"
        rows={4}
        style={{
          width:'100%', resize:'vertical',
          background:'#0b1220', color:'var(--text)',
          border:'1px solid var(--border)', borderRadius:10, padding:10
        }}
      />

      {err && <div className="trend-note" style={{color:'#f87171'}}>Error: {err}</div>}

      {out && (
        <div className="trend-note">
          <ul style={{margin:'6px 0 4px 18px'}}>
            {out.bullets.map((b,i)=><li key={i}>{b}</li>)}
          </ul>
          <div style={{marginTop:6, color:'var(--muted)'}}><strong>Risk:</strong> {out.risk}</div>
          <div style={{marginTop:4, color:'var(--muted)'}}>source: {out.origin}</div>
        </div>
      )}
    </div>
  )
}
