// frontend/src/api.js
// Minimal, robust API client for the dashboard.
// Works with Netlify proxy (`/api/*`) OR a full URL via VITE_API_URL.
// ⚠️ Do NOT include "/api" in the per-endpoint paths below.

const API_ROOT = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/+$/, ""); // '/api' by default
const DEFAULT_TIMEOUT_MS = 20000;

/** Helper: build URL with query params */
function buildURL(path, params) {
  if (!path.startsWith("/")) path = `/${path}`;
  const url = new URL(API_ROOT + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

/** Core request with JSON handling, timeout & nice errors */
async function request(path, { method = "GET", params, body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timeout", "TimeoutError")), timeoutMs);

  // allow caller-supplied signal to abort our controller too
  if (signal) {
    const onAbort = () => controller.abort(signal.reason || new DOMException("Aborted", "AbortError"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const url = buildURL(path, params);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Accept": "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const ct = res.headers.get("content-type") || "";
    const isJSON = ct.includes("application/json");

    if (!res.ok) {
      const msg = isJSON ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
      const detail = typeof msg === "string" ? msg : (msg.detail || JSON.stringify(msg));
      throw new Error(`HTTP ${res.status} ${res.statusText} on ${url} → ${detail || "Request failed"}`);
    }

    return isJSON ? res.json() : res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------ Public API wrappers ------------------ */

/** List available symbols from backend data */
export function fetchCompanies(opts) {
  return request("/companies", opts);
}

/** Latest quote snapshot */
export function fetchQuote(symbol, opts) {
  return request("/quote", { params: { symbol }, ...opts });
}

/** Historical candles (mock CSV backend) */
export function fetchHistory(symbol, period = "6mo", opts) {
  return request("/history", { params: { symbol, period }, ...opts });
}

/** Optional: AI trend classification (backend provides /api/trend_ai) */
export function fetchTrendAI(symbol, period = "6mo", opts) {
  return request("/trend_ai", { params: { symbol, period }, ...opts });
}

/** Optional: Chatbot endpoint */
export function chat({ message, symbol, period }, opts) {
  return request("/chat", {
    method: "POST",
    body: { message, symbol, period },
    ...opts,
  });
}

/** Optional: Summarize pasted news items */
export function newsSummarize({ symbol, items }, opts) {
  return request("/news_summarize", {
    method: "POST",
    body: { symbol, items },
    ...opts,
  });
}

/** Optional: Live fetch + summarize headlines (server pulls feeds) */
export function newsSummarizeLive({ symbol, n = 10, region = "US", lang = "en" }, opts) {
  return request("/news_summarize_live", {
    params: { symbol, n, region, lang },
    ...opts,
  });
}

/* Utilities (optional exports) */
export { API_ROOT, DEFAULT_TIMEOUT_MS, request };
