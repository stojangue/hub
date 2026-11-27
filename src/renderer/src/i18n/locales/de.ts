import type { Translations } from './en'

/** German translations. Must define every key that exists in `en`. */
export const de: Translations = {
  'nav.home': 'Start',
  'nav.overview': 'Übersicht',
  'nav.settings': 'Einstellungen',
  'nav.devops': 'DevOps',
  'nav.main': 'Hauptnavigation',
  'breadcrumb.label': 'Brotkrumennavigation',

  'overview.welcome': 'Willkommen bei Hub.',

  'settings.appearance.title': 'Erscheinungsbild',
  'settings.theme.description': 'Hell, dunkel oder wie dein System.',
  'settings.theme.label': 'Design',
  'settings.theme.light': 'Hell',
  'settings.theme.dark': 'Dunkel',
  'settings.theme.system': 'System',

  'settings.language.title': 'Sprache',
  'settings.appLanguage.description': 'Für alle Texte in Hub.',
  'settings.appLanguage.label': 'App-Sprache',

  'settings.integrations.title': 'Integrationen',
  'settings.github.label': 'GitHub CLI',
  'settings.github.checking': 'Status wird geprüft …',
  'settings.github.checkAgain': 'Erneut prüfen',
  'settings.github.connected': 'Verbunden',
  'settings.github.signedInAs': 'Angemeldet als {login}',
  'settings.github.notAuthenticated': 'Nicht angemeldet',
  'settings.github.notAuthenticatedHint': 'Installiert, aber nicht angemeldet. Führe aus:',
  'settings.github.notInstalled': 'Nicht installiert',
  'settings.github.notInstalledHint': 'Installiere die GitHub CLI von',
  'settings.github.error': 'Prüfung fehlgeschlagen',

  'common.refresh': 'Aktualisieren',
  'common.retry': 'Erneut versuchen',

  'github.error.notInstalled': 'Die GitHub CLI ist nicht installiert.',
  'github.error.notAuthenticated': 'Die GitHub CLI ist nicht angemeldet.',
  'github.error.network': 'GitHub ist nicht erreichbar. Prüfe deine Verbindung.',
  'github.error.rateLimited':
    'Das Anfragelimit von GitHub ist erreicht. Versuche es später erneut.',
  'github.error.notFound': 'Das Repository wurde nicht gefunden oder du hast keinen Zugriff.',
  'github.error.invalidRequest': 'Die Anfrage war ungültig.',
  'github.error.unknown': 'Beim Laden der Daten von GitHub ist ein Fehler aufgetreten.',

  'devops.notConnected.title': 'GitHub CLI verbinden',
  'devops.notConnected.notInstalled':
    'DevOps zeigt deine GitHub-Repositories, Issues und Pull Requests. Dafür wird die GitHub CLI benötigt, die noch nicht installiert ist.',
  'devops.notConnected.notAuthenticated':
    'DevOps zeigt deine GitHub-Repositories, Issues und Pull Requests. Melde dich mit gh auth login bei der GitHub CLI an, um fortzufahren.',
  'devops.notConnected.openSettings': 'Einstellungen öffnen',

  'devops.repos.label': 'Repositories',
  'devops.repos.search': 'Repositories filtern',
  'devops.repos.refresh': 'Repositories aktualisieren',
  'devops.repos.empty': 'Keine Repositories gefunden',
  'devops.repos.noMatch': 'Keine passenden Repositories',
  'devops.repos.noMatchHint': 'Versuche einen anderen Namen.',
  'devops.repos.noneSelected': 'Wähle ein Repository aus',

  'devops.repo.openIssues': 'Offene Issues',
  'devops.repo.openPullRequests': 'Offene Pull Requests',
  'devops.repo.archived': 'Archiviert',
  'devops.repo.fork': 'Fork',
  'devops.repo.noDescription': 'Keine Beschreibung',
  'devops.repo.openOnGitHub': 'Auf GitHub öffnen',

  'devops.visibility.public': 'Öffentlich',
  'devops.visibility.private': 'Privat',
  'devops.visibility.internal': 'Intern',

  'devops.tabs.label': 'Inhalt des Repositorys',
  'devops.tabs.issues': 'Issues',
  'devops.tabs.pulls': 'Pull Requests',

  'devops.filter.label': 'Status',
  'devops.filter.open': 'Offen',
  'devops.filter.closed': 'Geschlossen',
  'devops.filter.all': 'Alle',

  'devops.issues.empty': 'Keine Issues',
  'devops.pulls.empty': 'Keine Pull Requests',
  'devops.list.truncated':
    'Die ersten {limit} werden angezeigt. Öffne das Repository auf GitHub, um alle zu sehen.',
  'devops.item.openOnGitHub': 'Auf GitHub öffnen',
  'devops.item.updated': 'aktualisiert {time}',

  'devops.pr.draft': 'Entwurf',
  'devops.pr.merged': 'Gemergt',
  'devops.pr.closed': 'Geschlossen',
  'devops.review.label': 'Review-Status',
  'devops.review.approved': 'Genehmigt',
  'devops.review.changesRequested': 'Änderungen angefragt',
  'devops.review.reviewRequired': 'Review erforderlich',
  'devops.checks.label': 'CI-Status',
  'devops.checks.success': 'Checks bestanden',
  'devops.checks.failure': 'Checks fehlgeschlagen',
  'devops.checks.pending': 'Checks laufen',
}
