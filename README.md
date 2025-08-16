# 📈 Stock Market Dashboard (FastAPI + React)

A clean, responsive **stock dashboard** with technical indicators, a trend panel, optional **AI chatbot**, and **news summarizer**.  
Works fully **offline** using local CSV data; you can also deploy the frontend to **Netlify** and the backend anywhere (Render/Railway/VM/Docker).

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Run Locally](#run-locally)


---

## Features

**UI / UX**
- Dark, responsive layout
- **Scrollable sidebar** with **search** (⌘/Ctrl + K)
- Timeframes: `1mo · 3mo · 6mo · 1y · 2y · 5y · max`
- Clear indicator toggles + “Clear” button

**Charts & Analytics**
- Line chart with **SMA/EMA** (primary/secondary), **Bollinger Bands**, **52-week High/Low** (line & band)
- Metrics: Last Close Δ/Δ%, 52-week position bar, Avg Volume (20D vs 1Y), **ATR(14)**, **MTD/YTD**, naive **next-day forecast**
- **Trend Card** (Heuristic + optional **AI**) with a final consensus label

**AI (optional)**
- Floating **chatbot** for symbol/timeframe Q&A (`/api/chat`)
- **News Summarizer** (live fetch from Google News RSS or pasted headlines) → bullets + sentiment + risk  
  (Falls back to heuristics if no API key)

---

## Architecture

- **Frontend**: React + Vite + Chart.js (served by Nginx in Docker or Netlify in static hosting)
- **Backend**: FastAPI + Pandas/NumPy; reads local CSVs from `backend/data/`
- **Communication**:
  - Local/dev: frontend calls backend via `/api/*` or `http://127.0.0.1:8000`
  - Docker: Nginx **proxies** `/api/*` → FastAPI
  - Netlify: either proxy `/api/*` to backend or set `VITE_API_URL` to full backend URL

---

## Prerequisites

- **Python** ≥ 3.10
- **Node.js** ≥ 18
- (Optional) **Docker** ≥ 24 / Docker Desktop
- (Optional) Groq API Key for LLM features (trend, chat, news)

---


---

## Run Locally

### 1) Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000


### 2) frontend

```bash
cd ../frontend
npm install
npm run dev


