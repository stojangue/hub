import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { maxNameLength } from '@shared/blueprints'
import { Button } from '@renderer/components/Button'
import { Dialog, Field, inputClasses } from '@renderer/components/Dialog'
import { Select } from '@renderer/components/Select'
import { Skeleton } from '@renderer/components/Skeleton'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { unwrap } from '@renderer/github/queries'
import { useAsync } from '@renderer/lib/use-async'
import type { WorkItem } from '@shared/work-items'
import { WorkItemPicker } from './WorkItemPicker'

interface CreateJobDialogProps {
  open: boolean
  onClose: () => void
}

/** Asks for a name and a blueprint, creates the job and opens it. */
export function CreateJobDialog({ open, onClose }: CreateJobDialogProps) {
  return open ? <CreateJobForm onClose={onClose} /> : null
}

/** Mounted only while open, so the blueprints are loaded fresh every time. */
function CreateJobForm({ onClose }: { onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const loadBlueprints = useCallback(() => api.blueprints.list(), [])
  const blueprints = useAsync(loadBlueprints)
  const [name, setName] = useState('')
  const [blueprintId, setBlueprintId] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [workItems, setWorkItems] = useState<Record<string, WorkItem | null>>({})
  const [repositories, setRepositories] = useState<Record<string, string>>({})

  const list = blueprints.data ?? []
  const noBlueprints = !blueprints.loading && !blueprints.error && list.length === 0
  const blueprint = list.find((candidate) => candidate.id === blueprintId)
  const workItemNodes = blueprint?.content.nodes.filter((node) => node.type === 'workItem') ?? []
  const needsGitHub = workItemNodes.length > 0
  const loadRepositories = useCallback(
    () => (needsGitHub ? unwrap(api.github.repos()) : Promise.resolve([])),
    [needsGitHub],
  )
  const repos = useAsync(loadRepositories)
  const valid =
    name.trim().length > 0 &&
    blueprint !== undefined &&
    workItemNodes.every((node) => workItems[node.id])

  function close() {
    if (!busy) onClose()
  }

  async function create() {
    if (!valid || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const chosen: Record<string, WorkItem> = {}
      for (const node of workItemNodes) {
        const item = workItems[node.id]
        if (item) chosen[node.id] = item
      }
      const job = await api.jobs.create({ name, blueprintId, workItems: chosen })
      onClose()
      void navigate(`/jobs/${job.id}`)
    } catch (error) {
      console.error('Failed to create job', error)
      setFailed(true)
      // The blueprint may have been deleted in the meantime.
      blueprints.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={close}
      title={t('jobs.create.title')}
      description={t('jobs.create.description')}
      onSubmit={() => void create()}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <Field label={t('common.name')}>
        {(id) => (
          <input
            id={id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('jobs.create.namePlaceholder')}
            required
            autoFocus
            maxLength={maxNameLength}
            className={inputClasses}
          />
        )}
      </Field>

      <Field
        label={t('jobs.create.blueprint')}
        hint={
          noBlueprints && (
            <span role="status">
              {t('jobs.create.noBlueprints')}{' '}
              <Link
                to="/blueprints"
                onClick={onClose}
                className="font-medium text-accent hover:underline"
              >
                {t('nav.blueprints')}
              </Link>
              .
            </span>
          )
        }
      >
        {(id) =>
          blueprints.loading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select
              id={id}
              value={blueprintId}
              onChange={setBlueprintId}
              placeholder={t('jobs.create.blueprintPlaceholder')}
              options={list.map((blueprint) => ({ value: blueprint.id, label: blueprint.name }))}
              disabled={noBlueprints || Boolean(blueprints.error)}
            />
          )
        }
      </Field>

      {workItemNodes.map((node) => (
        <Field key={node.id} label={t('jobs.create.workItem', { name: node.name })}>
          {(id) => (
            <WorkItemPicker
              id={id}
              label={node.name}
              repositories={repos}
              repository={repositories[node.id] ?? ''}
              onRepositoryChange={(fullName) =>
                setRepositories((current) => ({ ...current, [node.id]: fullName }))
              }
              value={workItems[node.id] ?? null}
              onChange={(item) => setWorkItems((current) => ({ ...current, [node.id]: item }))}
            />
          )}
        </Field>
      ))}

      {(failed || Boolean(blueprints.error)) && (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {t('common.error')}
        </p>
      )}
    </Dialog>
  )
}
