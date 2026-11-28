import type { PortSide } from '@shared/blocks'
import {
  describeUnsupportedNode,
  nodePorts,
  type BlueprintNode,
  type Position,
} from '@shared/blueprints'
import type { UnknownRecord } from '@shared/validation'

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

export function portRows(node: BlueprintNode): number {
  return Math.max(nodePorts(node, 'input').length, nodePorts(node, 'output').length, 1)
}

export function nodeHeight(node: BlueprintNode): number {
  return headerHeight + portsPadding * 2 + portRows(node) * portRowHeight
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
  const index = nodePorts(node, side).findIndex((port) => port.id === portId)
  if (index === -1) return null
  const offset = portOffset(side, index)
  return { x: node.position.x + offset.x, y: node.position.y + offset.y }
}

/** A smooth curve from an output to an input, leaving and entering horizontally. */
export function connectionPath(from: Position, to: Position): string {
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}

/** How far below the lower node a repeat connection runs, in canvas pixels. */
const repeatDrop = 120

/**
 * A repeat connection leads back to an earlier node: out of the source to the right, down
 * and back along below both nodes, and into the target from the left.
 */
export function repeatPath(from: Position, to: Position, bottom: number): string {
  const y = Math.max(from.y, to.y, bottom) + repeatDrop
  const r = 40
  return [
    `M ${from.x} ${from.y}`,
    `C ${from.x + r * 2} ${from.y}, ${from.x + r * 2} ${y}, ${from.x} ${y}`,
    `L ${to.x} ${y}`,
    `C ${to.x - r * 2} ${y}, ${to.x - r * 2} ${to.y}, ${to.x} ${to.y}`,
  ].join(' ')
}

/** The middle of the bottom run of `repeatPath`, e.g. for its label. */
export function repeatMidpoint(from: Position, to: Position, bottom: number): Position {
  return { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y, bottom) + repeatDrop }
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

/** Where an unsupported node is drawn: its stored position, or a stack for those without. */
export function unsupportedPosition(raw: UnknownRecord, index: number): Position {
  return describeUnsupportedNode(raw).position ?? { x: index * 24, y: index * 24 }
}
