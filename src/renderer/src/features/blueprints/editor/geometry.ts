import { blockDefinitions, type BlockType, type PortSide } from '@shared/blocks'
import type { BlueprintNode, Position } from '@shared/blueprints'

/**
 * The visible part of the canvas. `x`/`y` is the screen offset of the canvas origin
 * from the center of the viewport, so the starting view keeps the origin centered.
 */
export interface View {
  x: number
  y: number
  zoom: number
}

/** The canvas point at the center of the viewport. */
export function viewCenter(view: View): Position {
  return { x: -view.x / view.zoom, y: -view.y / view.zoom }
}

/**
 * Node layout in canvas pixels. The node's DOM uses the same numbers, so port positions
 * can be computed without measuring, e.g. for connections and snapping.
 */
export const nodeWidth = 232
export const headerHeight = 52
export const portsPadding = 6
export const portRowHeight = 26

export function portRows(type: BlockType): number {
  const { inputs, outputs } = blockDefinitions[type]
  return Math.max(inputs.length, outputs.length, 1)
}

export function nodeHeight(type: BlockType): number {
  return headerHeight + portsPadding * 2 + portRows(type) * portRowHeight
}

/** Offset of a port's center from the node's top-left corner. */
export function portOffset(side: PortSide, index: number): Position {
  return {
    x: side === 'input' ? 0 : nodeWidth,
    y: headerHeight + portsPadding + index * portRowHeight + portRowHeight / 2,
  }
}

/** Position of a port's center on the canvas, or `null` if the node has no such port. */
export function portPosition(node: BlueprintNode, side: PortSide, portId: string): Position | null {
  const ports =
    side === 'input' ? blockDefinitions[node.type].inputs : blockDefinitions[node.type].outputs
  const index = ports.findIndex((port) => port.id === portId)
  if (index === -1) return null
  const offset = portOffset(side, index)
  return { x: node.position.x + offset.x, y: node.position.y + offset.y }
}

/** A smooth curve from an output to an input, leaving and entering horizontally. */
export function connectionPath(from: Position, to: Position): string {
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}

/** The point halfway along `connectionPath`, e.g. for a delete button on the line. */
export function connectionMidpoint(from: Position, to: Position): Position {
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2)
  // A cubic Bézier curve at t = 0.5: (P0 + 3·P1 + 3·P2 + P3) / 8.
  return {
    x: (from.x + 3 * (from.x + bend) + 3 * (to.x - bend) + to.x) / 8,
    y: (from.y + 3 * from.y + 3 * to.y + to.y) / 8,
  }
}
