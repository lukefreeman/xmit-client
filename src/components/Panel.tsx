import React from 'react'
import { Box, Text } from 'ink'
import { theme } from '../theme.js'

interface Props {
  title: string
  count?: number | string
  accent: string
  focused?: boolean
  grow?: boolean | number // true → flex 1; a number sets the flex ratio
  right?: React.ReactNode
  children: React.ReactNode
}

// bordered section box with a title row; border lights up when focused
export function Panel({ title, count, accent, focused = false, grow = false, right, children }: Props): React.ReactElement {
  const flexGrow = grow === true ? 1 : typeof grow === 'number' ? grow : 0
  return (
    <Box
      flexDirection="column"
      flexGrow={flexGrow}
      flexBasis={flexGrow > 0 ? 0 : undefined}
      borderStyle="round"
      borderColor={focused ? accent : theme.dim}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={accent} bold>
          {title}
          {count !== undefined ? <Text color={theme.dim}> · {count}</Text> : null}
        </Text>
        {right ?? null}
      </Box>
      {children}
    </Box>
  )
}
