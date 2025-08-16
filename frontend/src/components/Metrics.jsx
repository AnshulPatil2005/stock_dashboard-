// frontend/src/components/Metrics.jsx
import React, { useMemo } from 'react'

function fmtNum(n, d = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(d)
}
function fmtPct(n, d = 2) {
  if (n == null || isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(d)}%`
}
function fmtCompact(n) {
  if (n == null || isNaN(n)) return '—'
  try {
    return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n)
  } catch {
    // fallback
    const abs = Math.abs(n)
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`
    return String(n)
  }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function calcATR14(points) {
  if (!points || points.length < 2) return { atr: null, atrPct: null }
  const TR = []
  for (let i = 1; i < points.length; i++) {
    const h = +points[i].h
    const l = +points[i].l
    const pc = +points[i - 1].c
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    TR.push(tr)
  }
  // Wilder's smoothing (EMA with alpha = 1/14). If less than 14, fall back to simple avg.
  const N = 14
  if (TR.length < 2) return { atr: null, atrPct: null }
  let atr
  if (TR.length >= N) {
    let prev = TR.slice(0, N).reduce((a, b) => a + b, 0) / N
    for (let i = N; i < TR.length; i++) {
      prev = (prev * (N - 1) + TR[i]) / N
    }
    atr = prev
  } else {
    atr = TR.reduce((a, b) => a + b, 0) / TR.length
  }
  const lastClose = +points.at(-1).c
  const atrPct = lastClose ? (atr / lastClose) * 100 : null
  return { atr, atrPct }
}

function avgVolume(points, n = 20) {
  if (!points || !points.length) return null
  const slice = points.slice(-n)
  const vols = slice.map(p => +p.v).filter(v => Number.isFinite(v))
  if (!vols.length) return null
  return vols.reduce((a, b) => a + b, 0) / vols.length
}

function returnSince(points, predicateDate) {
  if (!points || points.length < 2) return null
  const first = points.find(p => {
    const d = new Date(p.t)
    return predicateDate(d)
  })
  const last = points.at(-1)
  if (!first || !last) return null
  const r = (last.c / first.c - 1) * 100
  return r
}

export default function Metrics({ symbol, quote, hist }) {
  const points = hist?.points || []

  const {
    lastClose,
    prevClose,
    change,
    changePct,
    hi52,
    lo52,
    avgVol1y,
    avgVol20,
    posPct,
    atr,
    atrPct,
    mtd,
    ytd,
    forecast,
    forecastDelta,
  } = useMemo(() => {
    const lastClose = quote?.last_close ?? (points.length ? +points.at(-1).c : null)
    const prevClose = quote?.previous_close ?? (points.length > 1 ? +points.at(-2).c : null)
    const change = lastClose != null && prevClose != null ? lastClose - prevClose : null
    const changePct = lastClose != null && prevClose != null ? (change / prevClose) * 100 : null

    // 52W stats (prefer backend stats; fallback to visible)
    const hi52 =
      hist?.stats?.high_52w ??
      (points.length ? Math.max(...points.map(p => +p.h)) : null)
    const lo52 =
      hist?.stats?.low_52w ??
      (points.length ? Math.min(...points.map(p => +p.l)) : null)

    const span = hi52 != null && lo52 != null ? hi52 - lo52 : null
    const posPct =
      span && lastClose != null ? clamp(((lastClose - lo52) / span) * 100, 0, 100) : null

    const avgVol1y = hist?.stats?.avg_volume_1y ?? null
    const avgVol20 = avgVolume(points, 20)

    const { atr, atrPct } = calcATR14(points)

    // Returns
    const now = new Date()
    const mtd = returnSince(points, d => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth())
    const ytd = returnSince(points, d => d.getFullYear() === now.getFullYear() && d.getMonth() === 0 && d.getDate() <= 10) // ~first trading days

    // Forecast (backend simple regression)
    const forecast = hist?.prediction?.next_day_close_forecast ?? null
    const forecastDelta = forecast != null && lastClose != null ? ((forecast - lastClose) / lastClose) * 100 : null

    return {
      lastClose, prevClose, change, changePct,
      hi52, lo52, avgVol1y, avgVol20, posPct,
      atr, atrPct, mtd, ytd, forecast, forecastDelta
    }
  }, [quote, hist, points])

  const up = (change ?? 0) >= 0
  const deltaColor = up ? '#34d399' : '#f87171'
  const deltaArrow = up ? '▲' : '▼'

  return (
    <section className="metrics" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
      {/* Symbol + Last Close */}
      <div className="card" style={{display:'flex', flexDirection:'column', gap:6}}>
        <div className="label">Symbol</div>
        <div className="value" style={{fontSize:18, opacity:.9}}>{symbol || '—'}</div>
        <div className="label" style={{marginTop:4}}>Last Close</div>
        <div className="value" style={{fontSize:24, fontWeight:800}}>
          {fmtNum(lastClose, 2)}
        </div>
        <div style={{color: deltaColor, fontWeight:700}}>
          {change != null ? `${deltaArrow} ${fmtNum(change,2)} (${fmtPct(changePct)})` : '—'}
        </div>
      </div>

      {/* 52W position with progress bar */}
      <div className="card" style={{display:'flex', flexDirection:'column', gap:8}}>
        <div className="label">52W Position</div>
        <div style={{fontSize:12, color:'var(--muted)'}}>
          Low {fmtNum(lo52,2)} • High {fmtNum(hi52,2)}
        </div>
        <div style={{
          position:'relative', height:10, borderRadius:8,
          background:'rgba(255,255,255,.06)', border:'1px solid var(--border)'
        }}>
          <div style={{
            position:'absolute', inset:'0 0 0 0', padding:2
          }}>
            <div style={{
              width: `${posPct ?? 0}%`,
              height:'100%',
              background:'linear-gradient(90deg, #38bdf8, #8b5cf6)',
              borderRadius:6
            }} />
          </div>
        </div>
        <div style={{fontSize:12, color:'var(--muted)'}}>
          {posPct != null ? `${fmtNum(posPct,1)}% from 52W Low` : '—'}
        </div>
      </div>

      {/* Volumes */}
      <div className="card" style={{display:'flex', flexDirection:'column', gap:6}}>
        <div className="label">Average Volume</div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">20D</span>
          <strong>{fmtCompact(avgVol20)}</strong>
        </div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">1Y</span>
          <strong>{fmtCompact(avgVol1y)}</strong>
        </div>
      </div>

      {/* ATR */}
      <div className="card" style={{display:'flex', flexDirection:'column', gap:6}}>
        <div className="label">Volatility (ATR 14)</div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">ATR</span>
          <strong>{fmtNum(atr, 2)}</strong>
        </div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">ATR %</span>
          <strong>{fmtPct(atrPct, 2)}</strong>
        </div>
      </div>

      {/* Returns */}
      <div className="card" style={{display:'flex', flexDirection:'column', gap:6}}>
        <div className="label">Returns</div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">MTD</span>
          <strong style={{color: mtd!=null ? (mtd>=0 ? '#34d399':'#f87171') : 'var(--text)'}}>
            {fmtPct(mtd, 2)}
          </strong>
        </div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">YTD</span>
          <strong style={{color: ytd!=null ? (ytd>=0 ? '#34d399':'#f87171') : 'var(--text)'}}>
            {fmtPct(ytd, 2)}
          </strong>
        </div>
      </div>

      {/* Forecast */}
      <div className="card" style={{display:'flex', flexDirection:'column', gap:6}}>
        <div className="label">Next-day Forecast</div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">Close</span>
          <strong>{fmtNum(forecast, 2)}</strong>
        </div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span className="label">Δ vs last</span>
          <strong style={{color: forecastDelta!=null ? (forecastDelta>=0 ? '#34d399':'#f87171') : 'var(--text)'}}>
            {fmtPct(forecastDelta, 2)}
          </strong>
        </div>
      </div>
    </section>
  )
}
