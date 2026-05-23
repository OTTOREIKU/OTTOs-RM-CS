// Reusable in-app confirmation dialog. Matches the app's UI tokens and the
// existing NotebookView confirm-dialog visual pattern.
//
// Two ways to use:
//
// 1) useConfirm() hook (recommended) — async/await pattern:
//
//      const [confirm, confirmEl] = useConfirm()
//      ...
//      if (!(await confirm('Delete this?', { confirmLabel: 'Delete', dangerous: true }))) return
//      // proceed with deletion
//      ...
//      return (
//        <>
//          ...
//          {confirmEl}
//        </>
//      )
//
// 2) Imperative <ConfirmModal /> render — pass props directly.

import React, { useCallback, useRef, useState } from 'react'

export default function ConfirmModal({
  open = true,
  title = null,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  dangerous    = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null
  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          padding: '24px 28px', maxWidth: 380, width: '90vw',
          fontSize: 14, color: 'var(--text)', lineHeight: 1.5,
        }}
      >
        {title && (
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            {title}
          </div>
        )}
        <div style={{ whiteSpace: 'pre-wrap', marginBottom: 20 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border2)',
              background: 'var(--surface2)', color: 'var(--text2)', fontSize: 13,
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              padding: '7px 18px', borderRadius: 8, border: 'none',
              background: dangerous ? 'var(--danger)' : 'var(--accent)',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * Async hook — returns [confirm, modalEl].
 * `confirm(message, options?)` returns Promise<boolean>.
 * Render `modalEl` near the component root.
 */
export function useConfirm() {
  const [state, setState] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback((message, options = {}) => {
    return new Promise(resolve => {
      resolverRef.current = resolve
      setState({ message, ...options })
    })
  }, [])

  const close = useCallback((result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setState(null)
    if (resolve) resolve(result)
  }, [])

  const modalEl = state ? (
    <ConfirmModal
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      dangerous={state.dangerous}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null

  return [confirm, modalEl]
}
