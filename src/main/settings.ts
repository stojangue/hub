import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { defaultSettings, sanitizeSettings, type Settings } from '@shared/settings'

/** Background colors matching `--color-background` in globals.css, to avoid flashes. */
const backgroundColor = { light: '#fcfcfc', dark: '#18191b' } as const

let current: Settings = defaultSettings
let pendingWrite: Promise<void> = Promise.resolve()

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** Reads the settings file synchronously. Missing or invalid values fall back to the defaults. */
export function loadSettings(): Settings {
  try {
    current = sanitizeSettings(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    current = defaultSettings
  }
  applyTheme()
  return current
}

export function getSettings(): Settings {
  return current
}

export async function updateSettings(patch: unknown): Promise<Settings> {
  const previous = current
  current = sanitizeSettings(patch, current)
  if (current.theme !== previous.theme) applyTheme()
  await save(current)
  return current
}

export function windowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? backgroundColor.dark : backgroundColor.light
}

/** Drives both the native window chrome and `prefers-color-scheme` in the renderer. */
function applyTheme(): void {
  nativeTheme.themeSource = current.theme
}

// Keep window backgrounds in sync with theme changes, including macOS appearance changes.
nativeTheme.on('updated', () => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.setBackgroundColor(windowBackgroundColor())
  }
})

/** Writes via a temp file and rename, serialized so concurrent saves cannot interleave. */
function save(settings: Settings): Promise<void> {
  const path = settingsPath()
  const tmpPath = `${path}.tmp`
  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      await writeFile(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
      await rename(tmpPath, path)
    })
  return pendingWrite
}
