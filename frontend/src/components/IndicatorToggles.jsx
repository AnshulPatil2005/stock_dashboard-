import React from 'react'

export default function IndicatorToggles({ toggles, setToggles, settings, setSettings }){
  const toggle = k => () => setToggles(t => ({ ...t, [k]: !t[k] }))
  const setNum = k => e => setSettings(s => ({ ...s, [k]: Number(e.target.value) }))

  // NEW: clear all indicator overlays
  const clearAll = () => {
    // turn every toggle off without assuming specific keys
    const off = Object.fromEntries(Object.keys(toggles).map(k => [k, false]))
    setToggles(off)
  }

  return (
    <div className="toggles">
      <span className="toggles-title">Indicators</span>

      <button className={`chip ${toggles.sma20 ? 'on' : ''}`} onClick={toggle('sma20')}>SMA</button>
      <select className="chip-input" value={settings.smaWindow} onChange={setNum('smaWindow')}>
        {[10,20,50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <button className={`chip ${toggles.ema20 ? 'on' : ''}`} onClick={toggle('ema20')}>EMA</button>
      <select className="chip-input" value={settings.emaWindow} onChange={setNum('emaWindow')}>
        {[10,20,50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <button className={`chip ${toggles.sma50 ? 'on' : ''}`} onClick={toggle('sma50')}>SMA2</button>
      <select className="chip-input" value={settings.smaWindow2} onChange={setNum('smaWindow2')}>
        {[20,50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <button className={`chip ${toggles.ema50 ? 'on' : ''}`} onClick={toggle('ema50')}>EMA2</button>
      <select className="chip-input" value={settings.emaWindow2} onChange={setNum('emaWindow2')}>
        {[20,50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <button className={`chip ${toggles.bb20 ? 'on' : ''}`} onClick={toggle('bb20')}>BB</button>
      <select className="chip-input" value={settings.bbWindow} onChange={setNum('bbWindow')}>
        {[10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <select className="chip-input" value={settings.bbStd} onChange={setNum('bbStd')}>
        {[1,2,3].map(n => <option key={n} value={n}>{n}σ</option>)}
      </select>

      <span className="sep" />

      <button className={`chip ${toggles.hl52 ? 'on' : ''}`} onClick={toggle('hl52')}>52W Hi/Lo</button>
      <button className={`chip ${toggles.band52 ? 'on' : ''}`} onClick={toggle('band52')}>52W Band</button>

      {/* NEW: Clear button on the far right */}
      <span className="sep" />
      <button className="btn" onClick={clearAll} title="Hide all overlays">Clear</button>
    </div>
  )
}
