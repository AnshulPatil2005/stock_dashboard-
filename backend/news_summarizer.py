# backend/news_summarizer.py
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Tuple, Any, Annotated
import os, time, json, re, hashlib

try:
    from groq import Groq
except Exception:
    Groq = None  # optional dependency

router = APIRouter(prefix="/api", tags=["news"])

# --------- Schemas ----------
class NewsItem(BaseModel):
    title: str
    snippet: Optional[str] = None

NewsItemList = Annotated[List[NewsItem], Field(min_length=1, max_length=20)]

class NewsSummarizeIn(BaseModel):
    symbol: Optional[str] = None
    items: NewsItemList

class NewsSummarizeOut(BaseModel):
    bullets: List[str]
    sentiment: str  # "positive" | "neutral" | "negative"
    risk: str
    origin: str     # "llm" | "heuristic"

# --------- Small TTL cache (5 min) ----------
_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
TTL = 300.0

def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    row = _CACHE.get(key)
    if not row:
        return None
    exp, data = row
    if time.time() > exp:
        _CACHE.pop(key, None)
        return None
    return data

def _cache_set(key: str, data: Dict[str, Any]) -> None:
    _CACHE[key] = (time.time() + TTL, data)

# --------- Heuristic fallback ----------
_POS = {
    "beat","beats","growth","surge","up","rises","record","strong","profit",
    "upgrade","positive","gain","outperform"
}
_NEG = {
    "miss","misses","fall","falls","down","drop","weak","loss","downgrade",
    "negative","decline","probe","investigation","fraud","scam","ban"
}

def _simple_sentiment(text: str) -> str:
    t = text.lower()
    score = sum(w in t for w in _POS) - sum(w in t for w in _NEG)
    if score > 1:
        return "positive"
    if score < -1:
        return "negative"
    return "neutral"

def _heuristic_summary(payload: NewsSummarizeIn) -> Dict[str, Any]:
    joined = " ".join([(i.title or "") + " " + (i.snippet or "") for i in payload.items])
    sentiment = _simple_sentiment(joined)
    # Pick up to 3 concise bullets from titles/snippets
    bullets: List[str] = []
    for i in payload.items[:5]:
        if i.title:
            bullets.append(i.title.strip())
        if len(bullets) == 3:
            break
    if not bullets:
        bullets = ["No clear headlines provided."]
    risk = "Headlines may omit key context; verify with primary sources."
    return NewsSummarizeOut(
        bullets=bullets, sentiment=sentiment, risk=risk, origin="heuristic"
    ).model_dump()

def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None

# --------- Main endpoint ----------
@router.post("/news_summarize", response_model=NewsSummarizeOut)
def news_summarize(payload: NewsSummarizeIn):
    # Cache key on content
    key_src = "|".join([(i.title or "") + "::" + (i.snippet or "") for i in payload.items]) + (payload.symbol or "")
    key = hashlib.md5(key_src.encode()).hexdigest()
    cached = _cache_get(key)
    if cached:
        return cached

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or Groq is None:
        out = _heuristic_summary(payload)
        _cache_set(key, out)
        return out

    # Build compact prompt
    features = {
        "symbol": payload.symbol,
        "items": [{"title": i.title, "snippet": i.snippet} for i in payload.items],
    }
    prompt = (
        "You are a cautious markets assistant. Given recent headlines/snippets, write:\n"
        "- 3–5 concise bullets on the key themes and price-relevant info\n"
        "- A single short risk note (<= 18 words)\n"
        "- Classify overall sentiment as positive, neutral, or negative\n"
        "Return STRICT JSON only: "
        '{"bullets":["..."],"sentiment":"positive|neutral|negative","risk":"..."}\n'
        f"Data: {json.dumps(features, separators=(',',':'))}"
    )

    try:
        client = Groq(api_key=api_key)
        model = os.getenv("GROQ_MODEL", "llama3-8b-8192")
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {"role": "system", "content": "Output only valid JSON. Avoid advice; keep it concise."},
                {"role": "user", "content": prompt},
            ],
        )
        content = resp.choices[0].message.content or ""
        data = _extract_json(content) or {}
        bullets = [str(b).strip() for b in (data.get("bullets") or [])][:5] or ["No clear summary."]
        sentiment = (data.get("sentiment") or "neutral").lower()
        if sentiment not in ("positive", "neutral", "negative"):
            sentiment = "neutral"
        risk = data.get("risk") or "Consider data quality and recency."
        out = NewsSummarizeOut(
            bullets=bullets, sentiment=sentiment, risk=risk, origin="llm"
        ).model_dump()
        _cache_set(key, out)
        return out
    except Exception:
        out = _heuristic_summary(payload)
        _cache_set(key, out)
        return out
# ---------- LIVE FETCH (Google News RSS) ----------
import feedparser
from urllib.parse import quote_plus

def _guess_company(symbol: str) -> str:
    # Lightweight mapping for common tickers; extend as you like.
    # Fallback: strip .NS and return the core for query.
    m = {
        "AAPL": "Apple",
        "MSFT": "Microsoft",
        "GOOGL": "Google",
        "AMZN": "Amazon",
        "META": "Meta",
        "NVDA": "NVIDIA",
    }
    if symbol.upper() in m: return m[symbol.upper()]
    base = symbol.replace(".NS","").replace(".BSE","").replace("^","")
    return base

def _google_news_url(q: str, region: str = "IN", lang: str = "en") -> str:
    # Example: IN:en for India English; US:en for US English
    return f"https://news.google.com/rss/search?q={quote_plus(q)}&hl={lang}-{region}&gl={region}&ceid={region}:{lang}"

def _fetch_news_items(symbol: str, n: int = 10, region: str = "IN", lang: str = "en"):
    company = _guess_company(symbol)
    # Broaden query to pick finance-relevant results
    query = f"{company} ({symbol}) stock OR shares OR results"
    url = _google_news_url(query, region=region, lang=lang)
    feed = feedparser.parse(url)
    items = []
    for e in (feed.entries or [])[:max(1, min(n, 20))]:
        title = (getattr(e, "title", None) or "").strip()
        snippet = (getattr(e, "summary", None) or getattr(e, "description", None) or "").strip()
        if not title: 
            continue
        items.append(NewsItem(title=title, snippet=snippet))
    return items

@router.get("/news_summarize_live", response_model=NewsSummarizeOut)
def news_summarize_live(symbol: str, n: int = 10, region: str = "IN", lang: str = "en"):
    # Cache key separate from POST body cache
    key_src = f"live::{symbol}::{n}::{region}::{lang}"
    key = hashlib.md5(key_src.encode()).hexdigest()
    cached = _cache_get(key)
    if cached:
        return cached

    items = _fetch_news_items(symbol=symbol, n=n, region=region, lang=lang)
    if not items:
        # graceful fallback
        out = NewsSummarizeOut(
            bullets=["No recent headlines found."],
            sentiment="neutral",
            risk="Headlines unavailable or blocked; try again later.",
            origin="heuristic"
        ).model_dump()
        _cache_set(key, out)
        return out

    payload = NewsSummarizeIn(symbol=symbol, items=items)
    # Reuse your existing logic: try LLM else heuristic
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or Groq is None:
        out = _heuristic_summary(payload)
        _cache_set(key, out); return out

    # LLM path mirrors /news_summarize
    features = {
        "symbol": payload.symbol,
        "items": [{"title": i.title, "snippet": i.snippet} for i in payload.items]
    }
    prompt = (
        "You are a cautious markets assistant. Given recent headlines/snippets, write:\n"
        "- 3–5 concise bullets on key themes and price-relevant info\n"
        "- One short risk note (<= 18 words)\n"
        "- Overall sentiment: positive, neutral, or negative\n"
        "Return STRICT JSON only: "
        '{"bullets":["..."],"sentiment":"positive|neutral|negative","risk":"..."}\n'
        f"Data: {json.dumps(features, separators=(',',':'))}"
    )
    try:
        client = Groq(api_key=api_key)
        model = os.getenv("GROQ_MODEL", "llama3-8b-8192")
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {"role":"system","content":"Output only valid JSON. Avoid advice; keep it concise."},
                {"role":"user","content": prompt}
            ],
        )
        content = resp.choices[0].message.content or ""
        data = _extract_json(content) or {}
        bullets = [str(b).strip() for b in (data.get("bullets") or [])][:5] or ["No clear summary."]
        sentiment = (data.get("sentiment") or "neutral").lower()
        if sentiment not in ("positive","neutral","negative"):
            sentiment = "neutral"
        risk = data.get("risk") or "Consider data quality and recency."
        out = NewsSummarizeOut(bullets=bullets, sentiment=sentiment, risk=risk, origin="llm").model_dump()
        _cache_set(key, out)
        return out
    except Exception:
        out = _heuristic_summary(payload)
        _cache_set(key, out)
        return out
