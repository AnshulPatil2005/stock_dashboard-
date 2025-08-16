# backend/main.py
from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from typing import List
import pandas as pd
import numpy as np
from fastapi.middleware.cors import CORSMiddleware
import os
from pydantic import BaseModel
from fastapi import Body
from groq import Groq
from chatbot import router as chatbot_router  # Import the chatbot router
from news_summarizer import router as news_router

# --- FastAPI setup ---
app = FastAPI(title="Stock Dashboard (Mock Only)")
app.include_router(chatbot_router)  # Include the chatbot API router
app.include_router(news_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173","https://stockdashboard2011.netlify.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Absolute paths ---
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
DATA_DIR = BASE_DIR / "data"

# Ensure folders exist
STATIC_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# --- Fallback list (used only if /data is empty) ---
FALLBACK_TICKERS = [
    "AAPL","MSFT","NVDA","GOOGL","AMZN","TSLA","META","NFLX","AMD","INTC",
    "IBM","ORCL","ADBE","SAP","AVGO"
]

PERIOD_TO_DAYS = {
    "1mo": 21, "3mo": 63, "6mo": 126, "1y": 252, "2y": 504, "5y": 1260, "max": 10_000
}

# --- Utilities ---
def available_symbols() -> list[str]:
    """Return tickers based on CSV files present in /data (case-insensitive)."""
    files = list(DATA_DIR.glob("*.csv")) + list(DATA_DIR.glob("*.CSV"))
    syms = [p.stem.replace('_','^') for p in files]  # map "_" back to "^" if you used that convention
    syms = sorted(set(syms))
    return syms or FALLBACK_TICKERS  # fallback only when folder is empty

def load_csv(symbol: str) -> pd.DataFrame:
    path = DATA_DIR / f"{symbol.replace('^','_')}.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No mock dataset for {symbol}")
    try:
        df = pd.read_csv(path, parse_dates=["Date"]).sort_values("Date")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read {path.name}: {e}")
    # basic header validation
    need = {"Open","High","Low","Close","Volume"}
    if not need.issubset(df.columns):
        raise HTTPException(status_code=400, detail=f"Bad columns in {path.name}. Need {sorted(need)}")
    return df

def slice_period(df: pd.DataFrame, period: str) -> pd.DataFrame:
    n = PERIOD_TO_DAYS.get(period, 126)
    return df.tail(n)

def df_to_points(df: pd.DataFrame):
    return [
        {
            "t": int(pd.Timestamp(row["Date"]).timestamp() * 1000),
            "o": float(row["Open"]),
            "h": float(row["High"]),
            "l": float(row["Low"]),
            "c": float(row["Close"]),
            "v": float(row["Volume"]),
        }
        for _, row in df.iterrows()
    ]

def compute_indicators(points, sma_window=20, ema_window=20):
    closes = [p["c"] for p in points]
    # SMA
    sma = []
    for i in range(len(closes)):
        if i + 1 < sma_window:
            sma.append(None)
        else:
            sma.append(float(np.mean(closes[i + 1 - sma_window:i + 1])))
    # EMA
    ema = []
    k = 2 / (ema_window + 1)
    prev = None
    for c in closes:
        if prev is None:
            prev = c
        else:
            prev = c * k + prev * (1 - k)
        ema.append(float(prev))
    return sma, ema

def stats_52w_full(df_full: pd.DataFrame):
    """Compute 52-week stats from the full dataset (last 252 rows)."""
    last = df_full.tail(252)
    if last.empty:
        return None, None, None
    return (
        float(last["High"].max()),
        float(last["Low"].min()),
        float(last["Volume"].mean())
    )

def naive_next_day_forecast(points):
    N = min(60, len(points))
    if N < 5:
        return None
    closes = np.array([p["c"] for p in points][-N:])
    x = np.arange(N)
    slope, intercept = np.polyfit(x, closes, 1)
    return float(intercept + slope * N)

# --- Routes ---
@app.get("/")
async def home(request: Request):
    tickers = available_symbols()
    return templates.TemplateResponse("index.html", {"request": request, "tickers": tickers})

@app.get("/api/companies")
async def companies() -> List[str]:
    # Dynamic: list whatever CSVs are present (fallback if none)
    return available_symbols()

# --- API: history & quote (mock-only) ---
@app.get("/api/history")
async def history(symbol: str = Query(...), period: str = Query("6mo")):
    df_full = load_csv(symbol)
    df = slice_period(df_full, period)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol} in mock CSV")
    points = df_to_points(df)
    sma, ema = compute_indicators(points)
    high52, low52, avg_vol = stats_52w_full(df_full)  # ← compute from full data
    forecast = naive_next_day_forecast(points)
    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": "1d",
        "points": points,
        "indicators": {"sma20": sma, "ema20": ema},
        "stats": {"high_52w": high52, "low_52w": low52, "avg_volume_1y": avg_vol},
        "prediction": {"next_day_close_forecast": forecast}
    }

@app.get("/api/quote")
async def quote(symbol: str = Query(...)):
    df = load_csv(symbol)
    if len(df) == 0:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else None
    last_close = float(last["Close"])
    previous_close = float(prev["Close"]) if prev is not None else None
    change = (last_close - previous_close) if previous_close is not None else None
    change_pct = (change / previous_close * 100) if (change is not None and previous_close) else None
    return {
        "symbol": symbol.upper(),
        "last_close": last_close,
        "previous_close": previous_close,
        "change": change,
        "change_pct": change_pct,
        "currency": None,
        "exchange": None,
        "market_cap": None
    }
