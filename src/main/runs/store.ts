import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { sanitizeRun, type JobRun } from '@shared/runs'

/**
 * The latest run of each job, with its logs, in `userData/runs/<jobId>.json`. Kept apart
 * from `jobs.json` because logs grow while a run is in progress and are written often.
 */

const idPattern = /^[A-Za-z0-9-]{1,100}$/
const pendingWrites = new Map<string, Promise<void>>()

function runsDir(): string {
  return join(app.getPath('userData'), 'runs')
}

function runPath(jobId: string): string {
  if (!idPattern.test(jobId)) throw new Error('Invalid job ID')
  return join(runsDir(), `${jobId}.json`)
}

export async function readRun(jobId: string): Promise<JobRun | null> {
  if (!idPattern.test(jobId)) return null
  try {
    const run = sanitizeRun(JSON.parse(await readFile(runPath(jobId), 'utf8')))
    return run?.jobId === jobId ? run : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to read the run of job ${jobId}`, error)
    }
    return null
  }
}

/** Writes via a temp file and rename, serialized per job so writes cannot interleave. */
export function writeRun(run: JobRun): Promise<void> {
  const path = runPath(run.jobId)
  const text = JSON.stringify(run)
  const previous = pendingWrites.get(run.jobId) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(runsDir(), { recursive: true })
      await writeFile(`${path}.tmp`, text, 'utf8')
      await rename(`${path}.tmp`, path)
    })
  pendingWrites.set(run.jobId, next)
  return next
}

/** For app shutdown, when there is no time to wait for asynchronous writes. */
export function writeRunSync(run: JobRun): void {
  const path = runPath(run.jobId)
  mkdirSync(runsDir(), { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify(run), 'utf8')
  renameSync(`${path}.tmp`, path)
}

export async function deleteRun(jobId: string): Promise<void> {
  if (!idPattern.test(jobId)) return
  await (pendingWrites.get(jobId) ?? Promise.resolve()).catch(() => undefined)
  await rm(runPath(jobId), { force: true })
}
