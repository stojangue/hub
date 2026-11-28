import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import type { BlockType } from '@shared/blocks'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { blockDragType, blockPresentation, libraryGroups } from '../blocks'

const storageKey = 'hub.blueprints.libraryCollapsed'

/** Whether the panel was collapsed last time; browser storage may be unavailable. */
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(storageKey, String(collapsed))
  } catch {
    // Not remembering it is fine.
  }
}

interface LibraryProps {
  /** Called on click; the block is placed in the middle of the current view. */
  onAdd: (type: BlockType) => void
  /** Whether another node of the block may be added, e.g. only one work item. */
  canAdd: (type: BlockType) => boolean
}

/**
 * The building blocks, in groups. A block is dragged onto the canvas or added with a click.
 * The panel collapses to icons.
 */
export function Library({ onAdd, canAdd }: LibraryProps) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const toggleLabel = collapsed ? t('library.expand') : t('library.collapse')
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  function toggle() {
    setCollapsed(!collapsed)
    saveCollapsed(!collapsed)
  }

  return (
    <aside
      aria-label={t('library.label')}
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-surface',
        collapsed ? 'w-13' : 'w-52',
      )}
    >
      <div
        className={cn(
          'flex h-11 shrink-0 items-center',
          collapsed ? 'justify-center' : 'justify-between pr-2 pl-4',
        )}
      >
        {!collapsed && (
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t('library.title')}
          </h2>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!collapsed}
          className="flex size-7 items-center justify-center rounded-md text-muted outline-none hover:bg-border/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ToggleIcon aria-hidden className="size-4" />
        </button>
      </div>

      <div
        className={cn('min-h-0 flex-1 overflow-y-auto pb-3', collapsed ? 'space-y-2' : 'space-y-4')}
      >
        {libraryGroups.map((group, index) => (
          <section key={group.id} aria-label={t(group.labelKey)}>
            {collapsed ? (
              index > 0 && <hr className="mx-3 mb-2 border-border" />
            ) : (
              <h3 className="px-4 pb-1 text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
                {t(group.labelKey)}
              </h3>
            )}
            <ul
              className={cn(
                'space-y-0.5',
                collapsed ? 'flex flex-col items-center px-1.5' : 'px-2',
              )}
            >
              {group.blocks.map((type) => {
                const presentation = blockPresentation[type]
                const Icon = presentation.icon
                const label = t(presentation.labelKey)
                const allowed = canAdd(type)
                const tooltip = allowed
                  ? `${label} – ${t(presentation.descriptionKey)}`
                  : t('library.limitReached', { block: label })
                return (
                  <li key={type} className={collapsed ? '' : 'w-full'}>
                    <button
                      type="button"
                      draggable={allowed}
                      // Not `disabled`, so the tooltip still explains why.
                      aria-disabled={!allowed}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(blockDragType, type)
                        event.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => allowed && onAdd(type)}
                      title={tooltip}
                      aria-label={label}
                      className={cn(
                        'flex cursor-grab items-center gap-2.5 rounded-lg outline-none hover:bg-border/60 focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent',
                        collapsed ? 'size-9 justify-center' : 'h-9 w-full px-2',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md',
                          presentation.tone,
                        )}
                      >
                        <Icon aria-hidden className="size-3.5" />
                      </span>
                      {!collapsed && <span className="truncate">{label}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
