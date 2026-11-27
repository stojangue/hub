import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

export interface TabItem<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Small counter shown after the label. */
  count?: number
}

interface TabsProps<T extends string> {
  value: T
  items: readonly TabItem<T>[]
  onChange: (value: T) => void
  /** Accessible name of the tab list. */
  label: string
}

/** Underlined tabs. Render the panel yourself, with `tabPanelProps` linking it to the tabs. */
export function Tabs<T extends string>({ value, items, onChange, label }: TabsProps<T>) {
  const baseId = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + items.length) % items.length
    const item = items[next]
    if (!item) return
    onChange(item.value)
    buttons.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-4 border-b border-border">
      {items.map((item, index) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(element) => {
              buttons.current[index] = element
            }}
            id={`${baseId}-${item.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-0.5 pb-2 font-medium transition-colors outline-none focus-visible:text-accent',
              selected
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className="rounded-full bg-border/70 px-1.5 text-xs leading-5 text-muted tabular-nums">
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
