import { cp, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { asRecord } from '@shared/validation'

/**
 * The app-owned folder for blueprints, jobs and runs, meant to be browsed and backed up by
 * hand: `~/Documents/Hub`. Development and packaged builds share it, as they share `userData`,
 * which the data is moved from. `HUB_DATA_DIR` overrides it, e.g. for tests.
 *
 *     Hub/
 *       blueprints/<id>.json   one file per blueprint
 *       jobs/<id>.json         one file per job, with its blueprint snapshot
 *       runs/<jobId>.json      the latest run of each job, with its logs
 *       backups/…              originals of files that had to be migrated or repaired
 *
 * Settings stay in `userData`: they are app preferences, not data.
 */
export function dataFolder(): string {
  const override = process.env['HUB_DATA_DIR']
  if (override) return override
  return join(app.getPath('documents'), 'Hub')
}

/** Entry IDs double as file names, so only safe characters are accepted. */
export const idPattern = /^[A-Za-z0-9-]{1,100}$/

export function backupFolder(kind: string): string {
  return join(dataFolder(), 'backups', kind)
}

/** A timestamp usable in file names. */
export function fileStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Moves a list file from `userData` (before data had its own folder) into one file per
 * entry. Entries are copied as they were stored, so sanitizing and migrating them works
 * exactly as for any other file. The folder is built under a temporary name and renamed when
 * complete, so an interrupted move starts over. The old file is kept, renamed to
 * `<name>.moved`, as a backup.
 */
async function moveListFile(legacyName: string, folderName: string): Promise<void> {
  const legacy = join(app.getPath('userData'), legacyName)
  const target = join(dataFolder(), folderName)
  if ((await exists(target)) || !(await exists(legacy))) return

  let list: unknown[]
  try {
    const parsed: unknown = JSON.parse(await readFile(legacy, 'utf8'))
    list = Array.isArray(parsed) ? parsed : []
  } catch (error) {
    // Left where it is, so nothing is lost; the new folder starts empty.
    console.error(`Could not read ${legacy}; it was not moved`, error)
    return
  }

  const building = `${target}.moving`
  await mkdir(building, { recursive: true })
  for (const entry of list) {
    const id = asRecord(entry)?.['id']
    if (typeof id !== 'string' || !idPattern.test(id)) {
      console.warn(
        `Skipped an entry of ${legacyName} without a usable ID; it stays in the old file.`,
      )
      continue
    }
    await writeFile(join(building, `${id}.json`), `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  }
  await rename(building, target)
  await rename(legacy, `${legacy}.moved`)
  console.info(`Moved ${list.length} entries from ${legacy} to ${target}`)
}

/** Moves the runs folder from `userData`. Copies instead if it is on another volume. */
async function moveRunsFolder(): Promise<void> {
  const legacy = join(app.getPath('userData'), 'runs')
  const target = join(dataFolder(), 'runs')
  if ((await exists(target)) || !(await exists(legacy))) return
  try {
    await rename(legacy, target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await cp(legacy, `${target}.moving`, { recursive: true })
    await rename(`${target}.moving`, target)
  }
  console.info(`Moved ${legacy} to ${target}`)
}

let ready: Promise<void> | null = null

/**
 * Creates the data folder and carries over data from older versions, once. Everything that
 * reads or writes data waits for it first.
 */
export function dataFolderReady(): Promise<void> {
  ready ??= (async () => {
    await mkdir(dataFolder(), { recursive: true })
    await moveListFile('blueprints.json', 'blueprints')
    await moveListFile('jobs.json', 'jobs')
    await moveRunsFolder()
  })().catch((error: unknown) => {
    // Tried again on the next use rather than failing every later read.
    ready = null
    throw error
  })
  return ready
}
