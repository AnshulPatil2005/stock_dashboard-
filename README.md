# 📈 Stock Market Dashboard (FastAPI + React)

A clean, responsive **stock dashboard** with technical indicators, a trend panel, optional **AI chatbot**, and **news summarizer**.  
Works fully **offline** using local CSV data; deploy the frontend on **Netlify/Vercel** and the backend on **Railway/Render/Docker/VM**.

---

## Table of Contents
1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Project Structure](#project-structure)
5. [Run Locally](#run-locally)
6. [API Contract](#api-contract)
7. [CSV Data Format](#csv-data-format)
8. [Environment Variables](#environment-variables)
9. [Deploy (Netlify + Railway)](#deploy-netlify--railway)
10. [Troubleshooting](#troubleshooting)
11. [License](#license)

---

## Features

**UI / UX**
- Dark, responsive layout
- **Scrollable sidebar** with **search** (⌘/Ctrl + K)
- Timeframes: `1mo · 3mo · 6mo · 1y · 2y · 5y · max`
- Indicator toggles + **Clear indicators** button

**Charts & Analytics**
- Line chart with **SMA/EMA** (primary/secondary), **Bollinger Bands**, **52-week High/Low** (line & shaded band)
- Metrics: Last Close Δ/Δ%, 52-week position, Avg Volume (20D vs 1Y), ATR(14), MTD/YTD, naive **next-day forecast**
- **Trend Card**: Heuristic + optional **AI** consensus (Bullish/Neutral/Bearish)

**AI (optional)**
- Floating **chatbot** for symbol/timeframe Q&A (`/api/chat`)
- **News Summarizer** (live fetch from Google News RSS or pasted headlines) → bullets + sentiment + risk  
  (Falls back to heuristics if no API key)

---

## Architecture

- **Frontend**: React + Vite + Chart.js  
  (Static build; can be served by Netlify/Vercel or Nginx)
- **Backend**: FastAPI + Pandas/NumPy; reads local CSVs from `backend/data/`
- **Communication**:
  - Local/dev: Vite dev proxy → `http://127.0.0.1:8000`
  - Production: Either **proxy** `/api/*` on the host (e.g., Netlify) → backend, or set `VITE_API_URL` to the backend’s full URL

---

## Prerequisites

- **Python** ≥ 3.10
- **Node.js** ≥ 18
- (Optional) **Docker** ≥ 24 / Docker Desktop
- (Optional) **Groq API key** for LLM features (chat, trend AI, news)

---



