/** English translations. The source of truth for all keys and the fallback language. */
export const en = {
  'nav.home': 'Home',
  'nav.overview': 'Overview',
  'nav.settings': 'Settings',
  'nav.devops': 'DevOps',
  'nav.main': 'Main navigation',
  'breadcrumb.label': 'Breadcrumb',

  'overview.welcome': 'Welcome to Hub.',

  'settings.appearance.title': 'Appearance',
  'settings.theme.description': 'Light, dark, or match your system.',
  'settings.theme.label': 'Theme',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.system': 'System',

  'settings.language.title': 'Language',
  'settings.appLanguage.description': 'Used for all text in Hub.',
  'settings.appLanguage.label': 'App language',

  'settings.integrations.title': 'Integrations',
  'settings.github.label': 'GitHub CLI',
  'settings.github.checking': 'Checking status…',
  'settings.github.checkAgain': 'Check again',
  'settings.github.connected': 'Connected',
  'settings.github.signedInAs': 'Signed in as {login}',
  'settings.github.notAuthenticated': 'Not signed in',
  'settings.github.notAuthenticatedHint': 'Installed, but not signed in. Run',
  'settings.github.notInstalled': 'Not installed',
  'settings.github.notInstalledHint': 'Install the GitHub CLI from',
  'settings.github.error': 'Check failed',

  'common.refresh': 'Refresh',
  'common.retry': 'Try again',

  'github.error.notInstalled': 'The GitHub CLI is not installed.',
  'github.error.notAuthenticated': 'The GitHub CLI is not signed in.',
  'github.error.network': 'GitHub could not be reached. Check your connection.',
  'github.error.rateLimited': "GitHub's rate limit was reached. Try again later.",
  'github.error.notFound': 'The repository was not found or you have no access.',
  'github.error.invalidRequest': 'The request was invalid.',
  'github.error.unknown': 'Something went wrong while loading data from GitHub.',

  'devops.notConnected.title': 'Connect the GitHub CLI',
  'devops.notConnected.notInstalled':
    'DevOps shows your GitHub repositories, issues and pull requests. It needs the GitHub CLI, which is not installed yet.',
  'devops.notConnected.notAuthenticated':
    'DevOps shows your GitHub repositories, issues and pull requests. Sign in to the GitHub CLI with gh auth login to continue.',
  'devops.notConnected.openSettings': 'Open Settings',

  'devops.repos.label': 'Repositories',
  'devops.repos.search': 'Filter repositories',
  'devops.repos.refresh': 'Refresh repositories',
  'devops.repos.empty': 'No repositories found',
  'devops.repos.noMatch': 'No matching repositories',
  'devops.repos.noMatchHint': 'Try a different name.',
  'devops.repos.noneSelected': 'Select a repository',

  'devops.repo.openIssues': 'Open issues',
  'devops.repo.openPullRequests': 'Open pull requests',
  'devops.repo.archived': 'Archived',
  'devops.repo.fork': 'Fork',
  'devops.repo.noDescription': 'No description',
  'devops.repo.openOnGitHub': 'Open on GitHub',

  'devops.visibility.public': 'Public',
  'devops.visibility.private': 'Private',
  'devops.visibility.internal': 'Internal',

  'devops.tabs.label': 'Repository content',
  'devops.tabs.issues': 'Issues',
  'devops.tabs.pulls': 'Pull Requests',

  'devops.filter.label': 'State',
  'devops.filter.open': 'Open',
  'devops.filter.closed': 'Closed',
  'devops.filter.all': 'All',

  'devops.issues.empty': 'No issues',
  'devops.pulls.empty': 'No pull requests',
  'devops.list.truncated': 'Showing the first {limit}. Open the repository on GitHub to see all.',
  'devops.item.openOnGitHub': 'Open on GitHub',
  'devops.item.updated': 'updated {time}',

  'devops.pr.draft': 'Draft',
  'devops.pr.merged': 'Merged',
  'devops.pr.closed': 'Closed',
  'devops.review.label': 'Review status',
  'devops.review.approved': 'Approved',
  'devops.review.changesRequested': 'Changes requested',
  'devops.review.reviewRequired': 'Review required',
  'devops.checks.label': 'CI status',
  'devops.checks.success': 'Checks passed',
  'devops.checks.failure': 'Checks failed',
  'devops.checks.pending': 'Checks running',
} as const

export type TranslationKey = keyof typeof en
export type Translations = Record<TranslationKey, string>
