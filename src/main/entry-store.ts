import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { backupFolder, dataFolder, dataFolderReady, fileStamp, idPattern } from './data-folder'

export interface EntryStore<T extends { id: string }> {
  /** All entries, newest first. */
  all: () => Promise<T[]>
  get: (id: string) => Promise<T | null>
  /** Adds an entry and writes its file. */
  add: (entry: T) => Promise<T>
  /**
   * Replaces an entry with `change(entry)` and writes its file.
   * Resolves to the new entry, or `null` if no entry has this ID.
   */
  update: (id: string, change: (entry: T) => T) => Promise<T | null>
  /** Removes an entry and its file. Missing IDs are ignored. */
  remove: (id: string) => Promise<void>
}

/**
 * Entries stored as one JSON file each, in `<data folder>/<folderName>/<id>.json`, owned by
 * the main process. One file per entry keeps them easy to inspect, copy and restore by hand,
 * and a change only ever rewrites the file of the entry it changes.
 *
 * All files are read on first use and checked by `sanitize`. Files it rejects, or that are
 * not valid JSON, are skipped and left untouched. If sanitizing changed an entry (e.g. it
 * migrated an older format), its original file is copied to `backups/<folderName>/` before
 * it is first overwritten. Writes go through a temp file and a rename, serialized per entry.
 */
export function createEntryStore<T extends { id: string }>(
  folderName: string,
  sanitize: (value: unknown) => T | null,
  /** Sort key; entries are listed with the largest first, e.g. the creation time. */
  sortKey: (entry: T) => string,
): EntryStore<T> {
  /** The in-memory copy, the source of truth once loaded. */
  let entries: Map<string, T> | null = null
  let reading: Promise<Map<string, T>> | null = null
  const pendingWrites = new Map<string, Promise<void>>()
  /** Entries whose file held data that sanitizing changed. */
  const backupBeforeWrite = new Set<string>()

  function folder(): string {
    return join(dataFolder(), folderName)
  }

  function filePath(id: string): string {
    if (!idPattern.test(id)) throw new Error(`Invalid ID: ${id}`)
    return join(folder(), `${id}.json`)
  }

  async function readEntry(fileName: string): Promise<T | null> {
    const id = fileName.slice(0, -'.json'.length)
    const path = join(folder(), fileName)
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
      const entry = sanitize(raw)
      if (!entry || entry.id !== id) {
        console.warn(`Skipped ${path}: it is not a valid entry or its ID does not match.`)
        return null
      }
      if (JSON.stringify(entry) !== JSON.stringify(raw)) {
        backupBeforeWrite.add(id)
        console.warn(`${path} was migrated or repaired; the original is kept on the next save.`)
      }
      return entry
    } catch (error) {
      console.error(`Skipped ${path}: it could not be read`, error)
      return null
    }
  }

  async function read(): Promise<Map<string, T>> {
    await dataFolderReady()
    await mkdir(folder(), { recursive: true })
    const names = (await readdir(folder())).filter(
      (name) => name.endsWith('.json') && idPattern.test(name.slice(0, -'.json'.length)),
    )
    const map = new Map<string, T>()
    for (const entry of await Promise.all(names.map(readEntry))) {
      if (entry) map.set(entry.id, entry)
    }
    return map
  }

  async function load(): Promise<Map<string, T>> {
    reading ??= read().catch((error: unknown) => {
      // Tried again on the next call instead of keeping the failure.
      reading = null
      throw error
    })
    const result = await reading
    // Only the first caller to resume sets the entries, so it never overwrites later changes.
    entries ??= result
    return entries
  }

  /** Keeps the original file, so data from other versions is never silently lost. */
  async function backUp(id: string, path: string): Promise<void> {
    if (!backupBeforeWrite.has(id)) return
    const target = join(backupFolder(folderName), `${id}-${fileStamp()}.json`)
    await mkdir(backupFolder(folderName), { recursive: true })
    await copyFile(path, target)
    backupBeforeWrite.delete(id)
    console.warn(`Backed up the original ${path} to ${target}`)
  }

  function queue(id: string, task: () => Promise<void>): Promise<void> {
    const next = (pendingWrites.get(id) ?? Promise.resolve()).catch(() => undefined).then(task)
    pendingWrites.set(id, next)
    return next
  }

  function save(entry: T): Promise<void> {
    const path = filePath(entry.id)
    const text = `${JSON.stringify(entry, null, 2)}\n`
    return queue(entry.id, async () => {
      await mkdir(folder(), { recursive: true })
      await backUp(entry.id, path)
      await writeFile(`${path}.tmp`, text, 'utf8')
      await rename(`${path}.tmp`, path)
    })
  }

  return {
    all: async () =>
      [...(await load()).values()].sort((a, b) => sortKey(b).localeCompare(sortKey(a))),
    get: async (id) => (await load()).get(id) ?? null,
    add: async (entry) => {
      const map = await load()
      map.set(entry.id, entry)
      await save(entry)
      return entry
    },
    update: async (id, change) => {
      const map = await load()
      const current = map.get(id)
      if (!current) return null
      // Applied synchronously after loading, so concurrent changes never get lost.
      const updated = change(current)
      map.set(id, updated)
      await save(updated)
      return updated
    },
    remove: async (id) => {
      const map = await load()
      if (!map.delete(id)) return
      backupBeforeWrite.delete(id)
      await queue(id, () => rm(filePath(id), { force: true }))
    },
  }
}
