import type { ReactNode } from 'react'
import { languages, themes, type Language, type Theme } from '@shared/settings'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { languageNames, useT, type TranslationKey } from '@renderer/i18n'
import { useSettings } from '@renderer/settings/context'

const themeLabelKeys: Record<Theme, TranslationKey> = {
  light: 'settings.appearance.light',
  dark: 'settings.appearance.dark',
  system: 'settings.appearance.system',
}

interface SettingRowProps {
  label: string
  description: string
  children: ReactNode
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-8 py-5">
      <div className="min-w-0 space-y-1">
        <h2 className="font-medium">{label}</h2>
        <p className="text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const t = useT()
  const { settings, updateSettings } = useSettings()

  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>

      <div className="divide-y divide-border border-y border-border">
        <SettingRow
          label={t('settings.appearance.label')}
          description={t('settings.appearance.description')}
        >
          <SegmentedControl<Theme>
            label={t('settings.appearance.label')}
            value={settings.theme}
            options={themes.map((theme) => ({ value: theme, label: t(themeLabelKeys[theme]) }))}
            onChange={(theme) => void updateSettings({ theme })}
          />
        </SettingRow>

        <SettingRow
          label={t('settings.language.label')}
          description={t('settings.language.description')}
        >
          <SegmentedControl<Language>
            label={t('settings.language.label')}
            value={settings.language}
            options={languages.map((language) => ({
              value: language,
              label: languageNames[language],
            }))}
            onChange={(language) => void updateSettings({ language })}
          />
        </SettingRow>
      </div>
    </section>
  )
}
