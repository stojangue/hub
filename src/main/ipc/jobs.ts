import { IpcChannel } from '@shared/ipc'
import { createJob, deleteJob, getJob, listJobs } from '../jobs'
import { handle } from './handle'

export function registerJobsIpc(): void {
  handle(IpcChannel.JobsList, () => listJobs())
  // Payloads come from the renderer, so they are validated before they are stored.
  handle(IpcChannel.JobsGet, (_event, id) => getJob(id))
  handle(IpcChannel.JobsCreate, (_event, input) => createJob(input))
  handle(IpcChannel.JobsDelete, (_event, id) => deleteJob(id))
}
