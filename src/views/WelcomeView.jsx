import React from 'react'
import { useCharacter } from '../store/CharacterContext.jsx'
import { SwordsIcon } from '../components/Icons.jsx'

export default function WelcomeView() {
  const { createCharacter } = useCharacter()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '70dvh', padding: '2rem', textAlign: 'center', gap: 16,
    }}>
      <SwordsIcon size={48} color="var(--accent)" />
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>Rolemaster Unified</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 300, lineHeight: 1.6 }}>
          Interactive character sheet and reference tables.
        </p>
      </div>
      <button onClick={createCharacter} style={{
        background: 'var(--accent)', color: '#fff', border: 'none',
        borderRadius: 10, padding: '12px 28px', fontSize: 14,
        fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em',
      }}>
        Create Your First Character
      </button>
    </div>
  )
}
