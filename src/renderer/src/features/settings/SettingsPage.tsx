import { languages, themes, type Language, type Theme } from '@shared/settings'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { languageNames, useT, type TranslationKey } from '@renderer/i18n'
import { useSettings } from '@renderer/settings/context'
import { SettingRow, SettingsSection } from './components/SettingsSection'

const themeLabelKeys: Record<Theme, TranslationKey> = {
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
  system: 'settings.theme.system',
}

export function SettingsPage() {
  const t = useT()
  const { settings, updateSettings } = useSettings()

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <SettingsSection title={t('settings.appearance.title')}>
        <SettingRow label={t('settings.theme.label')} description={t('settings.theme.description')}>
          <SegmentedControl<Theme>
            label={t('settings.theme.label')}
            value={settings.theme}
            options={themes.map((theme) => ({ value: theme, label: t(themeLabelKeys[theme]) }))}
            onChange={(theme) => void updateSettings({ theme })}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('settings.language.title')}>
        <SettingRow
          label={t('settings.appLanguage.label')}
          description={t('settings.appLanguage.description')}
        >
          <SegmentedControl<Language>
            label={t('settings.appLanguage.label')}
            value={settings.language}
            options={languages.map((language) => ({
              value: language,
              label: languageNames[language],
            }))}
            onChange={(language) => void updateSettings({ language })}
          />
        </SettingRow>
      </SettingsSection>
    </div>
  )
}
