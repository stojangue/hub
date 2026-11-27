import { useState } from 'react'
import { useNavigate } from 'react-router'
import { maxNameLength } from '@shared/blueprints'
import { Button } from '@renderer/components/Button'
import { Dialog, Field, inputClasses } from '@renderer/components/Dialog'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'

interface CreateBlueprintDialogProps {
  open: boolean
  onClose: () => void
}

/** Asks for a name, creates the blueprint and opens it. */
export function CreateBlueprintDialog({ open, onClose }: CreateBlueprintDialogProps) {
  const t = useT()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const valid = name.trim().length > 0

  function close() {
    if (busy) return
    setName('')
    setFailed(false)
    onClose()
  }

  async function create() {
    if (!valid || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const blueprint = await api.blueprints.create({ name })
      setName('')
      onClose()
      void navigate(`/blueprints/${blueprint.id}`)
    } catch (error) {
      console.error('Failed to create blueprint', error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('blueprints.create.title')}
      description={t('blueprints.create.description')}
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
            placeholder={t('blueprints.create.namePlaceholder')}
            required
            autoFocus
            maxLength={maxNameLength}
            className={inputClasses}
          />
        )}
      </Field>
      {failed && (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {t('common.error')}
        </p>
      )}
    </Dialog>
  )
}
