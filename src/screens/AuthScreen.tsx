import React, { useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import TextInput from 'ink-text-input'
import { Logo } from '../components/Logo.js'
import { theme } from '../theme.js'
import { login, register } from '../lib/auth.js'
import { accentColor } from '../lib/color.js'
import type { User } from '../types/index.js'

type Mode = 'login' | 'register'
// 0 = tabs, 1 = handle, 2 = password
type Field = 0 | 1 | 2

interface Props {
  onAuthed: (user: User) => void
  onQuit: () => void
}

export function AuthScreen({ onAuthed, onQuit }: Props): React.ReactElement {
  const { stdout } = useStdout()
  // leave one spare row to avoid scroll flicker on repaint
  const rows = Math.max(1, (stdout?.rows ?? 30) - 1)
  const [mode, setMode] = useState<Mode>('login')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [field, setField] = useState<Field>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (busy) return
    if (!handle.trim() || !password) {
      setError('Enter a handle and password')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const user = mode === 'login' ? await login(handle.trim(), password) : await register(handle.trim(), password)
      onAuthed(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  useInput((input, key) => {
    if (busy) return
    if (key.escape) {
      onQuit()
      return
    }
    if (key.tab) {
      setField((f) => (key.shift ? (((f + 2) % 3) as Field) : (((f + 1) % 3) as Field)))
      return
    }
    if (key.upArrow) {
      setField((f) => (((f + 2) % 3) as Field))
      return
    }
    if (key.downArrow) {
      setField((f) => (((f + 1) % 3) as Field))
      return
    }
    // tabs row: ←/→ or space switch mode, enter drops into the form
    if (field === 0) {
      if (key.leftArrow || key.rightArrow || input === ' ') {
        setMode((m) => (m === 'login' ? 'register' : 'login'))
        setError(null)
        return
      }
      if (key.return) {
        setField(1)
        return
      }
      return
    }
    if (key.return) void submit()
  })

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" height={rows}>
      <Logo />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={accentColor(theme.accent)}
        paddingX={2}
        paddingY={1}
        marginTop={1}
        width={48}
      >
        <Box justifyContent="center" marginBottom={1}>
          <Text color={field === 0 ? accentColor(theme.accent) : theme.dim}>{field === 0 ? '‹ ' : '  '}</Text>
          <Text
            color={mode === 'login' ? accentColor(theme.accent) : theme.dim}
            bold={mode === 'login'}
            underline={field === 0 && mode === 'login'}
          >
            LOGIN
          </Text>
          <Text color={theme.dim}>{'   ·   '}</Text>
          <Text
            color={mode === 'register' ? accentColor(theme.accent) : theme.dim}
            bold={mode === 'register'}
            underline={field === 0 && mode === 'register'}
          >
            REGISTER
          </Text>
          <Text color={field === 0 ? accentColor(theme.accent) : theme.dim}>{field === 0 ? ' ›' : '  '}</Text>
        </Box>

        <Field label="handle" active={field === 1}>
          <TextInput
            value={handle}
            onChange={setHandle}
            focus={field === 1 && !busy}
            placeholder="hex_ghost"
          />
        </Field>

        <Field label="pass  " active={field === 2}>
          <TextInput
            value={password}
            onChange={setPassword}
            focus={field === 2 && !busy}
            mask="*"
            placeholder=""
          />
        </Field>

        <Box marginTop={1}>
          {busy ? (
            <Text color={accentColor(theme.accent)}>· connecting…</Text>
          ) : error ? (
            <Text color={theme.error}>✕ {error}</Text>
          ) : field === 0 ? (
            <Text color={theme.dim}>←/→ switch · tab next · esc quit</Text>
          ) : (
            <Text color={theme.dim}>tab move · enter {mode} · esc quit</Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function Field({
  label,
  active,
  children,
}: {
  label: string
  active: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Box>
      <Text color={active ? accentColor(theme.accent) : theme.muted}>{active ? '▶ ' : '  '}</Text>
      <Text color={active ? theme.text : theme.muted}>{label} </Text>
      <Text color={theme.dim}>│ </Text>
      {children}
    </Box>
  )
}
