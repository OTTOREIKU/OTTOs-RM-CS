// Theme store — persists to localStorage, applies CSS class to <html>

const THEME_KEY         = 'rm_theme'
const EINK_ACCENT_KEY   = 'rm_eink_accent'
const EINK_BOLD_KEY     = 'rm_eink_bold'
const EINK_LARGE_KEY    = 'rm_eink_large'
const EINK_GRAY_KEY     = 'rm_eink_gray'
const EINK_FLATBG_KEY   = 'rm_eink_flatbg'

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
    accent:  localStorage.getItem(EINK_ACCENT_KEY) || '#1a4fa3',
    bold:    localStorage.getItem(EINK_BOLD_KEY)   === 'true',
    large:   localStorage.getItem(EINK_LARGE_KEY)  === 'true',
    gray:    localStorage.getItem(EINK_GRAY_KEY)   === 'true',
    flatBg:  localStorage.getItem(EINK_FLATBG_KEY) === 'true',
  }
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

export function saveEinkSettings(settings) {
  localStorage.setItem(EINK_ACCENT_KEY,  settings.accent)
  localStorage.setItem(EINK_BOLD_KEY,    String(settings.bold))
  localStorage.setItem(EINK_LARGE_KEY,   String(settings.large))
  localStorage.setItem(EINK_GRAY_KEY,    String(settings.gray))
  localStorage.setItem(EINK_FLATBG_KEY,  String(settings.flatBg))
  if (loadTheme() === 'eink') applyTheme('eink')
}

export function applyTheme(theme) {
  const html = document.documentElement

  // 1. Remove all theme classes
  html.classList.remove('theme-light', 'theme-eink', 'eink-bold', 'eink-large', 'eink-gray', 'eink-flatbg')

  // 2. Remove all inline CSS variables that we may have set
  const VARS = ['--accent', '--accent-dim', '--danger', '--success', '--warning', '--purple',
                '--surface', '--surface2', '--bg']
  VARS.forEach(v => html.style.removeProperty(v))

  // 3. Reset body font size (applied by JS for large-text mode)
  document.body.style.removeProperty('font-size')

  if (theme === 'light') {
    html.classList.add('theme-light')
  } else if (theme === 'eink') {
    const s = loadEinkSettings()
    html.classList.add('theme-eink')
    if (s.bold)  html.classList.add('eink-bold')

    // Apply font size via JS — more reliable than a CSS class rule
    if (s.large) document.body.style.fontSize = '16px'

    // Base eink color palette
    html.style.setProperty('--accent',     s.accent)
    html.style.setProperty('--accent-dim', _darken(s.accent, 30))
    html.style.setProperty('--danger',     '#cc0000')
    html.style.setProperty('--success',    '#006622')
    html.style.setProperty('--warning',    '#996600')
    html.style.setProperty('--purple',     '#660099')

    // Grayscale: override CSS vars AND add class for CSS filter rules
    if (s.gray) {
      html.classList.add('eink-gray')
      html.style.setProperty('--accent',     '#111111')
      html.style.setProperty('--accent-dim', '#000000')
      html.style.setProperty('--danger',     '#111111')
      html.style.setProperty('--success',    '#444444')
      html.style.setProperty('--warning',    '#333333')
      html.style.setProperty('--purple',     '#333333')
    }

    // Flat backgrounds: override CSS vars AND add class for extra rules
    if (s.flatBg) {
      html.classList.add('eink-flatbg')
      html.style.setProperty('--surface',  '#ffffff')
      html.style.setProperty('--surface2', '#ffffff')
      html.style.setProperty('--bg',       '#ffffff')
    }
  }
}

function _darken(hex, amount = 30) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
