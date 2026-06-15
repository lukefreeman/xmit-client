import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from './Panel.js'
import { Waveform } from './Waveform.js'
import { theme } from '../theme.js'
import { fmtTime, audioFormat } from '../lib/format.js'
import type { Track } from '../types/index.js'

interface Props {
  track: Track | null
  releaseTitle: string
  labelName: string
  position: number
  duration: number
  paused: boolean
  bitrate: number // kbps, 0 if unknown
  frame: number // EQ animation tick
  accent: string
  mpvAvailable: boolean
  width: number // inner content width
  grow?: boolean // fill the row height (to match a sibling panel)
}

function ProgressBar({
  position,
  duration,
  accent,
  width,
}: {
  position: number
  duration: number
  accent: string
  width: number
}): React.ReactElement {
  const cells = Math.max(8, width)
  const ratio = duration > 0 ? Math.min(1, position / duration) : 0
  const filled = Math.round(ratio * cells)
  return (
    <Text>
      <Text color={accent}>{'━'.repeat(Math.max(0, filled))}</Text>
      <Text color={accent}>█</Text>
      <Text color={theme.dim}>{'━'.repeat(Math.max(0, cells - filled))}</Text>
    </Text>
  )
}

export function NowPlaying({
  track,
  releaseTitle,
  labelName,
  position,
  duration,
  paused,
  bitrate,
  frame,
  accent,
  mpvAvailable,
  width,
  grow,
}: Props): React.ReactElement {
  const playing = track !== null
  const dur = duration || track?.duration || 0
  const fmt = track ? audioFormat(track.audio_url) : ''
  const meta = `${bitrate > 0 ? `${bitrate} kbps · ` : ''}${fmt}`

  const right = (
    <Text color={playing && !paused ? accent : theme.muted} bold>
      {playing ? (paused ? '❚❚ paused' : '♪ playing') : '· idle'}
    </Text>
  )

  return (
    <Panel title="NOW PLAYING" accent={accent} right={right} grow={grow}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>
          {track ? track.title : 'nothing playing'}
        </Text>
        {track ? <Text color={theme.muted}>{meta}</Text> : null}
      </Box>
      <Text color={theme.muted}>
        {track
          ? `${releaseTitle} · ${labelName}`
          : mpvAvailable
            ? 'pick a track and hit ↵'
            : 'mpv not installed — playback disabled'}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={theme.muted}>{fmtTime(position)}</Text>
          <Text color={theme.muted}>{fmtTime(dur)}</Text>
        </Box>
        <ProgressBar position={position} duration={dur} accent={accent} width={width - 1} />
      </Box>

      <Box marginTop={1}>
        <Waveform
          frame={frame}
          playing={playing}
          paused={paused}
          accent={accent}
          bars={Math.max(8, Math.floor(width / 2))}
          height={2}
        />
      </Box>
    </Panel>
  )
}
