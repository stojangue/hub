import { useCallback } from 'react'
import type { Language } from '@shared/settings'
import { useSettings } from '@renderer/settings/context'
import { de } from './locales/de'
import { en, type TranslationKey, type Translations } from './locales/en'

export type { TranslationKey }

const dictionaries: Record<Language, Partial<Translations>> = { en, de }

/** Language names, each shown in its own language. */
export const languageNames: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
}

/** Values for `{name}` placeholders in a translation. */
export type TranslationParams = Record<string, string | number>

export type TranslateFn = (key: TranslationKey, params?: TranslationParams) => string

export function translate(
  language: Language,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const text = dictionaries[language][key] ?? en[key]
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** Returns a translate function for the current language. Re-renders when the language changes. */
export function useT(): TranslateFn {
  const { settings } = useSettings()
  return useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(settings.language, key, params),
    [settings.language],
  )
}
