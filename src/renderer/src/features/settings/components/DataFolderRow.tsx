import { FolderOpen } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { useAsync } from '@renderer/lib/use-async'
import { SettingRow } from './SettingsSection'

const loadDataFolder = () => api.app.dataFolder()

/** Where the app keeps its data, with a shortcut to open it. */
export function DataFolderRow() {
  const t = useT()
  const { data: path } = useAsync(loadDataFolder)
  return (
    <SettingRow
      label={t('settings.dataFolder.label')}
      description={
        <>
          {t('settings.dataFolder.description')}
          {path && (
            <span className="mt-1 block font-mono text-xs break-all select-text">{path}</span>
          )}
        </>
      }
    >
      <Button
        onClick={() => {
          api.app.openDataFolder().catch((error: unknown) => {
            console.error('Failed to open the data folder', error)
          })
        }}
      >
        <FolderOpen aria-hidden className="size-3.5" />
        {t('settings.dataFolder.open')}
      </Button>
    </SettingRow>
  )
}
