import React from 'react'
import { Box, Text } from 'ink'
import { theme } from '../theme.js'

interface Props {
  title: string
  handle?: string
  accent?: string
  online?: number // presence count; hidden when undefined
  onlineLabel?: string // word after the count, e.g. "online" / "listening"
  keys?: string // right-hand keybind hint
}

export function StatusBar({
  title,
  handle,
  accent = theme.accent,
  online,
  onlineLabel = 'online',
  keys,
}: Props): React.ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor={accent}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color={accent} bold>
          ◈ {title}
        </Text>
        {online !== undefined ? (
          <Text>
            <Text color={theme.dim}>{'   ·   '}</Text>
            <Text color={online > 0 ? theme.success : theme.dim}>● {online}</Text>
            <Text color={theme.muted}> {onlineLabel}</Text>
          </Text>
        ) : null}
      </Box>
      <Box>
        {handle ? (
          <Text>
            <Text color={theme.muted}>[</Text>
            <Text color={theme.text}>{handle}</Text>
            <Text color={theme.muted}>] </Text>
          </Text>
        ) : null}
        {keys ? <Text color={theme.muted}>{keys}</Text> : null}
      </Box>
    </Box>
  )
}
