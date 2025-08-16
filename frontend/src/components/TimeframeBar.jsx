import React from "react";

const PERIODS = ["1mo","3mo","6mo","1y","2y","5y","max"];

export default function TimeframeBar({ period, setPeriod, onRefresh }) {
  return (
    <div className="segbar">
      <div className="seg">
        {PERIODS.map(p => (
          <button
            key={p}
            className={`seg-item ${period === p ? "active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <button className="btn" onClick={onRefresh}>Refresh</button>
    </div>
  );
}
