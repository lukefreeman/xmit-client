// global palette; resolve through lib/color.accentColor for truecolor fallback

export const theme = {
  bg: '#0a0a0a',
  dim: '#888888',
  muted: '#888888',
  text: '#eeeeee',
  accent: '#5af7be',
  error: '#ff3333',
  success: '#00ff88',
  coral: '#5af7be', // EQ peaks
} as const

// the tune-in layout is responsive (left column clamps 34–56, right flexes),
// so it renders cleanly well below the old 120 floor. 100 keeps the 4-panel
// view comfortable while admitting normal-width windows.
export const MIN_COLS = 100
export const MIN_ROWS = 30
