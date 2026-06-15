import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, measureElement, type DOMElement } from 'ink'
import { Panel } from './Panel.js'
import { theme } from '../theme.js'
import type { PresenceMember } from '../types/index.js'

interface Props {
  members: PresenceMember[]
  selfHandle: string
  accent: string
  width: number // inner content width
}

export function ListeningPanel({ members, selfHandle, accent, width }: Props): React.ReactElement {
  const ref = useRef<DOMElement | null>(null)
  const [lines, setLines] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = measureElement(el).height
    if (h > 0 && h !== lines) setLines(h)
  })

  const perLine = Math.max(1, Math.floor((width || 30) / 14))
  const fits = perLine * Math.max(1, lines)
  const overflow = members.length > fits
  const shown = overflow ? members.slice(0, Math.max(perLine, fits - 1)) : members
  const hidden = members.length - shown.length

  return (
    <Panel title="LISTENING" count={members.length} accent={accent} grow={1}>
      <Box ref={ref} flexDirection="column" flexGrow={1} overflow="hidden">
        {members.length === 0 ? (
          <Text color={theme.dim}>∙ nobody here yet</Text>
        ) : (
          <Box flexWrap="wrap">
            {shown.map((m) => {
              const you = m.handle === selfHandle
              return (
                <Box key={m.clientId} marginRight={3}>
                  <Text color={accent}>● </Text>
                  <Text color={you ? accent : theme.text}>
                    {m.handle}
                    {you ? <Text color={theme.dim}> (you)</Text> : null}
                  </Text>
                </Box>
              )
            })}
            {hidden > 0 ? <Text color={theme.dim}>+{hidden} more</Text> : null}
          </Box>
        )}
      </Box>
    </Panel>
  )
}
