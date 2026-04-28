import { useState, useEffect, useCallback } from 'react'

/**
 * useState backed by localStorage. Reads initial value from storage,
 * returns a setter that writes through to storage on every call.
 */
export function useLocalStorage(key, defaultValue) {
  const [value, setInner] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : defaultValue
    } catch { return defaultValue }
  })
  const setValue = useCallback(valOrFn => {
    setInner(prev => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }, [key])
  return [value, setValue]
}

/**
 * useState that persists its value to localStorage.
 * Key format: 'rm_panel_<name>'
 */
export function usePersistentOpen(key, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v != null ? JSON.parse(v) : defaultOpen
    } catch { return defaultOpen }
  })

  const toggle = () => {
    setOpen(prev => {
      const next = !prev
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const set = (val) => {
    setOpen(val)
    try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
  }

  return [open, toggle, set]
}

/**
 * Saves window.scrollY to localStorage on unmount, restores it on mount.
 * Key format: 'rm_scroll_<viewName>'
 */
export function useScrollRestore(key) {
  useEffect(() => {
    // Restore scroll position after first paint
    try {
      const saved = localStorage.getItem(key)
      if (saved != null) {
        const y = parseInt(saved, 10)
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }))
      }
    } catch {}

    // Save scroll position on unmount
    return () => {
      try { localStorage.setItem(key, String(Math.round(window.scrollY))) } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
