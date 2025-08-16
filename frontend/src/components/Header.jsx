import React from 'react'

export default function Header({ period, setPeriod, onRefresh }){
  return (
    <header>
      <h1>📈 Stock Market Dashboard</h1>
      <div className="controls">
        <select value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="1mo">1mo</option>
          <option value="3mo">3mo</option>
          <option value="6mo">6mo</option>
          <option value="1y">1y</option>
          <option value="2y">2y</option>
          <option value="5y">5y</option>
          <option value="max">max</option>
        </select>
        <button onClick={onRefresh}>Refresh</button>
      </div>
    </header>
  )
}
