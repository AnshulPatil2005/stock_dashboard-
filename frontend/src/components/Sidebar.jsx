import React, { useEffect, useMemo, useRef, useState } from 'react'

export default function Sidebar({ companies = [], selected, onSelect }) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)

  // Scroll helpers
  const listRef = useRef(null)
  const itemRefs = useRef([])

  // Filtered list (case-insensitive)
  const list = useMemo(() => {
    if (!q.trim()) return companies
    const s = q.trim().toLowerCase()
    return companies.filter(t => t.toLowerCase().includes(s))
  }, [companies, q])

  // Reset cursor when query changes
  useEffect(() => setCursor(0), [q])

  // Keep highlighted row in view
  useEffect(() => {
    const el = itemRefs.current[cursor]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [cursor, list.length])

  // Global shortcuts: Ctrl/⌘+K or "/" focuses search
  useEffect(() => {
    const onKey = (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      const inField = tag === 'input' || tag === 'textarea'
      const slash = e.key === '/'
      const kCombo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      if (!inField && (slash || kCombo)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keyboard on the input: navigate list & pick with Enter
  const handleKeyDown = (e) => {
    if (!list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const choice = list[cursor]
      if (choice) onSelect(choice)
    } else if (e.key === 'Escape') {
      setQ('')
    }
  }

  // Highlight matched part of ticker
  const renderSymbol = (sym) => {
    if (!q) return sym
    const s = q.toLowerCase()
    const t = sym
    const i = t.toLowerCase().indexOf(s)
    if (i === -1) return t
    return (
      <>
        {t.slice(0, i)}
        <mark className="hl">{t.slice(i, i + s.length)}</mark>
        {t.slice(i + s.length)}
      </>
    )
  }

  return (
    <aside
      className="sidebar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden' // prevent double-scroll; inner container will scroll
      }}
    >
      <h2>Companies</h2>

      <div className="sidebar-search" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search symbol…  (Ctrl/⌘+K)"
          spellCheck={false}
        />
        {q && (
          <button
            className="search-clear"
            onClick={() => { setQ(''); inputRef.current?.focus() }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="search-meta">
        <span>{list.length}</span>
        <span className="muted"> / {companies.length}</span>
      </div>

      {/* Scrollable list container */}
      <div
        className="sidebar-list-scroll"
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
      >
        <ul className="list" role="listbox" aria-label="Company list">
          {list.map((sym, i) => {
            const isActive = sym === selected
            const isCursor = i === cursor
            return (
              <li
                key={sym}
                ref={el => (itemRefs.current[i] = el)}
                role="option"
                aria-selected={isActive}
                className={`item ${isActive ? 'active' : ''} ${isCursor ? 'cursor' : ''}`}
                onClick={() => onSelect(sym)}
                onMouseEnter={() => setCursor(i)}
                title={sym}
              >
                {renderSymbol(sym)}
              </li>
            )
          })}
        </ul>

        {!list.length && (
          <div className="empty" style={{ padding: '12px 14px' }}>
            No matches for <strong>{q}</strong>
          </div>
        )}
      </div>
    </aside>
  )
}
