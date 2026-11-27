import { gitHubErrorCodes, type GitHubError, type GitHubErrorCode } from '@shared/github'
import type { TranslationKey } from '@renderer/i18n'

export const errorTitleKeys: Record<GitHubErrorCode, TranslationKey> = {
  notInstalled: 'github.error.notInstalled',
  notAuthenticated: 'github.error.notAuthenticated',
  network: 'github.error.network',
  rateLimited: 'github.error.rateLimited',
  notFound: 'github.error.notFound',
  invalidRequest: 'github.error.invalidRequest',
  unknown: 'github.error.unknown',
}

function isGitHubError(value: unknown): value is GitHubError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (gitHubErrorCodes as readonly unknown[]).includes((value as GitHubError).code)
  )
}

/** Normalizes anything thrown while loading GitHub data, including IPC failures. */
export function toGitHubError(value: unknown): GitHubError {
  if (isGitHubError(value)) return value
  return { code: 'unknown', message: value instanceof Error ? value.message : String(value) }
}
