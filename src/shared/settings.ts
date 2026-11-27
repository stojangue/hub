/**
 * App settings shared by main, preload and renderer.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

export const themes = ['light', 'dark', 'system'] as const
export type Theme = (typeof themes)[number]

export const languages = ['en', 'de'] as const
export type Language = (typeof languages)[number]

export interface Settings {
  theme: Theme
  language: Language
}

export const defaultSettings: Settings = {
  theme: 'system',
  language: 'en',
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

/** Validates untrusted input (file contents, IPC payloads). Invalid values fall back to `fallback`. */
export function sanitizeSettings(value: unknown, fallback: Settings = defaultSettings): Settings {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    theme: isOneOf(themes, input['theme']) ? input['theme'] : fallback.theme,
    language: isOneOf(languages, input['language']) ? input['language'] : fallback.language,
  }
}
