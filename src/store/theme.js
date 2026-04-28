// Theme store — persists to localStorage, applies CSS classes/styles to <html>/<body>

const NAV_POS_KEY    = 'rm_nav_pos'
const THEME_KEY      = 'rm_theme'
const ACCENT_KEY     = 'rm_accent'
const COLORBLIND_KEY = 'rm_colorblind'
const GRAYSCALE_KEY  = 'rm_grayscale'
const FLAT_BG_KEY    = 'rm_flat_bg'
const BOLD_UI_KEY    = 'rm_bold_ui'
const LARGE_TEXT_KEY = 'rm_large_text'

// ── Presets ───────────────────────────────────────────────────────────────────

export const ACCENT_PRESETS = [
  { label: 'Blue',    hex: '#4c8bf5' },
  { label: 'Indigo',  hex: '#6366f1' },
  { label: 'Purple',  hex: '#8b5cf6' },
  { label: 'Cyan',    hex: '#06b6d4' },
  { label: 'Teal',    hex: '#14b8a6' },
  { label: 'Green',   hex: '#22c55e' },
  { label: 'Orange',  hex: '#f97316' },
  { label: 'Rose',    hex: '#f43f5e' },
]

// Okabe-Ito colorblind-safe palette mapped to semantic UI roles
// Deuteranopia/Protanopia: both are red-green deficiencies → same safe palette
// Tritanopia: blue-yellow deficiency → different mapping
export const COLORBLIND_MODES = [
  { id: 'none',         label: 'None',         desc: 'Standard colors' },
  { id: 'deuteranopia', label: 'Deuteranopia',  desc: 'Red-green (green weak) · most common' },
  { id: 'protanopia',   label: 'Protanopia',    desc: 'Red-green (red weak)' },
  { id: 'tritanopia',   label: 'Tritanopia',    desc: 'Blue-yellow' },
]

const COLORBLIND_VARS = {
  // Okabe-Ito: blue accent, vermillion danger, teal success, orange-yellow warning, pink purple
  deuteranopia: {
    '--accent':     '#0072B2',
    '--accent-dim': '#004f80',
    '--danger':     '#D55E00',
    '--success':    '#009E73',
    '--warning':    '#E69F00',
    '--purple':     '#CC79A7',
  },
  protanopia: {
    '--accent':     '#0072B2',
    '--accent-dim': '#004f80',
    '--danger':     '#D55E00',
    '--success':    '#009E73',
    '--warning':    '#E69F00',
    '--purple':     '#CC79A7',
  },
  // Tritanopia: orange accent, pink danger, light-blue success, teal warning, vermillion purple
  tritanopia: {
    '--accent':     '#E69F00',
    '--accent-dim': '#b57800',
    '--danger':     '#CC79A7',
    '--success':    '#56B4E9',
    '--warning':    '#009E73',
    '--purple':     '#D55E00',
  },
}

// ── Nav position ──────────────────────────────────────────────────────────────

export function loadNavPos() {
  return localStorage.getItem(NAV_POS_KEY) || 'top'
}
export function saveNavPos(pos) {
  localStorage.setItem(NAV_POS_KEY, pos)
  window.dispatchEvent(new CustomEvent('rm-setting-change'))
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export function loadTheme() {
  const t = localStorage.getItem(THEME_KEY) || 'default'
  return t === 'dark' ? 'default' : t  // migrate legacy 'dark' value
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme, loadDisplaySettings())
}

// ── Display settings ──────────────────────────────────────────────────────────

export function loadDisplaySettings() {
  return {
    accent:     localStorage.getItem(ACCENT_KEY)     || '',
    colorblind: localStorage.getItem(COLORBLIND_KEY) || 'none',
    grayscale:  localStorage.getItem(GRAYSCALE_KEY)  === 'true',
    flatBg:     localStorage.getItem(FLAT_BG_KEY)    === 'true',
    boldUi:     localStorage.getItem(BOLD_UI_KEY)    === 'true',
    largeText:  localStorage.getItem(LARGE_TEXT_KEY) === 'true',
  }
}

export function saveDisplaySettings(patch) {
  const next = { ...loadDisplaySettings(), ...patch }
  if (patch.accent     !== undefined) localStorage.setItem(ACCENT_KEY,      next.accent)
  if (patch.colorblind !== undefined) localStorage.setItem(COLORBLIND_KEY,  next.colorblind)
  if (patch.grayscale  !== undefined) localStorage.setItem(GRAYSCALE_KEY,   String(next.grayscale))
  if (patch.flatBg     !== undefined) localStorage.setItem(FLAT_BG_KEY,     String(next.flatBg))
  if (patch.boldUi     !== undefined) localStorage.setItem(BOLD_UI_KEY,     String(next.boldUi))
  if (patch.largeText  !== undefined) localStorage.setItem(LARGE_TEXT_KEY,  String(next.largeText))
  applyTheme(loadTheme(), next)
}

// ── Apply ─────────────────────────────────────────────────────────────────────

const ALL_CLASSES = [
  'theme-light', 'theme-midnight', 'theme-high-contrast', 'theme-eink',
  'ui-bold', 'flat-bg',
  // legacy eink-specific classes — strip if still present from old localStorage
  'eink-bold', 'eink-large', 'eink-gray', 'eink-flatbg',
]

const CSS_VARS = [
  '--accent', '--accent-dim', '--danger', '--success', '--warning', '--purple',
  '--surface', '--surface2', '--bg',
]

export function applyTheme(theme, settings) {
  if (!settings) settings = loadDisplaySettings()
  const html = document.documentElement

  // 1. Strip all theme/modifier classes (including legacy)
  html.classList.remove(...ALL_CLASSES)

  // 2. Strip inline CSS variable overrides + filters
  CSS_VARS.forEach(v => html.style.removeProperty(v))
  document.body.style.removeProperty('filter')
  document.body.style.removeProperty('font-size')

  // 3. Apply base theme class ('default' uses :root variables — no class needed)
  if      (theme === 'light')          html.classList.add('theme-light')
  else if (theme === 'midnight')       html.classList.add('theme-midnight')
  else if (theme === 'high-contrast')  html.classList.add('theme-high-contrast')
  else if (theme === 'eink')           html.classList.add('theme-eink')

  // 4. Universal modifier classes
  if (settings.boldUi) html.classList.add('ui-bold')
  if (settings.flatBg) html.classList.add('flat-bg')

  // 5. Large text
  if (settings.largeText) document.body.style.fontSize = '16px'

  // 6. Colorblind palette — override semantic color CSS vars
  if (settings.colorblind && settings.colorblind !== 'none') {
    const vars = COLORBLIND_VARS[settings.colorblind]
    if (vars) Object.entries(vars).forEach(([k, v]) => html.style.setProperty(k, v))
  }

  // 7. Custom accent — applied AFTER colorblind so user's explicit choice wins
  if (settings.accent) {
    html.style.setProperty('--accent',     settings.accent)
    html.style.setProperty('--accent-dim', _darken(settings.accent, 30))
  }

  // 8. Grayscale — filter on <body> catches ALL rendered colors (CSS vars, SVG, images, borders)
  if (settings.grayscale) {
    document.body.style.setProperty('filter', 'grayscale(1)')
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _darken(hex, amount = 30) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

// Auto-apply persisted theme on module load (client only)
if (typeof document !== 'undefined') {
  applyTheme(loadTheme(), loadDisplaySettings())
}
