import { useState } from 'react'
import { useT } from '@renderer/i18n'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  /** Runs when confirmed. The dialog stays open, with buttons disabled, until it settles. */
  onConfirm: () => Promise<void>
}

/** Asks before a destructive action, e.g. deleting. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  function close() {
    if (busy) return
    setFailed(false)
    onClose()
  }

  async function confirm() {
    setBusy(true)
    setFailed(false)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      console.error(error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      role="alertdialog"
      title={title}
      description={description}
      onSubmit={() => void confirm()}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={busy} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {failed && (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {t('common.error')}
        </p>
      )}
    </Dialog>
  )
}
