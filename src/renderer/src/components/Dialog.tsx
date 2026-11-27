import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

interface DialogProps {
  open: boolean
  /** Called when the dialog asks to close: Escape, a click on the backdrop or a cancel button. */
  onClose: () => void
  title: string
  description?: ReactNode
  /** Submitting the form (Enter or a `type="submit"` button) calls this. */
  onSubmit?: () => void
  /** Buttons, aligned right at the bottom. The primary action goes last. */
  footer: ReactNode
  children?: ReactNode
  role?: 'dialog' | 'alertdialog'
  className?: string
}

/** A modal dialog built on the native `<dialog>`, which handles focus trapping and Escape. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  onSubmit,
  footer,
  children,
  role = 'dialog',
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape: keep the dialog open until the parent changes `open`.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // A click on the dialog element itself is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cn(
        'm-auto w-full max-w-md rounded-xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40',
        className,
      )}
    >
      {open && (
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-[0.8125rem] text-muted">
                {description}
              </div>
            )}
          </div>
          {children}
          <div className="flex justify-end gap-2 pt-1">{footer}</div>
        </form>
      )}
    </dialog>
  )
}

interface FieldProps {
  label: string
  /** Shown below the control, e.g. a hint or an error. */
  hint?: ReactNode
  children: (id: string) => ReactNode
}

/** A labelled form control. `children` receives the ID to put on the control. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children(id)}
      {hint && <div className="text-[0.8125rem] text-muted">{hint}</div>}
    </div>
  )
}

/** Shared classes for text inputs and selects inside dialogs. */
export const inputClasses =
  'h-8 w-full rounded-md border border-border bg-background px-2.5 outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
