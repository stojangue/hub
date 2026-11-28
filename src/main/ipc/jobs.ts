import { IpcChannel } from '@shared/ipc'
import { createJob, deleteJob, getJob, listJobs } from '../jobs'
import { deleteJobRun, getRun, startJob, stopJob } from '../runs/runner'
import { handle } from './handle'

export function registerJobsIpc(): void {
  handle(IpcChannel.JobsList, () => listJobs())
  // Payloads come from the renderer, so they are validated before they are stored.
  handle(IpcChannel.JobsGet, (_event, id) => getJob(id))
  handle(IpcChannel.JobsCreate, (_event, input) => createJob(input))
  handle(IpcChannel.JobsDelete, async (_event, id) => {
    if (typeof id !== 'string') return
    await deleteJobRun(id)
    await deleteJob(id)
  })
  handle(IpcChannel.JobsStart, (_event, id) => startJob(id))
  handle(IpcChannel.JobsStop, (_event, id) => stopJob(id))
  handle(IpcChannel.JobsRun, (_event, id) => getRun(id))
}
