import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  CircleCheck,
  CircleStop,
  CircleX,
  FilePen,
  FilePlus,
  FileText,
  Folder,
  GitBranch,
  Split,
  Globe,
  ListTodo,
  LoaderCircle,
  Search,
  SquareTerminal,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AgentPermissionMode } from '@shared/blocks'
import { effectiveSource, incoming, type BlueprintNode } from '@shared/blueprints'
import type { Job } from '@shared/jobs'
import type { AgentEntry, AgentRun } from '@shared/runs'
import { useT, type TranslationKey } from '@renderer/i18n'
import { devOpsLabel, effortLabel, modelLabel } from '@renderer/claude/agent-options'
import { cn } from '@renderer/lib/cn'
import { durationBetween, formatDuration } from './format'
import { agentStatusStyles } from './status-styles'
import { StatusBadge } from './status'

const permissionKeys: Record<AgentPermissionMode, TranslationKey> = {
  acceptEdits: 'inspector.agent.permission.acceptEdits',
  plan: 'inspector.agent.permission.plan',
  bypassPermissions: 'inspector.agent.permission.bypassPermissions',
}

interface AgentDetailsProps {
  /** The agent or switch node from the job's snapshot. */
  node: Extract<BlueprintNode, { type: 'agent' | 'switch' }>
  job: Job
  /** Its part of the latest run; missing before the first run. */
  agentRun: AgentRun | undefined
  names: Record<string, string>
  now: number
}

/**
 * One agent: its result or error first, then what Claude Code did, then how it is set up.
 * Before the first run, only the setup is shown.
 */
export function AgentDetails({ node, job, agentRun, names, now }: AgentDetailsProps) {
  const t = useT()
  const duration = agentRun ? durationBetween(agentRun.startedAt, agentRun.finishedAt, now) : null
  const started = agentRun !== undefined && agentRun.status !== 'waiting'
  const running = agentRun?.status === 'running'

  return (
    <section
      aria-label={node.name}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-background"
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        {node.type === 'switch' ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
            <Split aria-hidden className="size-4" />
          </span>
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-port-result/15 text-port-result">
            <Bot aria-hidden className="size-4" />
          </span>
        )}
        <h2 className="min-w-0 flex-1 truncate font-semibold">{node.name}</h2>
        {agentRun && agentRun.round > 1 && (
          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            {t('run.round', { round: agentRun.round })}
          </span>
        )}
        {duration && <span className="text-xs text-muted tabular-nums">{duration}</span>}
        {agentRun && <StatusBadge style={agentStatusStyles[agentRun.status]} />}
      </header>

      <div className="divide-y divide-border">
        {agentRun?.error && (
          <div className="p-4">
            <ErrorCard text={agentRun.error} />
          </div>
        )}
        {node.type === 'switch' && agentRun?.chosenOutput && (
          <div className="flex items-center gap-2 px-4 py-3 text-[0.8125rem]">
            <span className="text-muted">{t('run.switch.chosen')}</span>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">
              {node.config.outputs.find((output) => output.id === agentRun.chosenOutput)?.name ??
                agentRun.chosenOutput}
            </span>
          </div>
        )}
        {agentRun?.result && !agentRun.error && (
          <Section title={t('agent.result')} defaultOpen>
            <div className="px-4 pb-4">
              <div className="max-h-112 overflow-auto rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <TextBlock>{agentRun.result}</TextBlock>
              </div>
            </div>
          </Section>
        )}
        {agentRun && started && (
          // Open while the agent works; afterwards the result above is what matters.
          <Section
            key={running ? 'running' : 'finished'}
            title={t('agent.output')}
            count={agentRun.entries.length}
            defaultOpen={running || !agentRun.result}
          >
            <OutputView agent={agentRun} now={now} />
          </Section>
        )}
        <Section title={t('agent.configuration')} defaultOpen={!started}>
          {node.type === 'switch' ? (
            <SwitchConfiguration node={node} agentRun={agentRun} />
          ) : (
            <Configuration node={node} job={job} agentRun={agentRun} names={names} />
          )}
        </Section>
      </div>
    </section>
  )
}

function Section({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string
  count?: number
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-border/70 px-1.5 leading-5 tabular-nums">{count}</span>
        )}
      </button>
      {open && children}
    </div>
  )
}

// --- Live output ------------------------------------------------------------------------

function OutputView({ agent, now }: { agent: AgentRun; now: number }) {
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Follows new output while scrolled to the bottom.
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [agent.entries.length])

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const element = event.currentTarget
        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
      }}
      className="max-h-[32rem] space-y-2 overflow-y-auto border-t border-border/70 p-4"
    >
      {agent.entries.length === 0 ? (
        <Placeholder>
          {agent.status === 'running'
            ? t('agent.starting')
            : agent.status === 'waiting'
              ? t('agent.waiting')
              : t('agent.noOutput')}
        </Placeholder>
      ) : (
        agent.entries.map((entry) => (
          <EntryView key={entry.id} entry={entry} folder={agent.input?.folder ?? null} now={now} />
        ))
      )}
      {agent.status === 'running' && agent.entries.length > 0 && (
        <WorkingLine agent={agent} now={now} />
      )}
    </div>
  )
}

/**
 * What a running agent is doing: how many subagents work in the background, and how long ago
 * it last printed anything, so a long wait for them does not look like a hang.
 */
function WorkingLine({ agent, now }: { agent: AgentRun; now: number }) {
  const t = useT()
  const background = agent.entries.filter(
    (entry) => entry.kind === 'tool' && entry.background?.status === 'running',
  ).length
  const last = agent.lastActivityAt ?? agent.entries.at(-1)?.at ?? null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted">
      <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      <span>
        {background > 0 ? t('agent.backgroundWorking', { count: background }) : t('agent.working')}
      </span>
      {last && (
        <span className="tabular-nums">
          · {t('agent.lastActivity', { time: formatDuration(now - Date.parse(last)) })}
        </span>
      )}
    </div>
  )
}

function EntryView({
  entry,
  folder,
  now,
}: {
  entry: AgentEntry
  folder: string | null
  now: number
}) {
  if (entry.kind === 'text') {
    return (
      <div className="rounded-lg bg-surface px-3 py-2">
        <TextBlock>{entry.text}</TextBlock>
      </div>
    )
  }
  if (entry.kind === 'error') return <ErrorCard text={entry.text} />
  return <ToolCard entry={entry} folder={folder} now={now} />
}

interface ToolKind {
  icon: LucideIcon
  labelKey: TranslationKey
}

const toolKinds: Record<string, ToolKind> = {
  Read: { icon: FileText, labelKey: 'tools.read' },
  Write: { icon: FilePlus, labelKey: 'tools.write' },
  Edit: { icon: FilePen, labelKey: 'tools.edit' },
  MultiEdit: { icon: FilePen, labelKey: 'tools.edit' },
  NotebookEdit: { icon: FilePen, labelKey: 'tools.edit' },
  Bash: { icon: SquareTerminal, labelKey: 'tools.bash' },
  Grep: { icon: Search, labelKey: 'tools.search' },
  Glob: { icon: Search, labelKey: 'tools.findFiles' },
  LS: { icon: Folder, labelKey: 'tools.list' },
  WebFetch: { icon: Globe, labelKey: 'tools.webFetch' },
  WebSearch: { icon: Globe, labelKey: 'tools.webSearch' },
  Task: { icon: Bot, labelKey: 'tools.task' },
  Agent: { icon: Bot, labelKey: 'tools.task' },
  TodoWrite: { icon: ListTodo, labelKey: 'tools.todos' },
}

function relativePath(path: string, folder: string | null): string {
  return folder && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path
}

/** The one-line gist of a tool call, e.g. the file it reads or the command it runs. */
function toolSummary(name: string, input: unknown, folder: string | null): string {
  if (typeof input !== 'object' || input === null) return ''
  const record = input as Record<string, unknown>
  const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : '')
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return relativePath(text('file_path'), folder)
    case 'NotebookEdit':
      return relativePath(text('notebook_path'), folder)
    case 'Bash':
      return text('description') || text('command')
    case 'Grep':
    case 'Glob':
      return text('pattern')
    case 'LS':
      return relativePath(text('path'), folder)
    case 'WebFetch':
      return text('url')
    case 'WebSearch':
      return text('query')
    case 'Task':
    case 'Agent':
      return text('description')
    case 'TodoWrite':
      return Array.isArray(record['todos']) ? String(record['todos'].length) : ''
    default: {
      const first = Object.values(record).find((value) => typeof value === 'string')
      return typeof first === 'string' ? first : ''
    }
  }
}

function ToolCard({
  entry,
  folder,
  now,
}: {
  entry: Extract<AgentEntry, { kind: 'tool' }>
  folder: string | null
  now: number
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const kind = toolKinds[entry.name]
  const Icon = kind?.icon ?? Wrench
  const label = kind ? t(kind.labelKey) : entry.name
  const summary = toolSummary(entry.name, entry.input, folder)
  const background = entry.background
  // A background subagent's call returns at once; it is done when the subagent is.
  const done = entry.output !== undefined && background?.status !== 'running'
  const failed = entry.isError === true || background?.status === 'failed'

  return (
    <div className={cn('rounded-lg border', failed ? 'border-danger/30' : 'border-border')}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-3.5 shrink-0 text-muted transition-transform', open && 'rotate-90')}
        />
        <Icon aria-hidden className="size-3.5 shrink-0 text-muted" />
        <span className="shrink-0 font-medium">{label}</span>
        <span title={summary} className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
          {summary}
        </span>
        {background && (
          <span className="shrink-0 rounded-full bg-border/70 px-1.5 text-[0.6875rem] leading-5 text-muted">
            {t('tools.background')}
          </span>
        )}
        {!done ? (
          <LoaderCircle
            aria-label={t('tools.running')}
            className="size-3.5 shrink-0 animate-spin text-accent"
          />
        ) : failed ? (
          <CircleX aria-label={t('tools.failed')} className="size-3.5 shrink-0 text-danger" />
        ) : background?.status === 'stopped' ? (
          <CircleStop aria-label={t('tools.stopped')} className="size-3.5 shrink-0 text-muted" />
        ) : (
          <CircleCheck aria-label={t('tools.done')} className="size-3.5 shrink-0 text-success" />
        )}
      </button>
      {background?.status === 'running' && background.lastActivity && (
        <div className="flex min-w-0 items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted">
          <span title={background.lastActivity} className="min-w-0 flex-1 truncate font-mono">
            {background.lastActivity}
          </span>
          {background.lastActivityAt && (
            <span className="shrink-0 tabular-nums">
              {t('tools.ago', {
                time: formatDuration(now - Date.parse(background.lastActivityAt)),
              })}
            </span>
          )}
        </div>
      )}
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-2.5">
          <div>
            <div className="mb-1 text-xs font-medium text-muted">
              {t('tools.inputLabel', { tool: entry.name })}
            </div>
            <CodeBlock>{JSON.stringify(entry.input, null, 2)}</CodeBlock>
          </div>
          {background ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">{t('tools.reportLabel')}</div>
              {background.summary ? (
                <CodeBlock tone={failed ? 'danger' : 'neutral'}>{background.summary}</CodeBlock>
              ) : (
                <Placeholder>
                  {background.status === 'running' ? t('tools.running') : '—'}
                </Placeholder>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">{t('tools.outputLabel')}</div>
              {done ? (
                <CodeBlock tone={entry.isError ? 'danger' : 'neutral'}>
                  {entry.output || '—'}
                </CodeBlock>
              ) : (
                <Placeholder>{t('tools.running')}</Placeholder>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Configuration ----------------------------------------------------------------------

/** How the agent is set up, from the snapshot; after it started, also what it actually got. */
function SwitchConfiguration({
  node,
  agentRun,
}: {
  node: Extract<BlueprintNode, { type: 'switch' }>
  agentRun: AgentRun | undefined
}) {
  const t = useT()
  return (
    <dl className="divide-y divide-border/70 border-t border-border/70">
      {node.config.outputs.map((output) => (
        <Row key={output.id} label={output.name}>
          <span className={cn(agentRun?.chosenOutput === output.id && 'font-medium text-accent')}>
            {output.condition.trim() || '—'}
          </span>
        </Row>
      ))}
      <Row label={t('agent.model')}>{modelLabel(t, node.config.model)}</Row>
      <Row label={t('agent.devops')}>{devOpsLabel(t, node.config.devops)}</Row>
    </dl>
  )
}

function Configuration({
  node,
  job,
  agentRun,
  names,
}: {
  node: Extract<BlueprintNode, { type: 'agent' }>
  job: Job
  agentRun: AgentRun | undefined
  names: Record<string, string>
}) {
  const t = useT()
  const content = job.blueprint.content
  const input = agentRun?.input
  const folderNode = effectiveSource(content, node.id, 'folder')
  const folder = input?.folder ?? (folderNode?.type === 'folder' ? folderNode.config.path : null)
  const workItemNode = effectiveSource(content, node.id, 'workItem')
  const workItem = input?.workItem ?? (workItemNode ? job.workItems[workItemNode.id] : undefined)
  const after = incoming(content, node.id, 'result').map(
    (connection) => names[connection.from.nodeId] ?? connection.from.nodeId,
  )
  const instructions = node.config.instructions.trim()
  const none = <span className="text-muted">—</span>

  return (
    <dl className="divide-y divide-border/70 border-t border-border/70">
      <Row label={t('inspector.agent.instructions')}>
        {instructions ? <TextBlock>{instructions}</TextBlock> : none}
      </Row>
      {after.length > 0 && <Row label={t('agent.after')}>{after.join(', ')}</Row>}
      <Row label={t('dataTypes.workItem')}>
        {workItem ? (
          <a
            href={workItem.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            {workItem.repository}#{workItem.number}: {workItem.title}
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
          </a>
        ) : (
          none
        )}
      </Row>
      <Row label={t('dataTypes.folder')}>
        {folder ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Folder aria-hidden className="size-3.5 shrink-0 text-port-folder" />
            <span className="font-mono text-xs break-all select-text">{folder}</span>
          </span>
        ) : (
          none
        )}
      </Row>
      {input?.worktree && (
        <Row label={t('agent.worktree')}>
          <span
            className="inline-flex min-w-0 items-center gap-1.5"
            title={t('agent.worktree.hint')}
          >
            <GitBranch aria-hidden className="size-3.5 shrink-0 text-port-folder" />
            <span className="font-mono text-xs break-all select-text">{input.worktree}</span>
          </span>
        </Row>
      )}
      <Row label={t('agent.model')}>{modelLabel(t, node.config.model)}</Row>
      <Row label={t('agent.effort')}>{effortLabel(t, node.config.effort)}</Row>
      <Row label={t('agent.devops')}>{devOpsLabel(t, node.config.devops)}</Row>
      <Row label={t('inspector.agent.permission')}>
        {t(permissionKeys[node.config.permissionMode])}
      </Row>
      {input && input.previous.length > 0 && (
        <Row label={t('agent.previousResults')}>
          <div className="space-y-1.5">
            {input.previous.map((previous) => (
              <details key={previous.nodeId} className="group rounded-md border border-border">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none [&::-webkit-details-marker]:hidden px-2.5 py-1.5 font-medium">
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                  />
                  {previous.name}
                </summary>
                <div className="border-t border-border px-2.5 py-2">
                  <TextBlock>{previous.result || '—'}</TextBlock>
                </div>
              </details>
            ))}
          </div>
        </Row>
      )}
      {input && (
        <Row label={t('agent.prompt')}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none [&::-webkit-details-marker]:hidden text-muted hover:text-foreground">
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
              />
              {t('agent.showPrompt')}
            </summary>
            <div className="mt-1.5">
              <CodeBlock>{input.prompt}</CodeBlock>
            </div>
          </details>
        </Row>
      )}
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 px-4 py-2.5 text-[0.8125rem]">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

// --- Building blocks --------------------------------------------------------------------

function TextBlock({ children }: { children: string }) {
  return (
    <div className="text-[0.8125rem] leading-relaxed break-words whitespace-pre-wrap select-text">
      {children}
    </div>
  )
}

function CodeBlock({
  children,
  tone = 'neutral',
}: {
  children: string
  tone?: 'neutral' | 'danger'
}) {
  return (
    <pre
      className={cn(
        'max-h-72 overflow-auto rounded-md bg-surface px-2.5 py-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap select-text',
        tone === 'danger' && 'text-danger',
      )}
    >
      {children}
    </pre>
  )
}

function ErrorCard({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8125rem] text-danger"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="break-words whitespace-pre-wrap select-text">{text}</span>
    </div>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] text-muted">{children}</p>
}
