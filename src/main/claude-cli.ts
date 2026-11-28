/**
 * Status and updates of the Claude Code CLI (`claude`). The renderer reaches this only
 * through the typed IPC channels; the job runner uses it before it starts agents.
 */

import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { net } from 'electron'
import {
  compareVersions,
  type ClaudeAccount,
  type ClaudeCliStatus,
  type ClaudeCliUpdateResult,
  type ClaudeInstallMethod,
  type ClaudeReleaseChannel,
} from '@shared/claude'
import { cliPath, firstLine } from './cli-env'

export const claudeCommand = 'claude'

const VERSION_TIMEOUT_MS = 15_000
const AUTH_TIMEOUT_MS = 15_000
const UPDATE_TIMEOUT_MS = 5 * 60_000
const REGISTRY_TIMEOUT_MS = 10_000
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@anthropic-ai/claude-code/dist-tags'

export function claudeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: cliPath(), NO_COLOR: '1', CI: '1' }
}

interface RunResult {
  stdout: string
  stderr: string
}

class CommandError extends Error {
  constructor(
    message: string,
    readonly notFound: boolean,
    readonly stdout: string,
  ) {
    super(message)
  }
}

function run(command: string, args: string[], timeout: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { env: claudeEnv(), timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const detail = firstLine(String(stderr)) || firstLine(String(stdout)) || error.message
          reject(new CommandError(detail, error.code === 'ENOENT', String(stdout)))
        } else {
          resolve({ stdout: String(stdout), stderr: String(stderr) })
        }
      },
    )
  })
}

function lastLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? ''
  )
}

function runClaude(args: string[], timeout: number): Promise<RunResult> {
  return run(claudeCommand, args, timeout)
}

// --- Installation ---------------------------------------------------------------------------

/** The real location of the `claude` that is started, with symlinks resolved. */
function resolveExecutable(): string | null {
  if (process.platform === 'win32') return null
  for (const directory of cliPath().split(delimiter)) {
    if (!directory) continue
    const candidate = join(directory, claudeCommand)
    if (!existsSync(candidate)) continue
    try {
      return realpathSync(candidate)
    } catch {
      return candidate
    }
  }
  return null
}

function installMethod(): ClaudeInstallMethod {
  const path = resolveExecutable()
  if (!path) return { kind: 'unknown' }
  const cask = /\/Caskroom\/([^/]+)\//.exec(path)?.[1]
  if (cask) return { kind: 'homebrew', cask }
  if (path.includes('/node_modules/')) return { kind: 'npm' }
  if (path.includes('/.local/share/claude/') || path.includes('/.claude/'))
    return { kind: 'native' }
  return { kind: 'unknown' }
}

/** The channel `autoUpdatesChannel` in the user's Claude settings picks; `latest` by default. */
async function nativeChannel(): Promise<ClaudeReleaseChannel> {
  const configDirectory = process.env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude')
  try {
    const settings = JSON.parse(await readFile(join(configDirectory, 'settings.json'), 'utf8')) as {
      autoUpdatesChannel?: unknown
    }
    return settings.autoUpdatesChannel === 'stable' ? 'stable' : 'latest'
  } catch {
    return 'latest'
  }
}

/**
 * Homebrew's `claude-code` cask follows the stable channel, `claude-code@latest` the latest
 * one. Comparing a stable install with `latest` would report an update brew cannot deliver.
 */
async function releaseChannel(install: ClaudeInstallMethod): Promise<ClaudeReleaseChannel> {
  switch (install.kind) {
    case 'homebrew':
      return install.cask.endsWith('@latest') ? 'latest' : 'stable'
    case 'native':
      return nativeChannel()
    default:
      return 'latest'
  }
}

/** The newest published version per channel, or `null` if the registry cannot be reached. */
async function publishedVersions(): Promise<Partial<Record<ClaudeReleaseChannel, string>> | null> {
  try {
    const response = await net.fetch(DIST_TAGS_URL, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = (await response.json()) as Record<string, unknown>
    const versions: Partial<Record<ClaudeReleaseChannel, string>> = {}
    if (typeof body['stable'] === 'string') versions.stable = body['stable']
    if (typeof body['latest'] === 'string') versions.latest = body['latest']
    return versions
  } catch {
    return null
  }
}

// --- Account --------------------------------------------------------------------------------

function parseAccount(stdout: string): ClaudeAccount | null {
  try {
    const body = JSON.parse(stdout) as Record<string, unknown>
    if (body['loggedIn'] !== true) return { loggedIn: false }
    const text = (key: string) => (typeof body[key] === 'string' && body[key] ? body[key] : null)
    return {
      loggedIn: true,
      authMethod: text('authMethod'),
      email: text('email'),
      subscriptionType: text('subscriptionType'),
    }
  } catch {
    return null
  }
}

/** Reads `claude auth status`, which exits with an error code when nobody is signed in. */
async function getAccount(): Promise<ClaudeAccount | null> {
  try {
    const { stdout } = await runClaude(['auth', 'status', '--json'], AUTH_TIMEOUT_MS)
    return parseAccount(stdout)
  } catch (error) {
    return error instanceof CommandError ? parseAccount(error.stdout) : null
  }
}

// --- Status ---------------------------------------------------------------------------------

/** Reads the installed version, e.g. "2.1.325 (Claude Code)", and compares it with the newest. */
export async function getClaudeStatus(): Promise<ClaudeCliStatus> {
  const published = publishedVersions()
  try {
    const { stdout } = await runClaude(['--version'], VERSION_TIMEOUT_MS)
    const version = /\d+\.\d+\.\d+[\w.-]*/.exec(stdout)?.[0] ?? firstLine(stdout)
    const install = installMethod()
    const [channel, versions, account] = await Promise.all([
      releaseChannel(install),
      published,
      getAccount(),
    ])
    const latestVersion = versions?.[channel] ?? null
    return {
      state: 'installed',
      version,
      install,
      channel,
      latestVersion,
      updateAvailable: latestVersion !== null && compareVersions(latestVersion, version) > 0,
      account,
    }
  } catch (error) {
    if (error instanceof CommandError && error.notFound) return { state: 'notInstalled' }
    return { state: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** True if the CLI can be started. Cheaper than `getClaudeStatus`, which asks the registry. */
export async function isClaudeInstalled(): Promise<boolean> {
  try {
    await runClaude(['--version'], VERSION_TIMEOUT_MS)
    return true
  } catch {
    return false
  }
}

let updating: Promise<ClaudeCliUpdateResult> | null = null

/** Updates through Homebrew for casks, otherwise with `claude update`. */
export function updateClaude(): Promise<ClaudeCliUpdateResult> {
  updating ??= (async (): Promise<ClaudeCliUpdateResult> => {
    try {
      const install = installMethod()
      const { stdout, stderr } =
        install.kind === 'homebrew'
          ? await run('brew', ['upgrade', '--cask', install.cask], UPDATE_TIMEOUT_MS)
          : await runClaude(['update'], UPDATE_TIMEOUT_MS)
      const status = await getClaudeStatus()
      // `claude update` exits successfully when it only explains how to update elsewhere.
      if (status.state === 'installed' && status.updateAvailable) {
        const message = lastLine(stdout) || lastLine(stderr) || 'The version did not change.'
        return { ok: false, message, status }
      }
      return { ok: true, status }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        status: await getClaudeStatus(),
      }
    }
  })().finally(() => {
    updating = null
  })
  return updating
}
