# backend/chatbot.py
from __future__ import annotations
import os
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv
from pathlib import Path

import numpy as np
import pandas as pd
from pydantic import BaseModel
from fastapi import APIRouter, Body, HTTPException
from groq import Groq  # pip install groq
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")  # loads backend/.env

router = APIRouter(prefix="/api", tags=["chat"])

# Resolve paths relative to this file (same folder as main.py)
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

PERIOD_TO_DAYS = {
    "1mo": 21, "3mo": 63, "6mo": 126,
    "1y": 252, "2y": 504, "5y": 1260, "max": 10000
}

class ChatRequest(BaseModel):
    symbol: str
    period: str = "6mo"
    messages: List[Dict[str, Any]] = []

# --- local helpers (kept here to avoid circular imports) ---
def load_csv(symbol: str) -> pd.DataFrame:
    path = DATA_DIR / f"{symbol.replace('^','_')}.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No mock dataset for {symbol}")
    df = pd.read_csv(path, parse_dates=["Date"]).sort_values("Date")
    return df

def slice_period(df: pd.DataFrame, period: str) -> pd.DataFrame:
    n = PERIOD_TO_DAYS.get(period, 126)
    return df.tail(n)

def calc_chat_summary(symbol: str, period: str) -> str:
    df = load_csv(symbol)
    disp = slice_period(df, period)
    if disp.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol} in period {period}")

    last = disp.iloc[-1]
    prev = disp.iloc[-2] if len(disp) > 1 else None

    last_close = float(last["Close"])
    prev_close = float(prev["Close"]) if prev is not None else None
    change = (last_close - prev_close) if prev_close is not None else None
    change_pct = (change / prev_close * 100) if (change is not None and prev_close) else None

    year = df.tail(252) if len(df) >= 252 else df
    hi_52 = float(year["High"].max()) if len(year) else None
    lo_52 = float(year["Low"].min()) if len(year) else None
    avg_vol = float(year["Volume"].mean()) if len(year) else None

    s20 = float(disp["Close"].rolling(20).mean().iloc[-1]) if len(disp) >= 20 else None
    s50 = float(disp["Close"].rolling(50).mean().iloc[-1]) if len(disp) >= 50 else None

    lines = [
        f"Symbol: {symbol.upper()}  Period: {period}",
        f"Last close: {last_close:.2f}" + (f"  Change: {change:+.2f} ({change_pct:+.2f}%)" if change_pct is not None else ""),
        f"52W High: {hi_52 if hi_52 is not None else '—'}  52W Low: {lo_52 if lo_52 is not None else '—'}",
        f"Avg Vol (1y): {int(avg_vol):,}" if avg_vol is not None else "Avg Vol (1y): —",
        f"SMA20: {s20:.2f}" if s20 is not None else "SMA20: —",
        f"SMA50: {s50:.2f}" if s50 is not None else "SMA50: —",
    ]
    return "\n".join(lines)

# --- Chat endpoint using Groq (free-tier friendly) ---
@router.post("/chat")
async def chat(req: ChatRequest = Body(...)):
    summary = calc_chat_summary(req.symbol, req.period)

    system_prompt = (
        "You are a helpful stock dashboard assistant. "
        "Use ONLY the provided summary as factual context from local CSVs. "
        "Be concise, educational, and avoid investment advice. "
        "If asked for predictions, discuss scenarios and risks.\n\n"
        f"### Data Summary\n{summary}\n"
    )

    from groq.types.chat import ChatCompletionMessageParam

    msgs: list[ChatCompletionMessageParam] = [
        {"role": "system", "content": system_prompt}
    ]
    for m in (req.messages or [])[-12:]:
        if isinstance(m, dict) and "role" in m and "content" in m:
            msgs.append({"role": m["role"], "content": str(m["content"])})
    if not any(m["role"] == "user" for m in msgs[1:]):
        msgs.append({"role": "user", "content": f"Tell me about {req.symbol}."})

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {
            "answer": "GROQ_API_KEY is not set. Here’s a data-driven summary:\n\n" + summary
        }

    client = Groq(api_key=api_key)
    model = os.getenv("GROQ_MODEL", "llama3-8b-8192")
    resp = client.chat.completions.create(model=model, messages=msgs, temperature=0.2)
    answer = resp.choices[0].message.content
    return {"answer": answer}
# --- AI Trend endpoint -------------------------------------------------------
from typing import Optional
from pydantic import BaseModel
import json, re, math

class TrendAIOut(BaseModel):
    label: str           # 'Bullish' | 'Bearish' | 'Neutral'
    confidence: int      # 0-100
    reasoning: str       # short sentence
    origin: str = "llm"  # 'llm' | 'heuristic'

def _sma(arr, n):
    if len(arr) < n: return None
    s = 0; out = [None]*len(arr)
    for i, v in enumerate(arr):
        s += v
        if i >= n: s -= arr[i-n]
        if i >= n-1: out[i] = s/n
    return out

def _slope(arr, n):
    if len(arr) < n: return None
    start = len(arr)-n
    sx=sy=sxx=sxy=0.0
    for i in range(n):
        x=i; y=arr[start+i]
        sx+=x; sy+=y; sxx+=x*x; sxy+=x*y
    denom = n*sxx - sx*sx
    if denom == 0: return None
    return (n*sxy - sx*sy)/denom

def _heuristic_trend(closes: list[float]) -> TrendAIOut:
    # Same spirit as your TrendCard rules; produces a deterministic fallback
    if not closes or len(closes) < 20:
        return TrendAIOut(label="Neutral", confidence=0, reasoning="Not enough data", origin="heuristic")
    last = closes[-1]
    sma20 = (_sma(closes,20) or [None])[-1]
    sma50 = (_sma(closes,50) or [None])[-1]
    sma200 = (_sma(closes,200) or [None])[-1]
    slope20 = _slope(closes, min(20, len(closes))) or 0
    slope50 = _slope(closes, 50) or 0 if len(closes) >= 50 else 0

    checks = []
    if sma20 is not None: checks.append(last > sma20)
    if sma20 is not None and sma50 is not None: checks.append(sma20 > sma50)
    if sma50 is not None and sma200 is not None: checks.append(sma50 > sma200)
    checks.append(slope20 > 0)
    if len(closes) >= 50: checks.append(slope50 >= 0)

    score = sum(1 if ok else -1 for ok in checks)
    maxs = len(checks)
    if score >= math.ceil(maxs*0.6):
        label = "Bullish"
    elif score <= -math.ceil(maxs*0.6):
        label = "Bearish"
    else:
        label = "Neutral"
    conf = int(round(abs(score)/maxs * 100))
    why = "Heuristic based on SMAs and recent slopes."
    return TrendAIOut(label=label, confidence=conf, reasoning=why, origin="heuristic")

def _extract_json(text: str) -> Optional[dict]:
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r'\{.*\}', text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None

@router.get("/trend_ai")
async def trend_ai(symbol: str, period: str = "6mo") -> dict:
    df = load_csv(symbol)
    disp = slice_period(df, period)
    if disp.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol} in period {period}")
    closes = [float(x) for x in disp["Close"].tolist()]

    # Heuristic as a safety net or if no key
    fallback = _heuristic_trend(closes)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return fallback.model_dump()

    # Build a compact feature summary for the LLM (no raw time series needed)
    def last_or(arr, n): 
        a = _sma(closes, n); return (a[-1] if a else None)
    features = {
        "last_close": closes[-1],
        "sma20": last_or(closes,20),
        "sma50": last_or(closes,50),
        "sma200": last_or(closes,200),
        "slope20": _slope(closes, min(20, len(closes))),
        "slope50": _slope(closes, 50) if len(closes) >= 50 else None,
        "roc_5": (closes[-1]/closes[-6]-1)*100 if len(closes)>=6 else None,
        "roc_20": (closes[-1]/closes[-21]-1)*100 if len(closes)>=21 else None,
        "above_sma20": (closes[-1] > (last_or(closes,20) or closes[-1])),
        "stacked_sma": ((last_or(closes,20) or 0) > (last_or(closes,50) or 0) > (last_or(closes,200) or 0)) if len(closes)>=200 else None
    }

    prompt = (
        "You are given technical features for a stock's recent history.\n"
        "Classify the CURRENT trend as one of exactly: Bullish, Bearish, or Neutral.\n"
        "Use ONLY the provided features; do not assume future events or news.\n"
        "Return STRICT JSON with keys: label (Bullish|Bearish|Neutral), confidence (0-100 int), reasoning (short, <= 20 words).\n"
        "JSON only, no extra text.\n"
        f"Features: {json.dumps(features, separators=(',',':'))}"
    )

    try:
        client = Groq(api_key=api_key)
        model = os.getenv("GROQ_MODEL", "llama3-8b-8192")
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {"role":"system","content":"You are a precise classifier. Output only valid JSON."},
                {"role":"user","content": prompt}
            ]
        )
        content = resp.choices[0].message.content
        data = _extract_json(content or "") or {}
        label = str(data.get("label","")).strip().title()
        conf  = int(data.get("confidence", 0))
        reason= str(data.get("reasoning","")).strip()
        if label not in ("Bullish","Bearish","Neutral"):
            raise ValueError("bad label")
        conf = max(0, min(100, conf))
        return TrendAIOut(label=label, confidence=conf, reasoning=reason or "LLM analysis.", origin="llm").model_dump()
    except Exception:
        # Fall back gracefully
        return fallback.model_dump()
