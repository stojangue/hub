import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { blockDefinitions, canAddBlock, type BlockType } from '@shared/blocks'
import {
  checkConnection,
  nextNodeName,
  sourceOf,
  type Blueprint,
  type BlueprintContent,
  type BlueprintNode,
  type PortRef,
  type Position,
} from '@shared/blueprints'
import { useClaudeStatus } from '@renderer/claude/use-claude-status'
import { useT, type TranslateFn } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { useSettings } from '@renderer/settings/context'
import { blockPresentation } from '../blocks'
import { Canvas, type Selection } from './Canvas'
import { headerHeight, nodeWidth, viewCenter, type View } from './geometry'
import { Inspector } from './Inspector'
import { Library } from './Library'
import type { NodeSummary } from './NodeCard'
import { useFolderStatus } from './use-folder-status'

/** Changes are saved this long after the last edit, so a drag is saved once. */
const saveDelay = 300
/** Offset for a clicked block when its spot is already taken. */
const placementStep = 32

type SaveState = 'saved' | 'saving' | 'failed'

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function summarize(
  node: BlueprintNode,
  t: TranslateFn,
  folders: Record<string, boolean>,
  cliAvailable: boolean | undefined,
): NodeSummary {
  switch (node.type) {
    case 'folder':
      if (!node.config.path) return { text: t('node.folder.none'), warning: true }
      if (folders[node.config.path] === false) {
        return { text: t('node.folder.missing', { path: node.config.path }), warning: true }
      }
      return { text: node.config.path }
    case 'workItem':
      return { text: t('node.workItem.summary') }
    case 'agent':
      if (cliAvailable === false) return { text: t('node.agent.cliMissing'), warning: true }
      return {
        text: node.config.instructions.trim().split('\n')[0] || t('node.agent.noInstructions'),
      }
  }
}

/** The blueprint editor: library on the left, canvas in the middle, inspector on the right. */
export function BlueprintEditor({ blueprint }: { blueprint: Blueprint }) {
  const t = useT()
  const { settings } = useSettings()
  const [content, setContent] = useState<BlueprintContent>(blueprint.content)
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [selection, setSelection] = useState<Selection>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const claude = useClaudeStatus()
  const cliAvailable = claude.data ? claude.data.state === 'installed' : undefined

  const folderPaths = useMemo(
    () =>
      content.nodes.flatMap((node) =>
        node.type === 'folder' && node.config.path ? [node.config.path] : [],
      ),
    [content.nodes],
  )
  const folders = useFolderStatus(folderPaths)

  // --- Saving -----------------------------------------------------------------------------

  const pending = useRef<BlueprintContent | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    if (!next) return
    pending.current = null
    setSaveState('saving')
    api.blueprints.update(blueprint.id, { content: next }).then(
      () => setSaveState((state) => (pending.current ? state : 'saved')),
      (error: unknown) => {
        console.error('Failed to save blueprint', error)
        // Kept for a retry, unless newer changes are already waiting.
        pending.current ??= next
        setSaveState('failed')
      },
    )
  }, [blueprint.id])

  const change = useCallback(
    (update: (content: BlueprintContent) => BlueprintContent) => {
      setContent((current) => {
        const next = update(current)
        if (next === current) return current
        pending.current = next
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, saveDelay)
        return next
      })
    },
    [flush],
  )

  // Leaving the page saves what is still pending.
  useEffect(() => flush, [flush])

  // --- Editing ----------------------------------------------------------------------------

  function addBlock(type: BlockType, center: Position) {
    const start = {
      x: Math.round(center.x - nodeWidth / 2),
      y: Math.round(center.y - headerHeight / 2),
    }
    if (!canAddBlock(type, content.nodes)) return
    const id = crypto.randomUUID()
    change((current) => {
      if (!canAddBlock(type, current.nodes)) return current
      let position = start
      // A clicked block lands in the middle of the view, shifted if that spot is taken.
      while (
        current.nodes.some(
          (node) =>
            Math.abs(node.position.x - position.x) < placementStep / 2 &&
            Math.abs(node.position.y - position.y) < placementStep / 2,
        )
      ) {
        position = { x: position.x + placementStep, y: position.y + placementStep }
      }
      const node = {
        id,
        type,
        name: nextNodeName(current, t(blockPresentation[type].labelKey)),
        position,
        config:
          type === 'agent'
            ? {
                ...blockDefinitions.agent.defaultConfig(),
                // New agents start with the presets from the settings.
                model: settings.agentModel,
                effort: settings.agentEffort,
                devops: settings.agentDevOps,
              }
            : blockDefinitions[type].defaultConfig(),
      } as BlueprintNode
      return { ...current, nodes: [...current.nodes, node] }
    })
    setSelection({ kind: 'node', id })
  }

  function moveNode(id: string, position: Position) {
    change((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, position } : node)),
    }))
  }

  function updateNode(updated: BlueprintNode) {
    change((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === updated.id ? updated : node)),
    }))
  }

  function connect(from: PortRef, to: PortRef) {
    change((current) => {
      const check = checkConnection(current, from, to)
      if (!check.ok) return current
      return {
        ...current,
        connections: [
          ...current.connections.filter((connection) => !check.replaces.includes(connection.id)),
          { id: crypto.randomUUID(), from, to },
        ],
      }
    })
  }

  const deleteSelection = useCallback(
    (target: Selection) => {
      if (!target) return
      change((current) =>
        target.kind === 'node'
          ? {
              nodes: current.nodes.filter((node) => node.id !== target.id),
              connections: current.connections.filter(
                (connection) =>
                  connection.from.nodeId !== target.id && connection.to.nodeId !== target.id,
              ),
            }
          : {
              ...current,
              connections: current.connections.filter((connection) => connection.id !== target.id),
            },
      )
      setSelection(null)
    },
    [change],
  )

  // Delete/Backspace removes the selection, Escape closes the inspector.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditable(event.target) || document.querySelector('dialog[open]')) return
      if (event.key === 'Escape') {
        setSelection(null)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault()
        deleteSelection(selection)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selection, deleteSelection])

  // --- Rendering --------------------------------------------------------------------------

  const summaries = useMemo(
    () =>
      Object.fromEntries(
        content.nodes.map((node) => [node.id, summarize(node, t, folders, cliAvailable)]),
      ),
    [content.nodes, t, folders, cliAvailable],
  )
  const selectedNode =
    selection?.kind === 'node' ? content.nodes.find((node) => node.id === selection.id) : undefined

  return (
    <div className="flex h-full">
      <Library
        onAdd={(type) => addBlock(type, viewCenter(view))}
        canAdd={(type) => canAddBlock(type, content.nodes)}
      />
      <Canvas
        content={content}
        view={view}
        onViewChange={setView}
        selection={selection}
        onSelect={setSelection}
        summaries={summaries}
        onMoveNode={moveNode}
        onConnect={connect}
        onDropBlock={addBlock}
        onDeleteConnection={(id) => deleteSelection({ kind: 'connection', id })}
        status={<SaveStatus state={saveState} onRetry={flush} />}
      />
      {selectedNode && (
        <Inspector
          node={selectedNode}
          onChange={updateNode}
          onDelete={() => deleteSelection({ kind: 'node', id: selectedNode.id })}
          onClose={() => setSelection(null)}
          folderExists={
            selectedNode.type === 'folder' && selectedNode.config.path
              ? folders[selectedNode.config.path]
              : undefined
          }
          cliAvailable={cliAvailable}
          folderConnected={sourceOf(content, selectedNode.id, 'folder') !== undefined}
        />
      )}
    </div>
  )
}

/** Only shows while saving, or when saving failed; saved is the normal state. */
function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useT()
  if (state === 'failed') {
    return (
      <button
        type="button"
        onClick={onRetry}
        role="alert"
        className="flex items-center gap-1.5 rounded-md border border-danger/30 bg-background/90 px-2 py-1 text-xs text-danger shadow-sm backdrop-blur hover:bg-danger/10"
      >
        <CircleAlert aria-hidden className="size-3.5" />
        {t('editor.saveFailed')}
      </button>
    )
  }
  return (
    <span role="status" title={state === 'saving' ? t('editor.saving') : t('editor.saved')}>
      {state === 'saving' && (
        <LoaderCircle
          aria-label={t('editor.saving')}
          className="size-3.5 animate-spin text-muted"
        />
      )}
    </span>
  )
}
