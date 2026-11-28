import { CircleHelp, TriangleAlert } from 'lucide-react'
import type { PointerEvent } from 'react'
import { blockDefinitions, type PortDefinition, type PortSide } from '@shared/blocks'
import type { BlueprintNode, Position, UnsupportedNodeInfo } from '@shared/blueprints'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { blockPresentation, dataTypePresentation } from '../blocks'
import {
  headerHeight,
  nodeWidth,
  portOffset,
  portRowHeight,
  portsPadding,
  portRows,
} from './geometry'

/** Short key information under the node's name; a warning replaces it. */
export interface NodeSummary {
  text: string
  warning?: boolean
}

/** How a port looks while a connection is dragged. */
export type PortHighlight = 'none' | 'compatible' | 'target' | 'dimmed'

interface NodeCardProps {
  node: BlueprintNode
  summary: NodeSummary
  selected: boolean
  /** Ports with at least one connection, as `side:portId`. */
  connectedPorts: ReadonlySet<string>
  highlight: (side: PortSide, port: PortDefinition) => PortHighlight
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
  onPortPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    side: PortSide,
    port: PortDefinition,
  ) => void
  onPortPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPortPointerUp: (event: PointerEvent<HTMLDivElement>) => void
}

/** A node on the canvas: type icon, name, key information and its ports on the edges. */
export function NodeCard({
  node,
  summary,
  selected,
  connectedPorts,
  highlight,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPortPointerDown,
  onPortPointerMove,
  onPortPointerUp,
}: NodeCardProps) {
  const t = useT()
  const presentation = blockPresentation[node.type]
  const { inputs, outputs } = blockDefinitions[node.type]
  const Icon = presentation.icon
  const rows = portRows(node.type)

  return (
    <div
      data-node-id={node.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        'pointer-events-auto absolute cursor-default rounded-xl border bg-background shadow-sm transition-colors',
        selected ? 'border-accent' : 'border-border hover:border-muted/50',
      )}
      style={{ left: node.position.x, top: node.position.y, width: nodeWidth }}
    >
      <div
        className="flex items-center gap-2.5 border-b border-border px-3"
        style={{ height: headerHeight }}
      >
        <div
          title={t(presentation.labelKey)}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            presentation.tone,
          )}
        >
          <Icon aria-hidden className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{node.name}</div>
          <div
            title={summary.text}
            className={cn(
              'flex items-center gap-1 truncate text-xs',
              summary.warning ? 'text-warning' : 'text-muted',
            )}
          >
            {summary.warning && <TriangleAlert aria-hidden className="size-3 shrink-0" />}
            <span className="truncate">{summary.text}</span>
          </div>
        </div>
      </div>

      <div className="relative" style={{ paddingBlock: portsPadding }}>
        {Array.from({ length: rows }, (_, index) => {
          const input = inputs[index]
          const output = outputs[index]
          return (
            <div
              key={index}
              className="flex items-center justify-between gap-2 px-3.5 text-xs text-muted"
              style={{ height: portRowHeight }}
            >
              <span className="truncate">
                {input ? t(dataTypePresentation[input.dataType].labelKey) : ''}
              </span>
              <span className="truncate text-right">
                {output ? t(dataTypePresentation[output.dataType].labelKey) : ''}
              </span>
            </div>
          )
        })}
      </div>

      {(['input', 'output'] as const).flatMap((side) =>
        (side === 'input' ? inputs : outputs).map((port, index) => {
          const offset = portOffset(side, index)
          const data = dataTypePresentation[port.dataType]
          const state = highlight(side, port)
          const connected = connectedPorts.has(`${side}:${port.id}`)
          const label = `${t(data.labelKey)} · ${t(side === 'input' ? 'canvas.port.input' : 'canvas.port.output')}${
            port.multiple ? ` · ${t('canvas.port.multiple')}` : ''
          }`
          return (
            <div
              key={`${side}:${port.id}`}
              role="button"
              aria-label={label}
              title={label}
              data-port={`${node.id}:${side}:${port.id}`}
              onPointerDown={(event) => onPortPointerDown(event, side, port)}
              onPointerMove={onPortPointerMove}
              onPointerUp={onPortPointerUp}
              onPointerCancel={onPortPointerUp}
              onLostPointerCapture={onPortPointerUp}
              className={cn(
                'group/port absolute flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full transition-opacity',
                state === 'dimmed' && 'opacity-25',
              )}
              style={{ left: offset.x, top: offset.y }}
            >
              <span
                className={cn(
                  'block rounded-full border-2 bg-background transition-transform duration-100',
                  state === 'target'
                    ? 'size-3.5 scale-110'
                    : state === 'compatible'
                      ? 'size-3 scale-110 animate-pulse'
                      : 'size-2.5 group-hover/port:scale-150',
                )}
                style={{
                  borderColor: data.color,
                  backgroundColor:
                    connected || state === 'target' ? data.color : 'var(--color-background)',
                  boxShadow:
                    state === 'target' || state === 'compatible'
                      ? `0 0 0 4px color-mix(in oklab, ${data.color} 25%, transparent)`
                      : undefined,
                }}
              />
            </div>
          )
        }),
      )}
    </div>
  )
}

interface UnsupportedNodeCardProps {
  info: UnsupportedNodeInfo
  position: Position
  selected: boolean
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
}

/**
 * A stored node this version cannot use. It is kept and shown where it was, so the user
 * notices it and can remove it; it has no ports, since they are not known.
 */
export function UnsupportedNodeCard({
  info,
  position,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: UnsupportedNodeCardProps) {
  const t = useT()
  const label = t('node.unsupported.label')
  const detail = info.type
    ? t('node.unsupported.unknownType', { type: info.type })
    : t('node.unsupported.invalid')
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        'pointer-events-auto absolute cursor-default rounded-xl border border-dashed bg-background/80 shadow-sm transition-colors',
        selected ? 'border-accent' : 'border-warning/60 hover:border-warning',
      )}
      style={{ left: position.x, top: position.y, width: nodeWidth }}
    >
      <div className="flex items-center gap-2.5 px-3" style={{ height: headerHeight }}>
        <div
          title={label}
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning"
        >
          <CircleHelp aria-hidden className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{info.name ?? label}</div>
          <div title={detail} className="flex items-center gap-1 truncate text-xs text-warning">
            <TriangleAlert aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{detail}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
