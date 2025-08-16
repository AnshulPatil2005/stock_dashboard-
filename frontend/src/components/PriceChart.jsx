// frontend/src/components/PriceChart.jsx
import React, { useEffect, useMemo, useRef } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, TimeScale, Tooltip, Legend
} from 'chart.js'
import 'chartjs-adapter-luxon'

Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend)
Chart.defaults.color = '#cbd5e1'
Chart.defaults.borderColor = 'rgba(255,255,255,0.12)'

// --- indicator helpers ---
function sma(values, window){
  const out = Array(values.length).fill(null); let sum=0
  for(let i=0;i<values.length;i++){
    sum += values[i]
    if(i>=window) sum -= values[i-window]
    if(i>=window-1) out[i] = +(sum/window).toFixed(6)
  }
  return out
}
function ema(values, window){
  const out = Array(values.length).fill(null); const k = 2/(window+1); let prev=null
  for(let i=0;i<values.length;i++){
    const v = values[i]
    prev = prev===null ? v : v*k + prev*(1-k)
    out[i] = +prev.toFixed(6)
  }
  return out
}
function bollinger(values, window=20, mult=2){
  const basis = sma(values, window)
  const upper = Array(values.length).fill(null)
  const lower = Array(values.length).fill(null)
  for(let i=0;i<values.length;i++){
    if(i<window-1) continue
    const slice = values.slice(i-window+1, i+1)
    const mean = basis[i]
    const variance = slice.reduce((a,x)=>a+Math.pow(x-mean,2),0)/window
    const sd = Math.sqrt(variance)
    upper[i] = +(mean + mult*sd).toFixed(6)
    lower[i] = +(mean - mult*sd).toFixed(6)
  }
  return { basis, upper, lower }
}

export default function PriceChart({ symbol, history, toggles, settings }){
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  // prefer warm-up series for indicator calc
  const calc = history?.calc ?? history
  const disp = history?.display ?? history

  const computed = useMemo(()=>{
    if(!calc?.points?.length || !disp?.points?.length) return null

    const labelsAll = calc.points.map(p => new Date(p.t))
    const closeAll  = calc.points.map(p => p.c)

    // compute indicators on warm-up, then slice to visible
    const s1All = sma(closeAll, settings.smaWindow)
    const s2All = sma(closeAll, settings.smaWindow2)
    const e1All = ema(closeAll, settings.emaWindow)
    const e2All = ema(closeAll, settings.emaWindow2)
    const bbAll = bollinger(closeAll, settings.bbWindow, settings.bbStd)

    const n = disp.points.length
    const last = arr => arr.slice(-n)

    const labels = labelsAll.slice(-n)
    const close  = last(closeAll)
    const s1 = last(s1All), s2 = last(s2All)
    const e1 = last(e1All), e2 = last(e2All)
    const bb = { upper: last(bbAll.upper), lower: last(bbAll.lower) }

    const hi = disp?.stats?.high_52w ?? null
    const lo = disp?.stats?.low_52w ?? null
    const hiArr = hi ? Array(n).fill(hi) : []
    const loArr = lo ? Array(n).fill(lo) : []

    return { labels, close, s1, s2, e1, e2, bb, hiArr, loArr }
  }, [calc, disp, settings])

  useEffect(()=>{
    if(!computed){
      if(chartRef.current){ chartRef.current.destroy(); chartRef.current = null }
      return
    }
    const { labels, close, s1, s2, e1, e2, bb, hiArr, loArr } = computed
    const ctx = canvasRef.current.getContext('2d')
    if(chartRef.current) chartRef.current.destroy()

    const palette = {
      close:'#60a5fa',
      sma:'#f59e0b', sma2:'#f43f5e',
      ema:'#10b981', ema2:'#a78bfa',
      bbLine:'#94a3b8', bbFill:'rgba(148,163,184,0.20)',
      hi52:'#22d3ee', lo52:'#fb7185', band52:'rgba(34,211,238,0.08)'
    }

    const datasets = [
      { label:`${symbol} Close`, data:close, borderColor:palette.close, pointRadius:0, borderWidth:2, tension:0.15 }
    ]

    if(toggles.sma20) datasets.push({ label:`SMA${settings.smaWindow}`, data:s1, borderColor:palette.sma, pointRadius:0, borderWidth:2, borderDash:[6,4], tension:0.15 })
    if(toggles.sma50) datasets.push({ label:`SMA${settings.smaWindow2}`, data:s2, borderColor:palette.sma2, pointRadius:0, borderWidth:2, tension:0.15 })
    if(toggles.ema20) datasets.push({ label:`EMA${settings.emaWindow}`, data:e1, borderColor:palette.ema, pointRadius:0, borderWidth:2, tension:0.15 })
    if(toggles.ema50) datasets.push({ label:`EMA${settings.emaWindow2}`, data:e2, borderColor:palette.ema2, pointRadius:0, borderWidth:2, tension:0.15 })

    if(toggles.bb20){
      datasets.push({ label:`BB${settings.bbWindow} Upper`, data:bb.upper, borderColor:palette.bbLine, pointRadius:0, borderWidth:1, tension:0.15 })
      datasets.push({ label:`BB${settings.bbWindow} Lower`, data:bb.lower, borderColor:palette.bbLine, pointRadius:0, borderWidth:1, tension:0.15, fill:{ target:'-1' }, backgroundColor:palette.bbFill })
    }

    if(toggles.hl52 && hiArr.length && loArr.length){
      datasets.push({ label:'52W High', data:hiArr, borderColor:palette.hi52, borderDash:[2,4], pointRadius:0, borderWidth:1.5, tension:0 })
      datasets.push({ label:'52W Low',  data:loArr, borderColor:palette.lo52, borderDash:[2,4], pointRadius:0, borderWidth:1.5, tension:0 })
    }
    if(toggles.band52 && hiArr.length && loArr.length){
      datasets.push({ label:'52W High (band)', data:hiArr, borderColor:'transparent', pointRadius:0, borderWidth:0, tension:0 })
      datasets.push({ label:'52W Low (band)',  data:loArr, borderColor:'transparent', pointRadius:0, borderWidth:0, tension:0, fill:{ target:'-1' }, backgroundColor:palette.band52 })
    }

    chartRef.current = new Chart(ctx, {
      type:'line',
      data:{ labels, datasets },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        spanGaps:true,
        animation:false,
        scales:{
          x:{ type:'time', grid:{ color:'rgba(255,255,255,0.08)' }, ticks:{ color:'#9fb3d0' } },
          y:{ beginAtZero:false, grid:{ color:'rgba(255,255,255,0.08)' }, ticks:{ color:'#9fb3d0' } }
        },
        plugins:{
          legend:{ labels:{ color:'#dbe7ff', boxWidth:18, boxHeight:2 } },
          tooltip:{ intersect:false, mode:'index' }
        }
      }
    })

    return ()=>{ if(chartRef.current) chartRef.current.destroy() }
  }, [symbol, computed, toggles, settings])

  return (
    <div className="chart" style={{ minHeight: 440 }}>
      <canvas ref={canvasRef} />
      {(!disp || !disp.points || disp.points.length===0) && <div className="nodata">No data</div>}
    </div>
  )
}
