import { IpcChannel } from '@shared/ipc'
import { getIssues, getPullRequests, getRepositories, getStatus } from '../github'
import { handle } from './handle'

export function registerGitHubIpc(): void {
  handle(IpcChannel.GitHubStatus, () => getStatus())
  handle(IpcChannel.GitHubRepos, () => getRepositories())
  // Queries come from the renderer, so they are validated before they reach `gh`.
  handle(IpcChannel.GitHubIssues, (_event, query) => getIssues(query))
  handle(IpcChannel.GitHubPullRequests, (_event, query) => getPullRequests(query))
}
