// frontend/src/api.js
const API_ROOT = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, ''); // => '/api'

async function jget(path) {
  // path must start with '/', e.g. '/companies'
  const url = `${API_ROOT}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} on ${url} → ${txt || res.statusText}`);
  }
  return res.json();
}

export function fetchCompanies() {
  return jget('/companies');                 // NOT '/api/companies'
}
export function fetchQuote(symbol) {
  return jget(`/quote?symbol=${encodeURIComponent(symbol)}`);
}
export function fetchHistory(symbol, period) {
  return jget(`/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`);
}
