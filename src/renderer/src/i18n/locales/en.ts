/** English translations. The source of truth for all keys and the fallback language. */
export const en = {
  'nav.home': 'Home',
  'nav.overview': 'Overview',
  'nav.settings': 'Settings',
  'nav.main': 'Main navigation',
  'breadcrumb.label': 'Breadcrumb',

  'overview.title': 'Overview',
  'overview.welcome': 'Welcome to Hub.',

  'settings.title': 'Settings',
  'settings.appearance.label': 'Appearance',
  'settings.appearance.description':
    'Choose a light or dark look, or follow the macOS appearance automatically.',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',
  'settings.appearance.system': 'System',
  'settings.language.label': 'Language',
  'settings.language.description': 'The language used throughout the app.',
} as const

export type TranslationKey = keyof typeof en
export type Translations = Record<TranslationKey, string>
