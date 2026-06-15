// whether the terminal can render 24-bit colour
function detectTruecolor(): boolean {
  const env = process.env
  if (env.XMIT_TRUECOLOR === '0') return false
  if (env.XMIT_TRUECOLOR === '1') return true
  const colorterm = (env.COLORTERM ?? '').toLowerCase()
  if (colorterm === 'truecolor' || colorterm === '24bit') return true
  const term = (env.TERM ?? '').toLowerCase()
  if (term.endsWith('-direct') || term.includes('truecolor')) return true
  const prog = env.TERM_PROGRAM ?? ''
  if (prog === 'iTerm.app' || prog === 'WezTerm' || prog === 'ghostty') return true
  return false
}

export const truecolor: boolean = detectTruecolor()

// real hex on truecolor terminals, white otherwise
export function accentColor(hex: string): string {
  return truecolor ? hex : 'white'
}
