/** English translations. The source of truth for all keys and the fallback language. */
export const en = {
  'nav.home': 'Home',
  'nav.overview': 'Overview',
  'nav.settings': 'Settings',
  'nav.main': 'Main navigation',
  'breadcrumb.label': 'Breadcrumb',

  'overview.welcome': 'Welcome to Hub.',

  'settings.appearance.title': 'Appearance',
  'settings.theme.description': 'Light, dark, or match your system.',
  'settings.theme.label': 'Theme',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.system': 'System',

  'settings.language.title': 'Language',
  'settings.appLanguage.description': 'Used for all text in Hub.',
  'settings.appLanguage.label': 'App language',
} as const

export type TranslationKey = keyof typeof en
export type Translations = Record<TranslationKey, string>
