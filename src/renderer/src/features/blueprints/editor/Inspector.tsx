import { FolderOpen, Info, Trash2, TriangleAlert, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import {
  agentPermissionModes,
  maxInstructionsLength,
  type AgentDevOpsAccess,
  type AgentEffort,
  type AgentModel,
  type AgentPermissionMode,
} from '@shared/blocks'
import { maxNameLength, type BlueprintNode } from '@shared/blueprints'
import { devOpsOptions, effortOptions, modelOptions } from '@renderer/claude/agent-options'
import { Button } from '@renderer/components/Button'
import { inputClasses } from '@renderer/components/Dialog'
import { Select } from '@renderer/components/Select'
import { useT, type TranslationKey } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { blockPresentation } from '../blocks'

const permissionKeys: Record<AgentPermissionMode, TranslationKey> = {
  acceptEdits: 'inspector.agent.permission.acceptEdits',
  plan: 'inspector.agent.permission.plan',
  bypassPermissions: 'inspector.agent.permission.bypassPermissions',
}

interface InspectorProps {
  node: BlueprintNode
  onChange: (node: BlueprintNode) => void
  onDelete: () => void
  onClose: () => void
  /** For folder nodes: whether the folder exists, or `undefined` while unchecked. */
  folderExists: boolean | undefined
  /** Whether the Claude Code CLI is installed, or `undefined` while unchecked. */
  cliAvailable: boolean | undefined
  /** For agent nodes: whether a folder is linked, so permissions to work in it matter. */
  folderConnected: boolean
}

/** Edits the selected node. Every change is applied, and saved, straight away. */
export function Inspector({
  node,
  onChange,
  onDelete,
  onClose,
  folderExists,
  cliAvailable,
  folderConnected,
}: InspectorProps) {
  const t = useT()
  const presentation = blockPresentation[node.type]
  const Icon = presentation.icon

  return (
    <aside
      aria-label={t('inspector.label')}
      className="flex w-80 shrink-0 flex-col border-l border-border bg-background"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            presentation.tone,
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">{t(presentation.labelKey)}</div>
          <div className="truncate font-medium">{node.name}</div>
        </div>
        <Button
          variant="ghost"
          iconOnly
          onClick={onDelete}
          aria-label={t('inspector.delete')}
          title={t('inspector.delete')}
          className="hover:text-danger"
        >
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          iconOnly
          onClick={onClose}
          aria-label={t('inspector.close')}
          title={t('inspector.close')}
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <NameField
          key={node.id}
          name={node.name}
          onChange={(name) => onChange({ ...node, name })}
        />

        {node.type === 'folder' && (
          <InspectorField label={t('inspector.folder.path')}>
            {() => (
              <div className="space-y-2">
                <div className="flex items-stretch gap-1.5">
                  <div
                    title={node.config.path ?? undefined}
                    className={cn(
                      'min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs break-all select-text',
                      !node.config.path && 'font-sans text-muted',
                    )}
                  >
                    {node.config.path ?? t('inspector.folder.none')}
                  </div>
                  <Button
                    iconOnly
                    className="h-auto min-h-7 self-stretch"
                    aria-label={
                      node.config.path ? t('inspector.folder.change') : t('inspector.folder.choose')
                    }
                    title={
                      node.config.path ? t('inspector.folder.change') : t('inspector.folder.choose')
                    }
                    onClick={() => {
                      void api.folders.pick(node.config.path ?? undefined).then((path) => {
                        if (path) onChange({ ...node, config: { path } })
                      })
                    }}
                  >
                    <FolderOpen aria-hidden className="size-3.5" />
                  </Button>
                </div>
                {node.config.path && folderExists === false && (
                  <Note tone="warning">{t('inspector.folder.missing')}</Note>
                )}
              </div>
            )}
          </InspectorField>
        )}

        {node.type === 'agent' && (
          <>
            {cliAvailable === false && (
              <Note tone="warning">{t('inspector.agent.cliMissing')}</Note>
            )}
            <InspectorField label={t('inspector.agent.instructions')}>
              {(id) => (
                <textarea
                  id={id}
                  value={node.config.instructions}
                  maxLength={maxInstructionsLength}
                  onChange={(event) =>
                    onChange({
                      ...node,
                      config: { ...node.config, instructions: event.target.value },
                    })
                  }
                  placeholder={t('inspector.agent.instructionsPlaceholder')}
                  rows={7}
                  className={cn(inputClasses, 'h-auto resize-y py-1.5 leading-relaxed')}
                />
              )}
            </InspectorField>
            <InspectorField label={t('agent.model')}>
              {(id) => (
                <Select
                  id={id}
                  value={node.config.model}
                  onChange={(model) =>
                    onChange({
                      ...node,
                      config: { ...node.config, model: model as AgentModel },
                    })
                  }
                  placeholder={t('agent.model')}
                  options={modelOptions(t)}
                />
              )}
            </InspectorField>
            <InspectorField label={t('agent.effort')}>
              {(id) => (
                <Select
                  id={id}
                  value={node.config.effort}
                  onChange={(effort) =>
                    onChange({
                      ...node,
                      config: { ...node.config, effort: effort as AgentEffort },
                    })
                  }
                  placeholder={t('agent.effort')}
                  options={effortOptions(t)}
                />
              )}
            </InspectorField>
            <InspectorField label={t('agent.devops')}>
              {(id) => (
                <Select
                  id={id}
                  value={node.config.devops}
                  onChange={(devops) =>
                    onChange({
                      ...node,
                      config: { ...node.config, devops: devops as AgentDevOpsAccess },
                    })
                  }
                  placeholder={t('agent.devops')}
                  options={devOpsOptions(t)}
                />
              )}
            </InspectorField>
            {/* Permissions decide what the agent may do in its folder; without one they do not apply. */}
            {folderConnected && (
              <InspectorField label={t('inspector.agent.permission')}>
                {(id) => (
                  <Select
                    id={id}
                    value={node.config.permissionMode}
                    onChange={(mode) =>
                      onChange({
                        ...node,
                        config: { ...node.config, permissionMode: mode as AgentPermissionMode },
                      })
                    }
                    placeholder={t('inspector.agent.permission')}
                    options={agentPermissionModes.map((mode) => ({
                      value: mode,
                      label: t(permissionKeys[mode]),
                    }))}
                  />
                )}
              </InspectorField>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/** Keeps an empty name local until it is filled in again, since nodes need a name. */
function NameField({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const t = useT()
  const [draft, setDraft] = useState(name)
  const value = draft.trim() === '' ? draft : name
  return (
    <InspectorField label={t('common.name')}>
      {(id) => (
        <input
          id={id}
          value={value}
          maxLength={maxNameLength}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.value.trim()) onChange(event.target.value)
          }}
          onBlur={() => setDraft(name)}
          className={inputClasses}
        />
      )}
    </InspectorField>
  )
}

function InspectorField({
  label,
  children,
}: {
  label: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[0.8125rem] font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

function Note({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warning'
  children: ReactNode
}) {
  const NoteIcon = tone === 'warning' ? TriangleAlert : Info
  return (
    <p
      role={tone === 'warning' ? 'status' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        tone === 'warning'
          ? 'border-warning/30 bg-warning/10 text-warning'
          : 'border-border bg-surface text-muted',
      )}
    >
      <NoteIcon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
