import React from 'react'
import { Box, Text } from 'ink'
import { theme } from '../theme.js'
import { accentColor } from '../lib/color.js'

// vertical eighth-blocks, 1/8..8/8 filled from the bottom
const EIGHTHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

interface Props {
  frame: number
  playing: boolean
  paused: boolean
  accent: string
  bars?: number
  height?: number
}

// synthetic EQ, not real spectrum data; deterministic from (bar, frame)
export function Waveform({ frame, playing, paused, accent, bars = 20, height = 4 }: Props): React.ReactElement {
  // per-bar level in [0, height]; own speed + phase, two sines to avoid metronomic motion
  const levels: number[] = []
  for (let i = 0; i < bars; i++) {
    if (!playing || paused) {
      levels.push(0)
      continue
    }
    const speed = 0.45 + (((i * 37) % 13) / 13) * 0.55
    const phase = (((i * 53) % 17) / 17) * Math.PI * 2
    const s1 = Math.sin(phase + frame * speed) * 0.5 + 0.5
    const s2 = Math.sin(phase * 1.7 + frame * speed * 0.6) * 0.5 + 0.5
    const v = Math.max(0, Math.min(1, s1 * 0.7 + s2 * 0.3))
    levels.push(v * height)
  }

  const rows: React.ReactElement[] = []
  for (let row = 0; row < height; row++) {
    const bandFromBottom = height - row
    const cells: React.ReactElement[] = []
    for (let i = 0; i < bars; i++) {
      const level = levels[i]!
      const frac = Math.max(0, Math.min(1, level - (bandFromBottom - 1)))
      let ch = ' '
      if (!playing || paused) {
        // flat dim baseline keeps the box height stable
        ch = row === height - 1 ? '▁' : ' '
      } else if (frac > 0) {
        ch = EIGHTHS[Math.max(0, Math.ceil(frac * 8) - 1)]!
      }
      const tall = levels[i]! > height * 0.8
      cells.push(
        <Text key={i} color={!playing || paused ? theme.dim : tall ? accentColor(theme.coral) : accent}>
          {ch}{' '}
        </Text>,
      )
    }
    rows.push(<Text key={row}>{cells}</Text>)
  }

  return <Box flexDirection="column">{rows}</Box>
}
