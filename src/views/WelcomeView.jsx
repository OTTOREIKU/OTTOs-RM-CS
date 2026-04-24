import React from 'react'
import { useCharacter } from '../store/CharacterContext.jsx'

export default function WelcomeView() {
  const { createCharacter } = useCharacter()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '70dvh', padding: '2rem', textAlign: 'center', gap: 16,
    }}>
      <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.04em', userSelect: 'none' }}>RM</div>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>Rolemaster Unified</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 300, lineHeight: 1.6 }}>
          Interactive character sheet — spells, skills, leveling, and reference tables.
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
