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

export const MIN_COLS = 120
export const MIN_ROWS = 30
