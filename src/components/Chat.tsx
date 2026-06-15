import React from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { Panel } from './Panel.js'
import { ScrollList } from './ScrollList.js'
import { theme } from '../theme.js'
import { fmtClock } from '../lib/format.js'
import type { ChatMessage } from '../types/index.js'

interface Props {
  messages: ChatMessage[]
  draft: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  focused: boolean
  selfHandle: string
  accent: string
  slug: string
  maxVisible?: number
}

export function Chat({
  messages,
  draft,
  onChange,
  onSubmit,
  focused,
  selfHandle,
  accent,
  slug,
}: Props): React.ReactElement {
  const rows = messages.map((m, i) => (
    <Text key={`${m.timestamp}-${i}`} wrap="truncate-end">
      <Text color={theme.dim}>{fmtClock(m.timestamp)} </Text>
      <Text color={m.handle === selfHandle ? accent : theme.text} bold>
        {m.handle}
      </Text>
      <Text color={theme.text}> {m.text}</Text>
    </Text>
  ))

  return (
    <Panel title={`CHAT · #${slug}`} accent={accent} focused={focused} grow={2}>
      {messages.length === 0 ? (
        <Box flexGrow={1}>
          <Text color={theme.dim}>say something…</Text>
        </Box>
      ) : (
        <ScrollList rows={rows} follow="end" accent={accent} />
      )}
      <Box>
        <Text color={focused ? accent : theme.dim}>{'› '}</Text>
        {focused ? (
          <TextInput value={draft} onChange={onChange} onSubmit={onSubmit} placeholder="say something…" />
        ) : (
          <Text color={theme.dim}>{draft || 'say something…  (/ to chat)'}</Text>
        )}
      </Box>
    </Panel>
  )
}
