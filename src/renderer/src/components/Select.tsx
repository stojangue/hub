import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { cn } from '@renderer/lib/cn'

/** Gap between the trigger and the menu, and between the menu and the window edge, in px. */
const menuGap = 4
const viewportMargin = 8
/** Tallest the menu gets when there is room (matches `max-h-60`). */
const menuMaxHeight = 240
/** An option row (`h-8`) plus the menu's padding and border. */
const optionHeight = 32
const menuChrome = 10

/**
 * Places the menu below the trigger, or above it when it does not fit below and there is
 * more room above. Its height is capped to the room on that side, so it scrolls instead of
 * running past the window edge.
 */
function menuPosition(rect: DOMRect, optionCount: number): CSSProperties {
  const wanted = Math.min(menuMaxHeight, optionCount * optionHeight + menuChrome)
  const below = window.innerHeight - rect.bottom - menuGap - viewportMargin
  const above = rect.top - menuGap - viewportMargin
  const base = { left: rect.left, width: rect.width }
  if (below >= wanted || below >= above) {
    return { ...base, top: rect.bottom + menuGap, maxHeight: Math.max(0, Math.min(wanted, below)) }
  }
  return {
    ...base,
    bottom: window.innerHeight - rect.top + menuGap,
    maxHeight: Math.max(0, Math.min(wanted, above)),
  }
}

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  /** Put on the trigger button, so a `<label htmlFor>` names it. */
  id?: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  /** Shown while nothing is selected. */
  placeholder: string
  disabled?: boolean
}

/**
 * A single-choice dropdown styled like the other inputs, instead of the native `<select>`
 * whose arrow and popup menu do not match the app. Works inside modal dialogs.
 */
export function Select({ id, value, options, onChange, placeholder, disabled }: SelectProps) {
  const listId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties>({})
  const selected = options.find((option) => option.value === value)

  function show() {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect || disabled || options.length === 0) return
    // Fixed positioning escapes the dialog's or panel's scroll container.
    setPosition(menuPosition(rect, options.length))
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    )
    setOpen(true)
  }

  function hide(refocus = true) {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  function choose(index: number) {
    const option = options[index]
    if (option) onChange(option.value)
    hide()
  }

  useEffect(() => {
    if (!open) return
    list.current?.focus()
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!list.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    function handleViewportChange() {
      setOpen(false)
    }
    // Scrolling a container around the trigger would leave the fixed menu behind.
    function handleScroll(event: Event) {
      if (!list.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleViewportChange)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleViewportChange)
    }
  }, [open])

  // Keeps the highlighted option visible when moving with the keyboard.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function handleTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      show()
    }
  }

  function handleListKeyDown(event: KeyboardEvent) {
    const last = options.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key] ?? active)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape') {
      // Closes only the list, not the surrounding dialog.
      event.preventDefault()
      event.stopPropagation()
      hide()
    } else if (event.key === 'Tab') {
      hide(false)
    }
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? hide() : show())}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background pr-2 pl-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={handleListKeyDown}
          style={position}
          className="fixed z-50 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background p-1 shadow-lg outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
                className={cn(
                  'flex h-8 cursor-default items-center gap-2 rounded-md px-2',
                  index === active && 'bg-border/60',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected && <Check aria-hidden className="size-3.5 shrink-0 text-accent" />}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
