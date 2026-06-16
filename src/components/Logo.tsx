import React from 'react'
import { Box, Text } from 'ink'
import { theme } from '../theme.js'
import { accentColor } from '../lib/color.js'

const ART = [
  '▀▄ ▄▀ █▄ ▄█ ▀█▀ ▀▀█▀▀',
  ' ▄▀▄  █ ▀ █  █    █  ',
  '▀   ▀ ▀   ▀ ▀▀▀   ▀  ',
]

export function Logo({ accent = accentColor(theme.accent) }: { accent?: string }): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center">
      {ART.map((line, i) => (
        <Text key={i} color={accent} bold>
          {line}
        </Text>
      ))}
      <Text color={theme.dim}>· underground terminal radio ·</Text>
    </Box>
  )
}
