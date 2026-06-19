import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, measureElement, type DOMElement } from 'ink'
import { theme } from '../theme.js'

interface Props {
  rows: React.ReactNode[]
  selectedIndex?: number
  follow?: 'selection' | 'end' // 'end' pins to the newest (chat)
  accent: string
}

// measured, windowed viewport showing only the slice of rows that fits
export function ScrollList({ rows, selectedIndex = 0, follow = 'selection', accent }: Props): React.ReactElement {
  const ref = useRef<DOMElement | null>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = measureElement(el).height
    if (h > 0 && h !== height) setHeight(h)
  })

  const total = rows.length
  const measured = height > 0
  const overflow = measured && total > height
  // reserve a row top and bottom for the indicators when overflowing
  const cap = overflow ? Math.max(1, height - 2) : measured ? height : 0

  let start = 0
  if (overflow) {
    if (follow === 'end') {
      start = total - cap
    } else {
      start = Math.min(Math.max(0, selectedIndex - Math.floor(cap / 2)), total - cap)
    }
  }
  // until the viewport height is known, render nothing — the flexGrow box still
  // measures correctly, and this avoids a transient full-list frame on mount
  const visible = measured ? rows.slice(start, start + cap) : []
  const above = start
  const below = total - (start + cap)

  return (
    <Box ref={ref} flexDirection="column" flexGrow={1} overflow="hidden">
      {overflow ? (
        <Text color={theme.dim}>{above > 0 ? `  ↑ ${above} more` : ' '}</Text>
      ) : null}
      {visible}
      {overflow ? (
        <Text color={accent}>{below > 0 ? `  ↓ ${below} more` : ' '}</Text>
      ) : null}
    </Box>
  )
}
