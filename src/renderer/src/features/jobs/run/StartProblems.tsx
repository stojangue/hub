import { TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router'
import type { BlueprintContent } from '@shared/blueprints'
import type { StartProblem } from '@shared/runs'
import { Button } from '@renderer/components/Button'
import { useT, type TranslateFn } from '@renderer/i18n'

function describe(problem: StartProblem, content: BlueprintContent, t: TranslateFn): string {
  const name =
    'nodeId' in problem
      ? (content.nodes.find((node) => node.id === problem.nodeId)?.name ?? '')
      : ''
  switch (problem.code) {
    case 'cliMissing':
      return t('start.cliMissing')
    case 'noAgents':
      return t('start.noAgents')
    case 'alreadyRunning':
      return t('start.alreadyRunning')
    case 'folderNotSet':
      return t('start.folderNotSet', { name })
    case 'folderMissing':
      return t('start.folderMissing', { name, path: problem.path })
    case 'workItemMissing':
      return t('start.workItemMissing', { name })
    case 'folderNotGitRepository':
      return t('start.folderNotGitRepository', { name, path: problem.path })
    case 'folderWrongRepository':
      return t('start.folderWrongRepository', { name, repository: problem.repository })
    case 'worktreeFailed':
      return t('start.worktreeFailed', { name, message: problem.message })
    case 'switchWithoutInput':
      return t('start.switchWithoutInput', { name })
    case 'agentWithoutTask':
      return t('start.agentWithoutTask', { name })
    case 'newerFormat':
      return t('start.newerFormat')
    case 'unsupportedParts':
      return t('start.unsupportedParts', {
        nodes: problem.nodes,
        connections: problem.connections,
      })
  }
}

interface StartProblemsProps {
  problems: StartProblem[]
  content: BlueprintContent
  onDismiss: () => void
}

/** Why a job did not start. */
export function StartProblems({ problems, content, onDismiss }: StartProblemsProps) {
  const t = useT()
  const cliMissing = problems.some((problem) => problem.code === 'cliMissing')
  return (
    <div
      role="alert"
      className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[0.8125rem]"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('start.title')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
            {problems.map((problem, index) => (
              <li key={index}>{describe(problem, content, t)}</li>
            ))}
          </ul>
          {cliMissing && (
            <Link
              to="/settings"
              className="mt-2 inline-block font-medium text-accent hover:underline"
            >
              {t('devops.notConnected.openSettings')}
            </Link>
          )}
        </div>
        <Button
          variant="ghost"
          iconOnly
          onClick={onDismiss}
          aria-label={t('common.dismiss')}
          title={t('common.dismiss')}
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
