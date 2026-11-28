import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { asRecord } from '@shared/validation'

/**
 * The app-owned folder for blueprints, jobs and runs, meant to be browsed and backed up by
 * hand: `~/Documents/Hub`. Development and packaged builds share it, as they share `userData`,
 * which the data is copied from. `HUB_DATA_DIR` overrides it, e.g. for tests.
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
 * Records what was copied from `userData`, so it is copied once even if the user later
 * deletes or renames a folder here.
 */
const copiedMarker = 'copied-from-userdata.json'

async function readCopied(): Promise<Record<string, string>> {
  try {
    const parsed = asRecord(JSON.parse(await readFile(join(dataFolder(), copiedMarker), 'utf8')))
    return Object.fromEntries(
      Object.entries(parsed ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

async function markCopied(name: string): Promise<void> {
  const copied = { ...(await readCopied()), [name]: new Date().toISOString() }
  await writeFile(join(dataFolder(), copiedMarker), `${JSON.stringify(copied, null, 2)}\n`, 'utf8')
}

/** True if `legacy` still has to be copied to `target`. */
async function needsCopy(name: string, legacy: string, target: string): Promise<boolean> {
  if (name in (await readCopied())) return false
  return !(await exists(target)) && (await exists(legacy))
}

/**
 * Copies a list file from `userData` (before data had its own folder) into one file per
 * entry. Entries are copied as they were stored, so sanitizing and migrating them works
 * exactly as for any other file. The folder is built under a temporary name and renamed when
 * complete, so an interrupted copy starts over.
 *
 * The old file stays where it is: older builds, which may share `userData` with this one
 * (dev and packaged builds do, and so does a downgrade), keep working on their own copy.
 */
async function copyListFile(legacyName: string, folderName: string): Promise<void> {
  const legacy = join(app.getPath('userData'), legacyName)
  const target = join(dataFolder(), folderName)
  if (!(await needsCopy(legacyName, legacy, target))) return

  let list: unknown[]
  try {
    const parsed: unknown = JSON.parse(await readFile(legacy, 'utf8'))
    list = Array.isArray(parsed) ? parsed : []
  } catch (error) {
    // Tried again on the next start; the new folder starts empty.
    console.error(`Could not read ${legacy}; it was not copied`, error)
    return
  }

  const building = `${target}.copying`
  await rm(building, { recursive: true, force: true })
  await mkdir(building, { recursive: true })
  for (const entry of list) {
    const id = asRecord(entry)?.['id']
    if (typeof id !== 'string' || !idPattern.test(id)) {
      console.warn(`Skipped an entry of ${legacyName} without a usable ID.`)
      continue
    }
    await writeFile(join(building, `${id}.json`), `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  }
  await rename(building, target)
  await markCopied(legacyName)
  console.info(`Copied ${list.length} entries from ${legacy} to ${target}`)
}

/** Copies the runs folder from `userData`, which stays for older builds as well. */
async function copyRunsFolder(): Promise<void> {
  const legacy = join(app.getPath('userData'), 'runs')
  const target = join(dataFolder(), 'runs')
  if (!(await needsCopy('runs', legacy, target))) return
  const building = `${target}.copying`
  await rm(building, { recursive: true, force: true })
  await cp(legacy, building, { recursive: true })
  await rename(building, target)
  await markCopied('runs')
  console.info(`Copied ${legacy} to ${target}`)
}

let ready: Promise<void> | null = null

/**
 * Creates the data folder and carries over data from older versions, once. Everything that
 * reads or writes data waits for it first.
 */
export function dataFolderReady(): Promise<void> {
  ready ??= (async () => {
    await mkdir(dataFolder(), { recursive: true })
    await copyListFile('blueprints.json', 'blueprints')
    await copyListFile('jobs.json', 'jobs')
    await copyRunsFolder()
  })().catch((error: unknown) => {
    // Tried again on the next use rather than failing every later read.
    ready = null
    throw error
  })
  return ready
}
