// Flat SVG icon components — consistent rendering across all platforms/browsers.
// Use these instead of emoji or Unicode symbols anywhere in the app.
// All icons accept `size` (default 14) and `color` (default 'currentColor') props.

function Icon({ size = 14, color = 'currentColor', children, viewBox = '0 0 24 24', style }) {
  return (
    <svg
      width={size} height={size} viewBox={viewBox}
      fill="none" stroke={color} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  )
}

export function LockIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <rect x="5" y="11" width="14" height="10" rx="2" fill={color} stroke="none" opacity="0.9" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeWidth={2} />
    </Icon>
  )
}

export function UnlockIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <rect x="5" y="11" width="14" height="10" rx="2" fill={color} stroke="none" opacity="0.6" />
      <path d="M8 11V7a4 4 0 0 1 8 0" strokeWidth={2} />
    </Icon>
  )
}

export function PencilIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Icon>
  )
}

export function PlusIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  )
}

export function XIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  )
}

export function ChevronDownIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  )
}

export function ChevronUpIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polyline points="18 15 12 9 6 15" />
    </Icon>
  )
}

export function ChevronRightIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polyline points="9 18 15 12 9 6" />
    </Icon>
  )
}

export function SwordsIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      {/* Sword 1: tip top-left → pommel bottom-right */}
      <line x1="4" y1="4" x2="20" y2="20" />
      <line x1="5" y1="11" x2="11" y2="5" />
      {/* Sword 2: tip top-right → pommel bottom-left */}
      <line x1="20" y1="4" x2="4" y2="20" />
      <line x1="13" y1="5" x2="19" y2="11" />
    </svg>
  )
}

export function NoteIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </Icon>
  )
}

export function CircleIcon({ size = 24, color = 'currentColor', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7" />
    </svg>
  )
}

export function TrashIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Icon>
  )
}

export function FolderIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </Icon>
  )
}

export function FolderOpenIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="8" y1="13" x2="16" y2="13" strokeWidth={1.5} opacity="0.6" />
    </Icon>
  )
}

export function PinIcon({ size, color, filled = false }) {
  return (
    <Icon size={size} color={color}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"
        fill={filled ? color : 'none'} />
    </Icon>
  )
}

export function DotsHIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <circle cx="5"  cy="12" r="1.2" fill={color} stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill={color} stroke="none" />
    </Icon>
  )
}

export function FileIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </Icon>
  )
}

export function CalendarIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </Icon>
  )
}

export function StarIcon({ size = 14, color = 'currentColor', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? color : 'none'} stroke={color} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export function GearIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </Icon>
  )
}

// ── Navigation tab icons ─────────────────────────────────────────────────────

export function UserIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  )
}

export function BarChartIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </Icon>
  )
}

export function ZapIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Icon>
  )
}

export function PackageIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </Icon>
  )
}

export function BookOpenIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Icon>
  )
}

export function TrendingUpIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </Icon>
  )
}

export function BookIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Icon>
  )
}

// ── Utility icons ────────────────────────────────────────────────────────────

/** Floppy-disk save icon — flat/monochrome, no color emoji */
export function SaveIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </Icon>
  )
}

/** Hamburger / menu icon — three horizontal lines */
export function MenuIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Icon>
  )
}

export function ChevronLeftIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polyline points="15 18 9 12 15 6" />
    </Icon>
  )
}

export function MinusIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  )
}

export function CheckIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  )
}

export function InfoIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeWidth={2.5} strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </Icon>
  )
}

/** Sparkle / celebration — replaces 🎉 emoji */
export function SparkleIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </Icon>
  )
}

/** Small diamond — replaces ✦ realm-stat indicator */
export function DiamondIcon({ size = 10, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}>
      <path d="M12 2L22 12L12 22L2 12Z" />
    </svg>
  )
}

/** Arrow pointing right — replaces → in navigation buttons */
export function ArrowRightIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Icon>
  )
}

/** Arrow pointing down — replaces ↓ fumble-reduced indicator */
export function ArrowDownIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </Icon>
  )
}

/** Open eye — show detail labels */
export function EyeOpenIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

/** Closed eye (eye-off) — hide detail labels */
export function EyeClosedIcon({ size, color }) {
  return (
    <Icon size={size} color={color}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </Icon>
  )
}
