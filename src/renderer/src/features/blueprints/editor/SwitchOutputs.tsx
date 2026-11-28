import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  maxConditionLength,
  maxOutputNameLength,
  maxSwitchOutputs,
  type SwitchOutput,
} from '@shared/blocks'
import { Button } from '@renderer/components/Button'
import { Dialog, Field, inputClasses } from '@renderer/components/Dialog'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'

interface SwitchOutputsProps {
  outputs: SwitchOutput[]
  onChange: (outputs: SwitchOutput[]) => void
  readOnly: boolean
}

/** Which output the dialog edits: one by its index, or a new one. */
type Editing = { index: number } | { index: null; draft: SwitchOutput } | null

/**
 * A switch's outputs as a compact list, in the order of the ports on the card. Each one opens
 * a dialog with room for its condition; the arrows move it up or down.
 */
export function SwitchOutputs({ outputs, onChange, readOnly }: SwitchOutputsProps) {
  const t = useT()
  const [editing, setEditing] = useState<Editing>(null)

  function move(index: number, by: number) {
    const target = index + by
    if (target < 0 || target >= outputs.length) return
    const next = [...outputs]
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(target, 0, moved)
    onChange(next)
  }

  const current =
    editing === null ? null : editing.index === null ? editing.draft : outputs[editing.index]

  return (
    <div className="space-y-1.5">
      <div className="text-[0.8125rem] font-medium">{t('inspector.switch.outputs')}</div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {outputs.map((output, index) => (
          <li key={output.id} className="group flex items-stretch">
            <button
              type="button"
              onClick={() => setEditing({ index })}
              className="min-w-0 flex-1 px-2.5 py-2 text-left outline-none hover:bg-border/40 focus-visible:bg-border/40"
            >
              <span className="block truncate text-[0.8125rem] font-medium">{output.name}</span>
              <span
                className={cn(
                  'line-clamp-2 text-xs',
                  output.condition.trim() ? 'text-muted' : 'text-muted/70 italic',
                )}
              >
                {output.condition.trim() || t('inspector.switch.noCondition')}
              </span>
            </button>
            {!readOnly && outputs.length > 1 && (
              <div className="flex flex-col justify-center pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={t('inspector.switch.moveUp', { name: output.name })}
                  title={t('inspector.switch.moveUp', { name: output.name })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="rounded p-0.5 text-muted hover:bg-border/60 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp aria-hidden className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={t('inspector.switch.moveDown', { name: output.name })}
                  title={t('inspector.switch.moveDown', { name: output.name })}
                  disabled={index === outputs.length - 1}
                  onClick={() => move(index, 1)}
                  className="rounded p-0.5 text-muted hover:bg-border/60 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown aria-hidden className="size-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && outputs.length < maxSwitchOutputs && (
        <Button
          onClick={() =>
            setEditing({
              index: null,
              draft: {
                id: crypto.randomUUID().slice(0, 8),
                name: t('inspector.switch.newOutput', { number: outputs.length + 1 }),
                condition: '',
              },
            })
          }
        >
          <Plus aria-hidden className="size-3.5" />
          {t('inspector.switch.addOutput')}
        </Button>
      )}

      {current && editing && (
        <OutputDialog
          key={current.id}
          output={current}
          isNew={editing.index === null}
          canDelete={editing.index !== null && outputs.length > 1}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSave={(saved) => {
            onChange(
              editing.index === null
                ? [...outputs, saved]
                : outputs.map((other, index) => (index === editing.index ? saved : other)),
            )
            setEditing(null)
          }}
          onDelete={() => {
            onChange(outputs.filter((_, index) => index !== editing.index))
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function OutputDialog({
  output,
  isNew,
  canDelete,
  readOnly,
  onClose,
  onSave,
  onDelete,
}: {
  output: SwitchOutput
  isNew: boolean
  canDelete: boolean
  readOnly: boolean
  onClose: () => void
  onSave: (output: SwitchOutput) => void
  onDelete: () => void
}) {
  const t = useT()
  const [name, setName] = useState(output.name)
  const [condition, setCondition] = useState(output.condition)
  const valid = name.trim() !== ''

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? t('inspector.switch.addOutput') : t('inspector.switch.editOutput')}
      description={t('inspector.switch.dialogHelp')}
      className="max-w-xl"
      onSubmit={() => {
        if (valid && !readOnly) onSave({ ...output, name: name.trim(), condition })
      }}
      footer={
        <>
          {canDelete && !readOnly && (
            <Button variant="ghost" onClick={onDelete} className="mr-auto hover:text-danger">
              <Trash2 aria-hidden className="size-3.5" />
              {t('inspector.switch.deleteOutput')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {!readOnly && (
            <Button type="submit" variant="primary" disabled={!valid}>
              {isNew ? t('inspector.switch.addOutput') : t('common.save')}
            </Button>
          )}
        </>
      }
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-4">
        <Field label={t('inspector.switch.outputName')}>
          {(id) => (
            <input
              id={id}
              value={name}
              maxLength={maxOutputNameLength}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              className={inputClasses}
            />
          )}
        </Field>
        <Field
          label={t('inspector.switch.conditionLabel')}
          hint={t('inspector.switch.conditionHint')}
        >
          {(id) => (
            <textarea
              id={id}
              value={condition}
              maxLength={maxConditionLength}
              onChange={(event) => setCondition(event.target.value)}
              placeholder={t('inspector.switch.conditionPlaceholder')}
              rows={10}
              className={cn(inputClasses, 'h-auto resize-y py-2 leading-relaxed')}
            />
          )}
        </Field>
      </fieldset>
    </Dialog>
  )
}
