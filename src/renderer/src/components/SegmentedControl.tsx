import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@renderer/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  /** Accessible name of the group. */
  label: string
}

/** A single-choice control of adjacent buttons, behaving like a radio group. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    const option = options[next]
    if (!option) return
    onChange(option.value)
    buttons.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-border/60 p-0.5">
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
