import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  CircleMinus,
  CircleStop,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react'
import type { AgentRunStatus, JobStatus } from '@shared/runs'
import type { BadgeTone } from '@renderer/components/Badge'
import type { TranslationKey } from '@renderer/i18n'

export interface StatusStyle {
  labelKey: TranslationKey
  tone: BadgeTone
  icon: LucideIcon
  spin?: boolean
}

export const jobStatusStyles: Record<JobStatus, StatusStyle> = {
  ready: { labelKey: 'jobs.status.ready', tone: 'neutral', icon: CircleDashed },
  running: { labelKey: 'jobs.status.running', tone: 'accent', icon: LoaderCircle, spin: true },
  done: { labelKey: 'jobs.status.done', tone: 'success', icon: CircleCheck },
  failed: { labelKey: 'jobs.status.failed', tone: 'danger', icon: CircleX },
  stopped: { labelKey: 'jobs.status.stopped', tone: 'warning', icon: CircleStop },
}

export const agentStatusStyles: Record<AgentRunStatus, StatusStyle> = {
  waiting: { labelKey: 'agents.status.waiting', tone: 'neutral', icon: CircleDashed },
  running: { labelKey: 'agents.status.running', tone: 'accent', icon: LoaderCircle, spin: true },
  done: { labelKey: 'agents.status.done', tone: 'success', icon: CircleCheck },
  failed: { labelKey: 'agents.status.failed', tone: 'danger', icon: CircleX },
  skipped: { labelKey: 'agents.status.skipped', tone: 'neutral', icon: CircleSlash },
  stopped: { labelKey: 'agents.status.stopped', tone: 'warning', icon: Ban },
  notTaken: { labelKey: 'agents.status.notTaken', tone: 'neutral', icon: CircleMinus },
}
