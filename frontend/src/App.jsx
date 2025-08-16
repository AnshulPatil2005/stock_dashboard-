// frontend/src/App.jsx
import React, { useEffect, useState, useCallback } from 'react'
import { fetchCompanies, fetchQuote, fetchHistory } from './api'
import Sidebar from './components/Sidebar'
import Metrics from './components/Metrics'
import PriceChart from './components/PriceChart'
import IndicatorToggles from './components/IndicatorToggles'
import TimeframeBar from './components/TimeframeBar'
import Chatbot from './components/Chatbot'
import TrendCard from './components/TrendCard'
import NewsSummarizer from './components/NewsSummarizer' // ← added

// Visible periods (days) + helper to choose a longer "calc" period for indicators
const PERIOD_TO_DAYS = { '1mo':21,'3mo':63,'6mo':126,'1y':252,'2y':504,'5y':1260,'max':10000 }
const ORDER = ['1mo','3mo','6mo','1y','2y','5y','max']
function chooseCalcPeriod(period, neededDays){
  const days = PERIOD_TO_DAYS[period] || 126
  if (days >= neededDays) return period
  for (const p of ORDER) if ((PERIOD_TO_DAYS[p] || 0) >= neededDays) return p
  return 'max'
}

export default function App(){
  const [companies, setCompanies] = useState([])
  const [selected, setSelected] = useState(null)
  const [period, setPeriod] = useState('6mo')
  const [quote, setQuote] = useState(null)
  const [history, setHistory] = useState(null) // { display, calc } or null

  // Indicator toggles & settings (used by IndicatorToggles + PriceChart)
  const [toggles, setToggles] = useState({
    sma20:true, ema20:true,     // primary SMA/EMA
    sma50:false, ema50:false,   // secondary SMA/EMA
    bb20:false,                 // Bollinger Bands
    hl52:true, band52:false     // 52-week lines and shaded band
  })
  const [settings, setSettings] = useState({
    smaWindow:20, smaWindow2:50,
    emaWindow:20, emaWindow2:50,
    bbWindow:20, bbStd:2
  })

  // Load companies once
  useEffect(()=>{
    fetchCompanies()
      .then(list => {
        setCompanies(list || [])
        if (!selected && list && list.length) setSelected(list[0])
      })
      .catch(console.error)
  }, [])

  // Load quote + history every time symbol/period/settings change
  const loadAll = useCallback(()=>{
    if(!selected) return

    // Warm-up length so long SMAs render across short timeframes
    const needed = Math.max(
      settings.smaWindow, settings.smaWindow2,
      settings.emaWindow, settings.emaWindow2,
      settings.bbWindow,
      252 // for 52W overlays
    )
    const calcPeriod = chooseCalcPeriod(period, needed)

    Promise.all([
      fetchQuote(selected),
      fetchHistory(selected, period),     // display range
      fetchHistory(selected, calcPeriod)  // warm-up calc range
    ])
      .then(([q, disp, calc]) => {
        setQuote(q)
        setHistory({ display: disp, calc })
      })
      .catch(err => { console.error(err); setHistory(null) })
  }, [selected, period, settings])

  useEffect(()=>{ loadAll() }, [selected, period, loadAll])

  return (
    <div>
      <header className="header">
        <h1>📈 Stock Market Dashboard</h1>
        <TimeframeBar period={period} setPeriod={setPeriod} onRefresh={loadAll} />
      </header>

      <div className="layout">
        <Sidebar
          companies={companies}
          selected={selected}
          onSelect={setSelected}
        />

        <main className="content">
          <Metrics
            symbol={selected}
            quote={quote}
            hist={history?.display || history}
          />

          {/* Trend summary (Bullish / Bearish / Neutral) */}
          <TrendCard
            symbol={selected}
            hist={history?.display || history}
          />

          {/* Headline Summarizer (paste headlines → AI/heuristic summary) */}
          <NewsSummarizer symbol={selected} />

          <IndicatorToggles
            toggles={toggles}
            setToggles={setToggles}
            settings={settings}
            setSettings={setSettings}
          />

          <PriceChart
            symbol={selected}
            history={history}
            toggles={toggles}
            settings={settings}
          />

          {/* Floating AI chat (uses /api/chat; configure GROQ_API_KEY in backend/.env) */}
          <Chatbot symbol={selected} period={period} />
        </main>
      </div>
    </div>
  )
}
