// frontend/src/components/TrendCard.jsx
import React, { useMemo, useEffect, useState } from 'react'
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/* ---------- helpers ---------- */
function sma(arr, n){ if(!arr||arr.length<n) return null; let s=0, out=Array(arr.length).fill(null); for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; if(i>=n-1) out[i]=s/n } return out }
function slope(values,n){ if(!values||values.length<n) return null; const start=values.length-n; let sx=0,sy=0,sxx=0,sxy=0; for(let i=0;i<n;i++){ const x=i, y=values[start+i]; sx+=x; sy+=y; sxx+=x*x; sxy+=x*y } const d=n*sxx-sx*sx; if(!d) return null; return (n*sxy-sx*sy)/d }
const pct = (a,b)=> (b ? ((a-b)/b)*100 : null)
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))

function computeTrend(points){
  if(!points||points.length<20) return { label:'Neutral', confidence:0, checks:[], meta:{} }
  const close=points.map(p=>+p.c), last=close.at(-1)
  const sma20Arr=sma(close,20), sma50Arr=sma(close,50), sma200Arr=sma(close,200)
  const sma20=sma20Arr?.at(-1)??null, sma50=sma50Arr?.at(-1)??null, sma200=sma200Arr?.at(-1)??null
  const slope20=slope(close,Math.min(20,close.length))??0
  const slope50=close.length>=50? (slope(close,50)??0):null
  const checks=[]
  if(sma20!=null) checks.push({name:'Close > SMA20', ok:last>sma20})
  if(sma50!=null&&sma20!=null) checks.push({name:'SMA20 > SMA50', ok:sma20>sma50})
  if(sma200!=null&&sma50!=null) checks.push({name:'SMA50 > SMA200', ok:sma50>sma200})
  checks.push({name:'Slope(20) > 0', ok:slope20>0})
  if(slope50!=null) checks.push({name:'Slope(50) ≥ 0', ok:slope50>=0})
  const score=checks.reduce((a,c)=>a+(c.ok?1:-1),0), maxScore=checks.length
  let label='Neutral'
  if(score>=Math.ceil(maxScore*0.6)) label='Bullish'
  else if(score<=-Math.ceil(maxScore*0.6)) label='Bearish'
  const confidence=Math.round((Math.abs(score)/maxScore)*100)
  return { label, confidence, checks, meta:{ last, sma20, close } }
}

function toneClass(l){ return l==='Bullish'?'bullish':l==='Bearish'?'bearish':'neutral' }

function consensus(rule, ai, useAI=true){
  const map={Bullish:1,Neutral:0,Bearish:-1}
  const parts=[]
  if(rule?.label) parts.push({v:map[rule.label]??0,w:0.6+(rule.confidence||0)/400})
  if(useAI && ai?.label) parts.push({v:map[ai.label]??0,w:0.6+(ai.confidence||0)/400})
  if(!parts.length) return {label:'Neutral', confidence:0}
  const wsum=parts.reduce((a,p)=>a+p.w,0)
  const s=parts.reduce((a,p)=>a+p.v*p.w,0)/(wsum||1)
  const label=s>0.25?'Bullish':s<-0.25?'Bearish':'Neutral'
  const confidence=Math.round(clamp(Math.abs(s)*100,0,100))
  return { label, confidence }
}

function makeSparkline(closes,N=64,w=140,h=32,pad=3){
  if(!closes||closes.length<2) return {d:''}
  const data=closes.slice(-N)
  const min=Math.min(...data), max=Math.max(...data)
  const span=max-min||1, xstep=(w-pad*2)/Math.max(1,data.length-1)
  const y=v=> pad+(h-pad*2)*(1-(v-min)/span)
  let d=`M ${pad} ${y(data[0])}`; for(let i=1;i<data.length;i++){ d+=` L ${pad+i*xstep} ${y(data[i])}` }
  return { d }
}

/* ---------- component ---------- */
export default function TrendCard({ hist, symbol }){
  const trend = useMemo(()=>computeTrend(hist?.points||[]),[hist])
  const [ai,setAi]=useState(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState(null)
  const [useAI,setUseAI]=useState(true)

  const fetchAI=()=>{
    if(!symbol||!hist?.points?.length) return
    const period = hist?.period || '6mo'
    setLoading(true); setErr(null)
    fetch(`${API_BASE}/api/trend_ai?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`)
      .then(r=>r.ok?r.json():Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d=>setAi(d))
      .catch(e=>setErr(e.message||'AI error'))
      .finally(()=>setLoading(false))
  }
  useEffect(fetchAI,[symbol, hist?.period, hist?.points?.length])

  const con = consensus(trend, ai, useAI)
  const conTone = toneClass(con.label)
  const ruleTone = toneClass(trend.label)
  const aiTone   = toneClass(ai?.label)
  const spark = makeSparkline(trend.meta.close || [])

  return (
    <div className="card trend-card" style={{display:'flex',flexDirection:'column',gap:10}}>
      {/* Header with sparkline on right */}
      <div className="label" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
        <span>Trend</span>
        <svg width="140" height="32" viewBox="0 0 140 32" style={{opacity:.9}}>
          <path d={spark.d} fill="none" stroke={conTone==='bullish'?'#34d399':conTone==='bearish'?'#f87171':'#94a3b8'} strokeWidth="2"/>
        </svg>
      </div>

      {/* SINGLE HORIZONTAL ROW */}
      <div
        style={{
          display:'flex', alignItems:'center', gap:12,
          flexWrap:'nowrap', whiteSpace:'nowrap', overflowX:'auto', paddingBottom:4
        }}
      >
        {/* Consensus */}
        <span className={`trend-badge ${conTone}`}>Consensus: {con.label}</span>
        <span className="trend-conf">{con.confidence}% conf</span>

        {/* Heuristic */}
        <span className={`trend-badge ${ruleTone}`}>Heuristic: {trend.label}</span>
        <span className="trend-conf">{trend.confidence}%</span>

        {/* AI */}
        {err ? (
          <span className="trend-badge neutral">AI: unavailable</span>
        ) : ai ? (
          <>
            <span className={`trend-badge ${aiTone}`}>AI: {ai.label}</span>
            <span className="trend-conf">{ai.confidence}%</span>
          </>
        ) : (
          <span className="trend-badge neutral">AI: —</span>
        )}

        <div style={{flex:1}} />

        {/* Controls on far right */}
        <label style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--muted)'}}>
          <input type="checkbox" checked={useAI} onChange={e=>setUseAI(e.target.checked)} />
          Include AI
        </label>
        <button className="chip" onClick={fetchAI} disabled={loading}>
          {loading ? 'Analyzing…' : 'Refresh AI'}
        </button>
      </div>
    </div>
  )
}
