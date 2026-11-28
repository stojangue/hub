import type { AgentDevOpsAccess, AgentEffort, AgentModel } from '@shared/blocks'
import { languages, themes, type Language, type Theme } from '@shared/settings'
import { devOpsOptions, effortOptions, modelOptions } from '@renderer/claude/agent-options'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { Select } from '@renderer/components/Select'
import { languageNames, useT, type TranslationKey } from '@renderer/i18n'
import { useSettings } from '@renderer/settings/context'
import { ClaudeCodeIntegrationRow } from './components/ClaudeCodeIntegrationRow'
import { GitHubIntegrationRow } from './components/GitHubIntegrationRow'
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
    <div className="space-y-8">
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

      <SettingsSection title={t('settings.devops.title')}>
        <GitHubIntegrationRow />
        <SettingRow
          label={t('settings.agentDevOps.label')}
          description={t('settings.agentDevOps.description')}
        >
          <div className="w-72">
            <Select
              value={settings.agentDevOps}
              options={devOpsOptions(t)}
              onChange={(agentDevOps) =>
                void updateSettings({ agentDevOps: agentDevOps as AgentDevOpsAccess })
              }
              placeholder={t('agent.devops')}
            />
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('settings.ai.title')}>
        <ClaudeCodeIntegrationRow />
        <SettingRow
          label={t('settings.agentModel.label')}
          description={t('settings.agentModel.description')}
        >
          <div className="w-44">
            <Select
              value={settings.agentModel}
              options={modelOptions(t)}
              onChange={(agentModel) =>
                void updateSettings({ agentModel: agentModel as AgentModel })
              }
              placeholder={t('agent.model')}
            />
          </div>
        </SettingRow>
        <SettingRow
          label={t('settings.agentEffort.label')}
          description={t('settings.agentEffort.description')}
        >
          <div className="w-44">
            <Select
              value={settings.agentEffort}
              options={effortOptions(t)}
              onChange={(agentEffort) =>
                void updateSettings({ agentEffort: agentEffort as AgentEffort })
              }
              placeholder={t('agent.effort')}
            />
          </div>
        </SettingRow>
      </SettingsSection>
    </div>
  )
}
