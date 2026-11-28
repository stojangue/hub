import { Minus, Plus, Repeat } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  isBlockType,
  type BlockType,
  type DataType,
  type PortDefinition,
  type PortSide,
} from '@shared/blocks'
import {
  checkConnection,
  checkRepeat,
  describeUnsupportedNode,
  findNodePort,
  nodePorts,
  type BlueprintContent,
  type BlueprintNode,
  type PortRef,
  type Position,
} from '@shared/blueprints'
import { Button } from '@renderer/components/Button'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { blockDragType, dataTypePresentation } from '../blocks'
import {
  connectionMidpoint,
  connectionPath,
  nodeHeight,
  portPosition,
  repeatMidpoint,
  repeatPath,
  unsupportedPosition,
  type View,
} from './geometry'
import { NodeCard, UnsupportedNodeCard, type NodeSummary, type PortHighlight } from './NodeCard'

const minZoom = 0.25
const maxZoom = 4
/** Factor per click on the −/+ buttons. */
const zoomStep = 1.25
/** Distance between grid dots at 100 %, in pixels. */
const gridSize = 24
/** Dots closer than this on screen are thinned out, so the grid stays calm when zoomed out. */
const minGridSpacing = 12
/** Wheel deltas per event are capped, so a mouse wheel notch zooms about as much as a pinch. */
const maxZoomDelta = 25
const zoomSensitivity = 0.01
/** A dragged connection snaps to a compatible port this close, in screen pixels. */
const snapDistance = 40
/** Pointer movement below this, in screen pixels, still counts as a click. */
const clickTolerance = 4

/**
 * The visible part of the canvas. `x`/`y` is the screen offset of the canvas origin
 * from the center of the viewport, so the starting view keeps the origin centered.
 */
export type { View } from './geometry'

export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'connection'; id: string }
  /** An unsupported node, by its index in `content.unsupported.nodes`. */
  | { kind: 'unsupported'; index: number }
  | null

/** What can be moved by dragging it. */
type Movable = { kind: 'node'; id: string } | { kind: 'unsupported'; index: number }

function clampZoom(zoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom))
}

/** Changes the zoom so the canvas point under `(cx, cy)` (relative to the center) stays put. */
function zoomAround(view: View, cx: number, cy: number, zoom: number): View {
  const next = clampZoom(zoom)
  const scale = next / view.zoom
  return { zoom: next, x: cx - (cx - view.x) * scale, y: cy - (cy - view.y) * scale }
}

/** Wheel deltas in pixels, whatever unit the device reports. */
function wheelPixels(event: WheelEvent): { dx: number; dy: number } {
  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1
  return { dx: event.deltaX * unit, dy: event.deltaY * unit }
}

const portKey = (nodeId: string, port: string) => `${nodeId}:${port}`

/** A connection being drawn from a port. */
interface ConnectDrag {
  pointerId: number
  origin: PortRef & { side: PortSide; dataType: DataType }
  cursor: Position
  /** The compatible port it snaps to, if any. */
  target: PortRef | null
  /** Ports on the other side that can be linked, as `nodeId:port`. */
  compatible: ReadonlySet<string>
}

type PointerAction =
  | { kind: 'pan'; pointerId: number; x: number; y: number; distance: number }
  | {
      kind: 'move'
      pointerId: number
      target: Movable
      startX: number
      startY: number
      origin: Position
    }

interface CanvasProps {
  content: BlueprintContent
  view: View
  onViewChange: Dispatch<SetStateAction<View>>
  selection: Selection
  onSelect: (selection: Selection) => void
  summaries: Record<string, NodeSummary>
  onMoveNode: (id: string, position: Position) => void
  onMoveUnsupported: (index: number, position: Position) => void
  onConnect: (from: PortRef, to: PortRef) => void
  onDropBlock: (type: BlockType, center: Position) => void
  onDeleteConnection: (id: string) => void
  /** Overlays in the bottom-left corner, e.g. the save status. */
  status?: ReactNode
  /** Shown at the top, e.g. why parts of the blueprint need attention. */
  notice?: ReactNode
  /** Nodes can be selected and the view moved, but nothing can be changed. */
  readOnly?: boolean
}

/** A pannable, zoomable canvas with a dot grid, nodes and the connections between them. */
export function Canvas({
  content,
  view,
  onViewChange: setView,
  selection,
  onSelect,
  summaries,
  onMoveNode,
  onMoveUnsupported,
  onConnect,
  onDropBlock,
  onDeleteConnection,
  status,
  notice,
  readOnly = false,
}: CanvasProps) {
  const t = useT()
  const viewport = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  useLayoutEffect(() => {
    viewRef.current = view
  })
  const action = useRef<PointerAction | null>(null)
  const [panning, setPanning] = useState(false)
  const [connectDrag, setConnect] = useState<ConnectDrag | null>(null)
  // A drag whose origin node was deleted meanwhile is over; otherwise the other ports would
  // keep glowing as connection targets.
  const connect =
    connectDrag && content.nodes.some((node) => node.id === connectDrag.origin.nodeId)
      ? connectDrag
      : null
  const [dropActive, setDropActive] = useState(false)

  // Registered by hand: React's wheel listener is passive and cannot prevent scrolling.
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const target: HTMLDivElement = element

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const { dx, dy } = wheelPixels(event)

      // Trackpad pinches arrive as wheel events with `ctrlKey` set.
      if (event.ctrlKey || event.metaKey) {
        const rect = target.getBoundingClientRect()
        const cx = event.clientX - rect.left - rect.width / 2
        const cy = event.clientY - rect.top - rect.height / 2
        const delta = Math.min(maxZoomDelta, Math.max(-maxZoomDelta, dy))
        setView((current) =>
          zoomAround(current, cx, cy, current.zoom * Math.exp(-delta * zoomSensitivity)),
        )
        return
      }

      // Shift + mouse wheel scrolls sideways.
      const [panX, panY] = event.shiftKey && dx === 0 ? [dy, 0] : [dx, dy]
      setView((current) => ({ ...current, x: current.x - panX, y: current.y - panY }))
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [setView])

  // The view is relative to the center, so when a side panel opens, closes or collapses,
  // the offset is corrected to keep the content where it was on screen.
  const size = useRef<{ width: number; height: number } | null>(null)
  const correctForResize = useCallback(() => {
    const element = viewport.current
    if (!element) return
    const next = { width: element.clientWidth, height: element.clientHeight }
    const previous = size.current
    size.current = next
    if (!previous) return
    const dx = (next.width - previous.width) / 2
    const dy = (next.height - previous.height) / 2
    if (dx !== 0 || dy !== 0) {
      setView((current) => ({ ...current, x: current.x - dx, y: current.y - dy }))
    }
  }, [setView])

  // Opening or closing the inspector happens in the same render as a selection change, so
  // the size is checked after every render, before the browser paints. Correcting it later,
  // e.g. in the observer below, would show one frame with the content shifted.
  useLayoutEffect(correctForResize)

  // Window resizes and animated panels do not render the canvas.
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(correctForResize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [correctForResize])

  // Escape cancels a connection that is being drawn.
  useEffect(() => {
    if (!connect) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setConnect(null)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [connect])

  function toCanvas(clientX: number, clientY: number): Position {
    const rect = viewport.current?.getBoundingClientRect()
    const current = viewRef.current
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - rect.width / 2 - current.x) / current.zoom,
      y: (clientY - rect.top - rect.height / 2 - current.y) / current.zoom,
    }
  }

  // --- Panning and deselecting ------------------------------------------------------------

  function handleViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Left or middle button on the empty canvas.
    if ((event.button !== 0 && event.button !== 1) || event.target !== event.currentTarget) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    action.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: 0,
    }
    setPanning(true)
  }

  function handleViewportPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = action.current
    if (current?.kind !== 'pan' || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    action.current = {
      ...current,
      x: event.clientX,
      y: event.clientY,
      distance: current.distance + Math.hypot(dx, dy),
    }
    setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy }))
  }

  function handleViewportPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const current = action.current
    if (current?.kind !== 'pan' || current.pointerId !== event.pointerId) return
    action.current = null
    setPanning(false)
    // A click on the empty canvas closes the inspector.
    if (current.distance < clickTolerance && event.type === 'pointerup') onSelect(null)
  }

  // --- Moving nodes -----------------------------------------------------------------------

  function handleNodePointerDown(
    event: PointerEvent<HTMLDivElement>,
    target: Movable,
    origin: Position,
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    viewport.current?.focus()
    onSelect(target)
    if (readOnly) return
    event.currentTarget.setPointerCapture(event.pointerId)
    action.current = {
      kind: 'move',
      pointerId: event.pointerId,
      target,
      startX: event.clientX,
      startY: event.clientY,
      origin,
    }
  }

  function handleNodePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = action.current
    if (current?.kind !== 'move' || current.pointerId !== event.pointerId) return
    const zoom = viewRef.current.zoom
    const position = {
      x: Math.round(current.origin.x + (event.clientX - current.startX) / zoom),
      y: Math.round(current.origin.y + (event.clientY - current.startY) / zoom),
    }
    if (current.target.kind === 'node') onMoveNode(current.target.id, position)
    else onMoveUnsupported(current.target.index, position)
  }

  function handleNodePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (action.current?.pointerId === event.pointerId) action.current = null
  }

  // --- Drawing connections ----------------------------------------------------------------

  function handlePortPointerDown(
    event: PointerEvent<HTMLDivElement>,
    node: BlueprintNode,
    side: PortSide,
    port: PortDefinition,
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    if (readOnly) {
      viewport.current?.focus()
      onSelect({ kind: 'node', id: node.id })
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    viewport.current?.focus()

    const compatible = new Set<string>()
    const ref = { nodeId: node.id, port: port.id }
    for (const candidate of content.nodes) {
      for (const other of nodePorts(candidate, side === 'output' ? 'input' : 'output')) {
        const otherRef = { nodeId: candidate.id, port: other.id }
        const [from, to] = side === 'output' ? [ref, otherRef] : [otherRef, ref]
        // A link back to an earlier agent becomes a repeat connection.
        const check = checkConnection(content, from, to)
        if (check.ok || (check.reason === 'cycle' && checkRepeat(content, from, to).ok)) {
          compatible.add(portKey(candidate.id, other.id))
        }
      }
    }
    setConnect({
      pointerId: event.pointerId,
      origin: { ...ref, side, dataType: port.dataType },
      cursor: toCanvas(event.clientX, event.clientY),
      target: null,
      compatible,
    })
  }

  function handlePortPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!connect || connect.pointerId !== event.pointerId) return
    const cursor = toCanvas(event.clientX, event.clientY)
    const otherSide: PortSide = connect.origin.side === 'output' ? 'input' : 'output'
    const reach = snapDistance / viewRef.current.zoom
    let target: PortRef | null = null
    let best = reach
    for (const node of content.nodes) {
      for (const port of nodePorts(node, otherSide)) {
        if (!connect.compatible.has(portKey(node.id, port.id))) continue
        const position = portPosition(node, otherSide, port.id)
        if (!position) continue
        const distance = Math.hypot(position.x - cursor.x, position.y - cursor.y)
        if (distance <= best) {
          best = distance
          target = { nodeId: node.id, port: port.id }
        }
      }
    }
    setConnect({ ...connect, cursor, target })
  }

  function handlePortPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!connect || connect.pointerId !== event.pointerId) return
    const { origin, target } = connect
    setConnect(null)
    // Dropping on empty space cancels.
    if (!target || event.type !== 'pointerup') return
    const ref = { nodeId: origin.nodeId, port: origin.port }
    if (origin.side === 'output') onConnect(ref, target)
    else onConnect(target, ref)
  }

  function highlightFor(node: BlueprintNode) {
    return (side: PortSide, port: PortDefinition): PortHighlight => {
      if (!connect) return 'none'
      const key = portKey(node.id, port.id)
      if (
        node.id === connect.origin.nodeId &&
        port.id === connect.origin.port &&
        side === connect.origin.side
      ) {
        return 'target'
      }
      if (side === connect.origin.side) return 'dimmed'
      if (connect.target && connect.target.nodeId === node.id && connect.target.port === port.id) {
        return 'target'
      }
      return connect.compatible.has(key) ? 'compatible' : 'dimmed'
    }
  }

  // --- Dropping blocks from the library ---------------------------------------------------

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (readOnly || !event.dataTransfer.types.includes(blockDragType)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    setDropActive(false)
    const type = event.dataTransfer.getData(blockDragType)
    if (readOnly || !isBlockType(type)) return
    event.preventDefault()
    onDropBlock(type, toCanvas(event.clientX, event.clientY))
  }

  // --- Rendering --------------------------------------------------------------------------

  const nodesById = useMemo(
    () => new Map(content.nodes.map((node) => [node.id, node])),
    [content.nodes],
  )
  const connectedPorts = useMemo(() => {
    const result = new Map<string, Set<string>>()
    const add = (nodeId: string, key: string) => {
      const set = result.get(nodeId) ?? new Set<string>()
      set.add(key)
      result.set(nodeId, set)
    }
    for (const connection of content.connections) {
      add(connection.from.nodeId, `output:${connection.from.port}`)
      add(connection.to.nodeId, `input:${connection.to.port}`)
    }
    return result
  }, [content.connections])

  let preview: { path: string; snapped: boolean } | null = null
  if (connect) {
    const originNode = nodesById.get(connect.origin.nodeId)
    const start = originNode && portPosition(originNode, connect.origin.side, connect.origin.port)
    const targetNode = connect.target && nodesById.get(connect.target.nodeId)
    const end =
      (targetNode &&
        connect.target &&
        portPosition(
          targetNode,
          connect.origin.side === 'output' ? 'input' : 'output',
          connect.target.port,
        )) ||
      connect.cursor
    if (start) {
      preview = {
        path:
          connect.origin.side === 'output'
            ? connectionPath(start, end)
            : connectionPath(end, start),
        snapped: connect.target !== null,
      }
    }
  }

  let spacing = gridSize * view.zoom
  while (spacing < minGridSpacing) spacing *= 2
  const percent = Math.round(view.zoom * 100)

  return (
    <div className="relative h-full min-w-0 flex-1 overflow-hidden bg-background select-none">
      <div
        ref={viewport}
        role="application"
        tabIndex={-1}
        aria-label={t('canvas.label')}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerEnd}
        onPointerCancel={handleViewportPointerEnd}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDrop}
        className={cn(
          'absolute inset-0 touch-none outline-none',
          connect ? 'cursor-crosshair' : panning ? 'cursor-grabbing' : 'cursor-grab',
          dropActive && 'bg-accent/5',
        )}
        style={{
          // The dot sits in the middle of each tile; 50% aligns a tile center with the origin.
          backgroundImage:
            'radial-gradient(circle, color-mix(in oklab, var(--color-muted) 45%, transparent) 1px, transparent 1.5px)',
          backgroundSize: `${spacing}px ${spacing}px`,
          backgroundPosition: `calc(50% + ${view.x}px) calc(50% + ${view.y}px)`,
        }}
      >
        {/* The canvas content layer, in canvas coordinates. */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={1}
            height={1}
          >
            {content.connections.map((connection) => {
              const fromNode = nodesById.get(connection.from.nodeId)
              const toNode = nodesById.get(connection.to.nodeId)
              const from = fromNode && portPosition(fromNode, 'output', connection.from.port)
              const to = toNode && portPosition(toNode, 'input', connection.to.port)
              const port = fromNode && findNodePort(fromNode, 'output', connection.from.port)
              if (!fromNode || !toNode || !from || !to || !port) return null
              if (connection.repeat) {
                const bottom = Math.max(
                  fromNode.position.y + nodeHeight(fromNode),
                  toNode.position.y + nodeHeight(toNode),
                )
                const middle = repeatMidpoint(from, to, bottom)
                const selected = selection?.kind === 'connection' && selection.id === connection.id
                const label = t('canvas.repeat', { rounds: connection.repeat.maxRounds })
                return (
                  // A repeat runs back below the nodes, dashed, with its rounds in a label that
                  // selects it.
                  <g key={connection.id} className={cn(connect && 'opacity-40')}>
                    <path
                      d={repeatPath(from, to, bottom)}
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray="6 5"
                      strokeLinecap="round"
                      className={selected ? 'stroke-accent' : 'stroke-accent/60'}
                    />
                    <foreignObject
                      x={middle.x - 70}
                      y={middle.y - 13}
                      width={140}
                      height={26}
                      className="overflow-visible"
                    >
                      <div className="flex h-full items-center justify-center">
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => onSelect({ kind: 'connection', id: connection.id })}
                          className={cn(
                            'pointer-events-auto flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs font-medium whitespace-nowrap text-accent shadow-sm',
                            selected ? 'border-accent' : 'border-accent/40 hover:border-accent',
                          )}
                        >
                          <Repeat aria-hidden className="size-3" />
                          {label}
                        </button>
                      </div>
                    </foreignObject>
                  </g>
                )
              }
              const path = connectionPath(from, to)
              const middle = connectionMidpoint(from, to)
              const label = t('canvas.deleteConnection')
              return (
                // Hovering a connection lights it up and shows a button in its middle that
                // removes it.
                <g
                  key={connection.id}
                  className={cn('group/edge', connect && 'opacity-40')}
                  style={{ '--edge': dataTypePresentation[port.dataType].color } as CSSProperties}
                >
                  <path
                    d={path}
                    fill="none"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="[stroke:color-mix(in_oklab,var(--edge)_70%,transparent)] transition-[stroke] duration-300 ease-out group-hover/edge:[stroke:var(--edge)]"
                  />
                  {/* A wide, invisible line that makes the connection easy to hover. */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className={cn(
                      'cursor-pointer',
                      !connect && !readOnly && '[pointer-events:stroke]',
                    )}
                  />
                  {!connect && !readOnly && (
                    <g
                      role="button"
                      aria-label={label}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onDeleteConnection(connection.id)}
                      className="pointer-events-auto cursor-pointer opacity-0 transition-opacity duration-300 ease-out group-hover/edge:opacity-100"
                      transform={`translate(${middle.x} ${middle.y}) scale(${1 / view.zoom})`}
                    >
                      <title>{label}</title>
                      <circle r={10} strokeWidth={1} className="fill-background stroke-border" />
                      <path
                        d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        className="stroke-muted"
                      />
                    </g>
                  )}
                </g>
              )
            })}
            {preview && (
              <path
                d={preview.path}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={preview.snapped ? undefined : '6 6'}
                className="stroke-accent"
              />
            )}
          </svg>

          {content.unsupported.nodes.map((raw, index) => {
            const position = unsupportedPosition(raw, index)
            return (
              <UnsupportedNodeCard
                key={`unsupported:${index}`}
                info={describeUnsupportedNode(raw)}
                position={position}
                selected={selection?.kind === 'unsupported' && selection.index === index}
                onPointerDown={(event) =>
                  handleNodePointerDown(event, { kind: 'unsupported', index }, position)
                }
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
              />
            )
          })}

          {content.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              summary={summaries[node.id] ?? { text: '' }}
              selected={selection?.kind === 'node' && selection.id === node.id}
              connectedPorts={connectedPorts.get(node.id) ?? emptySet}
              highlight={highlightFor(node)}
              onPointerDown={(event) =>
                handleNodePointerDown(event, { kind: 'node', id: node.id }, node.position)
              }
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onPortPointerDown={(event, side, port) =>
                handlePortPointerDown(event, node, side, port)
              }
              onPortPointerMove={handlePortPointerMove}
              onPortPointerUp={handlePortPointerUp}
            />
          ))}
        </div>
      </div>

      {notice && (
        <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-center gap-2 *:pointer-events-auto">
          {notice}
        </div>
      )}

      {status && <div className="absolute bottom-4 left-4">{status}</div>}

      <div
        role="toolbar"
        aria-label={t('canvas.controls')}
        className="absolute right-4 bottom-4 flex items-center gap-0.5 rounded-lg border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur"
      >
        <Button
          variant="ghost"
          iconOnly
          onClick={() => setView((current) => zoomAround(current, 0, 0, current.zoom / zoomStep))}
          disabled={view.zoom <= minZoom}
          aria-label={t('canvas.zoomOut')}
          title={t('canvas.zoomOut')}
        >
          <Minus aria-hidden className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => setView((current) => zoomAround(current, 0, 0, 1))}
          aria-label={t('canvas.zoomLevel', { percent })}
          title={t('canvas.zoomLevel', { percent })}
          className="w-16 px-0 text-xs whitespace-nowrap tabular-nums"
        >
          {percent} %
        </Button>
        <Button
          variant="ghost"
          iconOnly
          onClick={() => setView((current) => zoomAround(current, 0, 0, current.zoom * zoomStep))}
          disabled={view.zoom >= maxZoom}
          aria-label={t('canvas.zoomIn')}
          title={t('canvas.zoomIn')}
        >
          <Plus aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

const emptySet: ReadonlySet<string> = new Set()
