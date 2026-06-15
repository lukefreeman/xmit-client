import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import type * as Ably from 'ably'
import { StatusBar } from '../components/StatusBar.js'
import { ReleasesPanel } from '../components/ReleasesPanel.js'
import { TracksPanel } from '../components/TracksPanel.js'
import { NowPlaying } from '../components/NowPlaying.js'
import { ListeningPanel } from '../components/ListeningPanel.js'
import { Chat } from '../components/Chat.js'
import { theme } from '../theme.js'
import { fetchReleases, fetchTracks } from '../lib/supabase.js'
import { oneLine } from '../lib/format.js'
import { accentColor } from '../lib/color.js'
import { getChannel, hasAblyConfig } from '../lib/ably.js'
import { mpv } from '../lib/mpv.js'
import type { ChatMessage, Label, PresenceMember, Release, Track, User } from '../types/index.js'

type Focus = 'releases' | 'tracks' | 'chat'

interface Props {
  user: User
  label: Label
  online?: number
  onLeave: () => void
  onQuit: () => void
}

export function TuneInScreen({ user, label, onLeave, onQuit }: Props): React.ReactElement {
  const accent = accentColor(theme.accent)
  const { stdout } = useStdout()
  const rows = stdout?.rows ?? 30
  const cols = stdout?.columns ?? 120

  const [releases, setReleases] = useState<Release[]>([])
  const [releaseIndex, setReleaseIndex] = useState(0)
  const [tracks, setTracks] = useState<Track[]>([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [loadingReleases, setLoadingReleases] = useState(true)

  const [playing, setPlaying] = useState<Track | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(false)
  const [volume, setVolume] = useState(100)
  const [bitrate, setBitrate] = useState(0)
  const [frame, setFrame] = useState(0)

  const [members, setMembers] = useState<PresenceMember[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')

  const [focus, setFocus] = useState<Focus>('releases')
  const channelRef = useRef<Ably.RealtimeChannel | null>(null)

  // load releases for this label
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchReleases(label.id)
        if (cancelled) return
        setReleases(data)
        setReleaseIndex(0)
        setLoadingReleases(false)
      } catch {
        if (!cancelled) setLoadingReleases(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [label.id])

  // load tracks for the selected release
  useEffect(() => {
    const release = releases[releaseIndex]
    if (!release) {
      setTracks([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchTracks(release.id)
        if (!cancelled) {
          setTracks(data)
          setTrackIndex(0)
        }
      } catch {
        if (!cancelled) setTracks([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [releases, releaseIndex])

  // EQ animation ticker
  useEffect(() => {
    if (!playing || paused || !mpv.available) return
    const id = setInterval(() => setFrame((f) => f + 1), 90)
    return () => clearInterval(id)
  }, [playing, paused])

  // mpv progress poller
  useEffect(() => {
    if (!playing || !mpv.available) return
    const id = setInterval(async () => {
      const [p, d, br] = await Promise.all([mpv.getPosition(), mpv.getDuration(), mpv.getBitrate()])
      setPosition(p)
      if (d > 0) setDuration(d)
      if (br > 0) setBitrate(br)
    }, 500)
    return () => clearInterval(id)
  }, [playing])

  // ably presence + chat
  useEffect(() => {
    if (!hasAblyConfig()) return
    const channel = getChannel(user.handle, label.slug)
    channelRef.current = channel
    let active = true

    const refreshPresence = async (): Promise<void> => {
      try {
        const page = await channel.presence.get()
        if (!active) return
        setMembers(
          page.map((m) => ({
            clientId: m.clientId ?? 'unknown',
            handle: (m.data as { handle?: string } | undefined)?.handle ?? m.clientId ?? 'unknown',
          })),
        )
      } catch {}
    }

    const onChat = (msg: Ably.Message): void => {
      const data = msg.data as ChatMessage
      if (!data?.text) return
      setMessages((prev) => [...prev, data].slice(-100))
    }

    void (async () => {
      try {
        await channel.presence.enter({ handle: user.handle })
        await channel.presence.subscribe(['enter', 'leave', 'update'], () => void refreshPresence())
        await channel.subscribe('chat', onChat)
        await refreshPresence()
      } catch {}
    })()

    return () => {
      active = false
      void (async () => {
        try {
          channel.unsubscribe('chat', onChat)
          channel.presence.unsubscribe()
          await channel.presence.leave()
          channel.detach()
        } catch {}
      })()
    }
  }, [label.slug, user.handle])

  const playTrack = (track: Track): void => {
    // show metadata regardless; only drive audio if mpv is present
    setPlaying(track)
    setPaused(false)
    setPosition(0)
    setDuration(track.duration || 0)
    setBitrate(0)
    if (mpv.available) mpv.play(track.audio_url)
  }

  const togglePause = (): void => {
    if (!playing || !mpv.available) return
    mpv.pause()
    setPaused((p) => !p)
  }

  const changeVolume = (delta: number): void => {
    if (!mpv.available) return
    setVolume((v) => {
      const next = Math.max(0, Math.min(130, v + delta))
      mpv.volume(next - v)
      return next
    })
  }

  const sendChat = (text: string): void => {
    const trimmed = oneLine(text)
    setDraft('')
    if (!trimmed || !channelRef.current) return
    const msg: ChatMessage = { handle: user.handle, text: trimmed, timestamp: Date.now() }
    channelRef.current.publish('chat', msg).catch(() => {
      setMessages((prev) => [...prev, { handle: 'system', text: 'message failed to send', timestamp: Date.now() }])
    })
  }

  useInput((input, key) => {
    if (key.escape) {
      onLeave()
      return
    }
    if (key.tab) {
      const order: Focus[] = ['releases', 'tracks', 'chat']
      const i = order.indexOf(focus)
      setFocus(order[(i + (key.shift ? order.length - 1 : 1)) % order.length]!)
      return
    }

    // let TextInput own keystrokes while typing in chat
    if (focus === 'chat') return

    if (input === '/') {
      setFocus('chat')
      return
    }
    if (input === 'q' || input === 'Q') {
      onQuit()
      return
    }

    if (input === ' ') {
      togglePause()
      return
    }
    if (key.leftArrow) {
      mpv.seek(-10)
      return
    }
    if (key.rightArrow) {
      mpv.seek(10)
      return
    }
    if (input === '+' || input === '=') {
      changeVolume(5)
      return
    }
    if (input === '-' || input === '_') {
      changeVolume(-5)
      return
    }

    if (focus === 'releases') {
      if ((key.upArrow || input === 'k') && releases.length) setReleaseIndex((i) => (i - 1 + releases.length) % releases.length)
      if ((key.downArrow || input === 'j') && releases.length) setReleaseIndex((i) => (i + 1) % releases.length)
      if (key.return && tracks.length) setFocus('tracks')
    } else if (focus === 'tracks') {
      if ((key.upArrow || input === 'k') && tracks.length) setTrackIndex((i) => (i - 1 + tracks.length) % tracks.length)
      if ((key.downArrow || input === 'j') && tracks.length) setTrackIndex((i) => (i + 1) % tracks.length)
      if (key.return) {
        const t = tracks[trackIndex]
        if (t) playTrack(t)
      }
    }
  })

  const release = releases[releaseIndex]
  const listening = members.length

  // fixed-width left column; right takes the rest
  const leftW = Math.max(34, Math.min(56, Math.floor(cols * 0.36)))
  const leftInner = leftW - 4 // minus border + paddingX
  const rightW = cols - leftW - 1
  const npBoxW = Math.max(24, Math.floor((rightW - 1) * 0.62))
  const lpBoxW = rightW - 1 - npBoxW
  const npInner = npBoxW - 4
  const lpInner = lpBoxW - 4
  const NOW_PLAYING_ROWS = 11

  return (
    <Box flexDirection="column" height={rows - 1}>
      <StatusBar
        title={label.name.toUpperCase()}
        handle={user.handle}
        accent={accent}
        online={listening}
        onlineLabel="listening"
        keys="tab cycle · esc back · q quit"
      />

      <Box flexGrow={1}>
        <Box flexDirection="column" width={leftW}>
          <ReleasesPanel
            releases={releases}
            index={releaseIndex}
            focused={focus === 'releases'}
            accent={accent}
            width={leftInner}
            loading={loadingReleases}
          />
          <TracksPanel
            releaseTitle={release?.title ?? ''}
            tracks={tracks}
            index={trackIndex}
            focused={focus === 'tracks'}
            playingId={playing?.id ?? null}
            accent={accent}
            width={leftInner}
          />
        </Box>

        <Box flexDirection="column" flexGrow={1} marginLeft={1}>
          <Box flexDirection="row" height={NOW_PLAYING_ROWS}>
            <Box width={npBoxW}>
              <NowPlaying
                track={playing}
                releaseTitle={release?.title ?? ''}
                labelName={label.name}
                position={position}
                duration={duration}
                paused={paused}
                bitrate={bitrate}
                frame={frame}
                accent={accent}
                mpvAvailable={mpv.available}
                width={npInner}
                grow
              />
            </Box>
            <Box width={lpBoxW} marginLeft={1}>
              <ListeningPanel members={members} selfHandle={user.handle} accent={accent} width={lpInner} />
            </Box>
          </Box>
          <Chat
            messages={messages}
            draft={draft}
            onChange={setDraft}
            onSubmit={sendChat}
            focused={focus === 'chat'}
            selfHandle={user.handle}
            accent={accent}
            slug={label.slug}
          />
        </Box>
      </Box>

      <Box paddingX={1}>
        <Text color={theme.muted}>
          <KeyHint k="tab" label="panel" accent={accent} />
          <KeyHint k="↑↓" label="select" accent={accent} />
          <KeyHint k="↵" label="play" accent={accent} />
          <KeyHint k="space" label="pause" accent={accent} />
          <KeyHint k="/" label="chat" accent={accent} />
          <KeyHint k="q" label="quit" accent={accent} last />
        </Text>
      </Box>
    </Box>
  )
}

function KeyHint({
  k,
  label,
  accent,
  last,
}: {
  k: string
  label: string
  accent: string
  last?: boolean
}): React.ReactElement {
  return (
    <Text>
      <Text color={accent} bold>
        {k}
      </Text>
      <Text color={theme.muted}> {label}</Text>
      {last ? null : <Text color={theme.dim}>{'    '}</Text>}
    </Text>
  )
}
