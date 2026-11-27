import { Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@renderer/components/Button'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'

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

/**
 * The visible part of the canvas. `x`/`y` is the screen offset of the canvas origin
 * from the center of the viewport, so the starting view keeps the origin centered.
 */
interface View {
  x: number
  y: number
  zoom: number
}

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

/** An empty, pannable and zoomable canvas with a dot grid. Nodes will be added later. */
export function BlueprintCanvas() {
  const t = useT()
  const viewport = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const zoomBy = useCallback((factor: number) => {
    setView((current) => zoomAround(current, 0, 0, current.zoom * factor))
  }, [])

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
  }, [])

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    // Left or middle button; ignore clicks on the toolbar.
    if ((event.button !== 0 && event.button !== 1) || event.target !== event.currentTarget) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    setDragging(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    drag.current = { ...start, x: event.clientX, y: event.clientY }
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
  }

  let spacing = gridSize * view.zoom
  while (spacing < minGridSpacing) spacing *= 2
  const percent = Math.round(view.zoom * 100)

  return (
    <div className="relative h-full overflow-hidden bg-background select-none">
      <div
        ref={viewport}
        role="application"
        aria-label={t('canvas.label')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn('absolute inset-0 touch-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        style={{
          // The dot sits in the middle of each tile; 50% aligns a tile center with the origin.
          backgroundImage:
            'radial-gradient(circle, color-mix(in oklab, var(--color-muted) 45%, transparent) 1px, transparent 1.5px)',
          backgroundSize: `${spacing}px ${spacing}px`,
          backgroundPosition: `calc(50% + ${view.x}px) calc(50% + ${view.y}px)`,
        }}
      >
        {/* The canvas content layer, in canvas coordinates. Empty until nodes exist. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        />
      </div>

      <div
        role="toolbar"
        aria-label={t('canvas.controls')}
        className="absolute right-4 bottom-4 flex items-center gap-0.5 rounded-lg border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur"
      >
        <Button
          variant="ghost"
          iconOnly
          onClick={() => zoomBy(1 / zoomStep)}
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
          onClick={() => zoomBy(zoomStep)}
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
