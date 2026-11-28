import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import type { BlockType } from '@shared/blocks'
import { useT } from '@renderer/i18n'
import { sidebarTransition } from '@renderer/components/Sidebar'
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
      // Same rail as the collapsed main sidebar. Rows start 12px from the edge (list px-3) and
      // pad their 28px icon tile by 6px (row px-1.5), so collapsed each row is an exact 40px
      // square: 12 + 40 + 12 = 64, plus the 1px border. Tiles sit at x = 18 in both states and
      // only the labels are clipped while the panel narrows.
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width]',
        sidebarTransition,
        collapsed ? 'w-sidebar-collapsed' : 'w-56',
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!collapsed}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-border/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ToggleIcon aria-hidden className="size-4" strokeWidth={2} />
        </button>
        <h2
          aria-hidden={collapsed}
          className={cn(
            'min-w-0 overflow-clip text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase transition-opacity [overflow-clip-margin:content-box]',
            sidebarTransition,
            collapsed && 'opacity-0',
          )}
        >
          {t('library.title')}
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-3">
        {libraryGroups.map((group, index) => (
          <section key={group.id} aria-label={t(group.labelKey)}>
            {/*
             * Expanded it shows the group's name. Collapsed a name cannot be read, so the
             * heading shrinks with the width: to a short divider as wide as the tiles between
             * groups, and to nothing above the first. Rows only slide up or down with it; they
             * never move sideways or change size.
             */}
            <div
              className={cn(
                'relative flex items-center overflow-hidden px-4.5 transition-[height]',
                sidebarTransition,
                !collapsed ? 'h-8' : index > 0 ? 'h-4' : 'h-0',
              )}
            >
              <h3
                aria-hidden={collapsed}
                className={cn(
                  'min-w-0 overflow-clip text-[0.6875rem] font-medium tracking-wide whitespace-nowrap text-muted uppercase transition-opacity [overflow-clip-margin:content-box]',
                  sidebarTransition,
                  collapsed && 'opacity-0',
                )}
              >
                {t(group.labelKey)}
              </h3>
              {index > 0 && (
                <hr
                  aria-hidden
                  className={cn(
                    'absolute inset-x-4.5 top-1/2 border-border transition-opacity',
                    sidebarTransition,
                    collapsed ? 'opacity-100' : 'opacity-0',
                  )}
                />
              )}
            </div>
            <ul className="space-y-1 px-3">
              {group.blocks.map((type) => {
                const presentation = blockPresentation[type]
                const Icon = presentation.icon
                const label = t(presentation.labelKey)
                const allowed = canAdd(type)
                const tooltip = allowed
                  ? `${label} – ${t(presentation.descriptionKey)}`
                  : t('library.limitReached', { block: label })
                return (
                  <li key={type}>
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
                      // Like the sidebar links: the label is clipped at the content box, never
                      // wrapped or unmounted, so the tile keeps its exact position.
                      className="flex w-full cursor-grab items-center gap-2.5 overflow-clip rounded-md px-1.5 py-1.5 text-left font-medium whitespace-nowrap transition-colors outline-none [overflow-clip-margin:content-box] hover:bg-border/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing active:bg-border aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:active:bg-transparent"
                    >
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-md',
                          presentation.tone,
                        )}
                      >
                        <Icon aria-hidden className="size-4" strokeWidth={2} />
                      </span>
                      {label}
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
