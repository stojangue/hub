import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * Apps started from the macOS Finder or Dock do not inherit the shell's PATH, so the usual
 * install locations of command line tools are appended.
 */
const fallbackPaths =
  process.platform === 'win32'
    ? []
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/home/linuxbrew/.linuxbrew/bin',
        join(homedir(), '.local/bin'),
        join(homedir(), '.claude/local'),
        join(homedir(), '.npm-global/bin'),
      ]

/** The PATH to start command line tools with. */
export function cliPath(): string {
  return [process.env['PATH'], ...fallbackPaths].filter(Boolean).join(delimiter)
}

export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}
