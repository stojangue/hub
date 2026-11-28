/**
 * Claude Code CLI status, shared by main, preload and renderer.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

/**
 * How the CLI was installed. It decides which release channel counts as current and how
 * the CLI is updated: Homebrew casks through `brew`, everything else through `claude update`.
 */
export type ClaudeInstallMethod =
  { kind: 'homebrew'; cask: string } | { kind: 'npm' } | { kind: 'native' } | { kind: 'unknown' }

/** Release channels published by Anthropic: `stable` lags `latest` by about a week. */
export type ClaudeReleaseChannel = 'stable' | 'latest'

/** The account the CLI is signed in with, from `claude auth status`. */
export type ClaudeAccount =
  | {
      loggedIn: true
      /** `claude.ai` for a subscription, otherwise e.g. an API key or console login. */
      authMethod: string | null
      email: string | null
      /** e.g. `pro`, `max`, `team`; `null` without a Claude subscription. */
      subscriptionType: string | null
    }
  | { loggedIn: false }

export type ClaudeCliStatus =
  | {
      state: 'installed'
      version: string
      install: ClaudeInstallMethod
      channel: ClaudeReleaseChannel
      /** Newest version in `channel`, or `null` if it could not be looked up. */
      latestVersion: string | null
      updateAvailable: boolean
      /** `null` if the sign-in state could not be read. */
      account: ClaudeAccount | null
    }
  | { state: 'notInstalled' }
  /** The check itself failed. */
  | { state: 'error'; message: string }

export type ClaudeCliUpdateResult =
  { ok: true; status: ClaudeCliStatus } | { ok: false; message: string; status: ClaudeCliStatus }

/** Compares dotted version numbers such as `2.1.325`. Returns <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
