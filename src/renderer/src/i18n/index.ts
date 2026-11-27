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

export function translate(language: Language, key: TranslationKey): string {
  return dictionaries[language][key] ?? en[key]
}

/** Returns a translate function for the current language. Re-renders when the language changes. */
export function useT(): (key: TranslationKey) => string {
  const { settings } = useSettings()
  return useCallback(
    (key: TranslationKey) => translate(settings.language, key),
    [settings.language],
  )
}
