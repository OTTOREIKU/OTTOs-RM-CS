// Theme store — persists to localStorage, applies CSS class to <html>

const THEME_KEY       = 'rm_theme'
const EINK_ACCENT_KEY = 'rm_eink_accent'
const EINK_BOLD_KEY   = 'rm_eink_bold'
const EINK_LARGE_KEY  = 'rm_eink_large'

export const EINK_ACCENT_PRESETS = [
  { label: 'Navy',     hex: '#1a4fa3' },
  { label: 'Teal',     hex: '#006e6e' },
  { label: 'Forest',   hex: '#1a6b2e' },
  { label: 'Burgundy', hex: '#8b1a1a' },
  { label: 'Plum',     hex: '#6a1a8b' },
  { label: 'Slate',    hex: '#2d3a4a' },
]

export function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark'
}

export function loadEinkSettings() {
  return {
    accent: localStorage.getItem(EINK_ACCENT_KEY) || '#1a4fa3',
    bold:   localStorage.getItem(EINK_BOLD_KEY)   === 'true',
    large:  localStorage.getItem(EINK_LARGE_KEY)  === 'true',
  }
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

export function saveEinkSettings(settings) {
  localStorage.setItem(EINK_ACCENT_KEY, settings.accent)
  localStorage.setItem(EINK_BOLD_KEY,   String(settings.bold))
  localStorage.setItem(EINK_LARGE_KEY,  String(settings.large))
  if (loadTheme() === 'eink') applyTheme('eink')
}

export function applyTheme(theme) {
  const html = document.documentElement
  html.classList.remove('theme-light', 'theme-eink', 'eink-bold', 'eink-large')
  html.style.removeProperty('--accent')
  html.style.removeProperty('--accent-dim')

  if (theme === 'light') {
    html.classList.add('theme-light')
  } else if (theme === 'eink') {
    const s = loadEinkSettings()
    html.classList.add('theme-eink')
    if (s.bold)  html.classList.add('eink-bold')
    if (s.large) html.classList.add('eink-large')
    html.style.setProperty('--accent',     s.accent)
    html.style.setProperty('--accent-dim', _darken(s.accent, 30))
    html.style.setProperty('--danger',     '#cc0000')
    html.style.setProperty('--success',    '#006622')
    html.style.setProperty('--purple',     '#660099')
  }
}

function _darken(hex, amount = 30) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
