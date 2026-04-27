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
