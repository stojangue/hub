import {
  ArrowUpCircle,
  CircleCheck,
  CircleX,
  Download,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ClaudeCliStatus } from '@shared/claude'
import { Badge } from '@renderer/components/Badge'
import { Button } from '@renderer/components/Button'
import { Skeleton } from '@renderer/components/Skeleton'
import { useClaudeStatus } from '@renderer/claude/use-claude-status'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { SettingRow } from './SettingsSection'

const INSTALL_URL = 'https://docs.claude.com/en/docs/claude-code/setup'

/** "max" → "Claude Max"; unknown plans are shown as they come. */
function planLabel(subscriptionType: string): string {
  const name = subscriptionType.replace(/[_-]+/g, ' ').trim()
  return `Claude ${name.charAt(0).toUpperCase()}${name.slice(1)}`
}

/** Shows whether the Claude Code CLI is installed, signed in and current, and can update it. */
export function ClaudeCodeIntegrationRow() {
  const t = useT()
  const loaded = useClaudeStatus()
  // The status returned by an update replaces the loaded one until the next check.
  const [updated, setUpdated] = useState<{ status: ClaudeCliStatus; error: string | null } | null>(
    null,
  )
  const [updating, setUpdating] = useState(false)
  const checking = loaded.loading || loaded.reloading
  const status = updated?.status ?? loaded.data

  function checkAgain() {
    setUpdated(null)
    loaded.reload()
  }

  async function update() {
    setUpdating(true)
    try {
      const result = await api.claude.update()
      setUpdated({ status: result.status, error: result.ok ? null : result.message })
    } catch (error) {
      console.error('Failed to update the Claude Code CLI', error)
      setUpdated(status ? { status, error: String(error) } : null)
    } finally {
      setUpdating(false)
    }
  }

  let badge: ReactNode
  let description: ReactNode
  let action: ReactNode = null

  if (loaded.loading && !updated) {
    badge = <Skeleton className="h-5 w-24 rounded-full" />
    description = t('settings.claude.checking')
  } else if (status?.state === 'installed') {
    const account = status.account
    const canUpdate = status.install.kind !== 'unknown'

    if (account && !account.loggedIn) {
      badge = (
        <Badge tone="warning" icon={<TriangleAlert aria-hidden className="size-3" />}>
          {t('settings.claude.notAuthenticated')}
        </Badge>
      )
    } else if (status.updateAvailable) {
      badge = (
        <Badge tone="warning" icon={<ArrowUpCircle aria-hidden className="size-3" />}>
          {t('settings.claude.updateAvailable')}
        </Badge>
      )
    } else {
      badge = (
        <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3" />}>
          {account ? t('settings.claude.connected') : t('settings.claude.installed')}
        </Badge>
      )
    }

    let accountLine: ReactNode
    if (!account) {
      accountLine = t('settings.claude.accountUnknown')
    } else if (!account.loggedIn) {
      accountLine = (
        <>
          {t('settings.claude.notAuthenticatedHint')}{' '}
          <code className="rounded bg-border/60 px-1 font-mono text-xs text-foreground">
            claude auth login
          </code>
        </>
      )
    } else if (account.subscriptionType) {
      accountLine = t('settings.claude.signedInPlan', {
        account: account.email ?? '–',
        plan: planLabel(account.subscriptionType),
      })
    } else if (account.authMethod === 'claude.ai') {
      accountLine = t('settings.claude.signedInAs', { account: account.email ?? '–' })
    } else {
      accountLine = t('settings.claude.signedInNoPlan', { method: account.authMethod ?? '–' })
    }

    let versionLine: ReactNode
    if (status.updateAvailable) {
      versionLine = (
        <>
          {t('settings.claude.updateHint', {
            version: status.version,
            latest: status.latestVersion ?? '',
          })}{' '}
          {status.install.kind === 'homebrew'
            ? t('settings.claude.updateVia', { method: 'Homebrew' })
            : canUpdate
              ? null
              : t('settings.claude.updateManual')}
        </>
      )
      if (canUpdate) {
        action = (
          <Button variant="primary" onClick={() => void update()} disabled={updating || checking}>
            <Download aria-hidden className={updating ? 'size-3.5 animate-pulse' : 'size-3.5'} />
            {updating ? t('settings.claude.updating') : t('settings.claude.update')}
          </Button>
        )
      }
    } else {
      versionLine =
        status.latestVersion === null
          ? t('settings.claude.versionUnknownLatest', { version: status.version })
          : t('settings.claude.version', { version: status.version })
    }

    description = (
      <>
        <span className="block">{accountLine}</span>
        <span className="block">{versionLine}</span>
      </>
    )
  } else if (status?.state === 'notInstalled') {
    badge = (
      <Badge tone="danger" icon={<CircleX aria-hidden className="size-3" />}>
        {t('settings.claude.notInstalled')}
      </Badge>
    )
    description = (
      <>
        {t('settings.claude.notInstalledHint')}{' '}
        <a
          href={INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          {t('settings.claude.installInstructions')}
        </a>
      </>
    )
  } else {
    badge = (
      <Badge tone="danger" icon={<CircleX aria-hidden className="size-3" />}>
        {t('settings.claude.error')}
      </Badge>
    )
    description = status?.state === 'error' ? status.message : t('common.error')
  }

  return (
    <SettingRow
      label={t('settings.claude.label')}
      description={
        <>
          {description}
          {updated?.error && (
            <span role="alert" className="mt-0.5 block text-danger">
              {t('settings.claude.updateFailed')}{' '}
              <code className="font-mono text-xs break-all">{updated.error}</code>
            </span>
          )}
        </>
      }
    >
      <div className="flex items-center gap-3" aria-live="polite">
        {badge}
        {action}
        <Button onClick={checkAgain} disabled={checking || updating}>
          <RefreshCw aria-hidden className={checking ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {t('settings.github.checkAgain')}
        </Button>
      </div>
    </SettingRow>
  )
}
