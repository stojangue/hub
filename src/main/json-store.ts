import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { sanitizeList } from '@shared/validation'

export interface CollectionStore<T extends { id: string }> {
  /** All entries, newest first. */
  all: () => Promise<T[]>
  get: (id: string) => Promise<T | null>
  /** Adds an entry at the front and persists the collection. */
  add: (entry: T) => Promise<T>
  /**
   * Replaces an entry with `change(entry)` and persists the collection.
   * Resolves to the new entry, or `null` if no entry has this ID.
   */
  update: (id: string, change: (entry: T) => T) => Promise<T | null>
  /** Removes an entry and persists the collection. Missing IDs are ignored. */
  remove: (id: string) => Promise<void>
}

/**
 * A list of entries stored as JSON in `userData/<fileName>`, owned by the main process.
 * Read once on first use; invalid entries are dropped by `sanitize`. If that changed
 * anything, the original file is copied to a backup before it is first overwritten.
 * Writes go through a temp file and a rename, serialized so concurrent saves cannot interleave.
 */
export function createCollectionStore<T extends { id: string }>(
  fileName: string,
  sanitize: (value: unknown) => T | null,
): CollectionStore<T> {
  /** The in-memory copy, the source of truth once loaded. */
  let entries: T[] | null = null
  let reading: Promise<T[]> | null = null
  let pendingWrite: Promise<void> = Promise.resolve()
  /** Set when the file held data that sanitizing dropped or changed. */
  let backupBeforeWrite = false

  function filePath(): string {
    return join(app.getPath('userData'), fileName)
  }

  async function read(): Promise<T[]> {
    let text: string
    try {
      text = await readFile(filePath(), 'utf8')
    } catch (error) {
      // A missing file is the normal first start.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Failed to read ${fileName}`, error)
      }
      return []
    }
    try {
      const raw: unknown = JSON.parse(text)
      const list = sanitizeList(raw, sanitize)
      backupBeforeWrite = JSON.stringify(list) !== JSON.stringify(raw)
      if (backupBeforeWrite) console.warn(`${fileName} contained invalid data; it was sanitized.`)
      return list
    } catch (error) {
      console.error(`Failed to parse ${fileName}; starting with an empty list`, error)
      backupBeforeWrite = true
      return []
    }
  }

  /** Keeps the unsanitized file, so data from other versions is never silently lost. */
  async function backUp(path: string): Promise<void> {
    if (!backupBeforeWrite) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${path}.backup-${stamp}`
    await copyFile(path, backupPath)
    backupBeforeWrite = false
    console.warn(`Backed up the original ${fileName} to ${backupPath}`)
  }

  async function load(): Promise<T[]> {
    reading ??= read()
    const result = await reading
    // Only the first caller to resume sets the list, so it never overwrites later changes.
    entries ??= result
    return entries
  }

  function save(list: T[]): Promise<void> {
    const path = filePath()
    const tmpPath = `${path}.tmp`
    const text = `${JSON.stringify(list, null, 2)}\n`
    pendingWrite = pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await backUp(path)
        await writeFile(tmpPath, text, 'utf8')
        await rename(tmpPath, path)
      })
    return pendingWrite
  }

  /** Applies a change synchronously after loading, so concurrent changes never get lost. */
  async function update(change: (list: T[]) => T[]): Promise<void> {
    await load()
    entries = change(entries ?? [])
    await save(entries)
  }

  return {
    all: async () => [...(await load())],
    get: async (id) => (await load()).find((entry) => entry.id === id) ?? null,
    add: async (entry) => {
      await update((list) => [entry, ...list])
      return entry
    },
    update: async (id, change) => {
      let updated: T | null = null
      if (!(await load()).some((entry) => entry.id === id)) return null
      await update((list) =>
        list.map((entry) => {
          if (entry.id !== id) return entry
          updated = change(entry)
          return updated
        }),
      )
      return updated
    },
    remove: async (id) => {
      if (!(await load()).some((entry) => entry.id === id)) return
      await update((list) => list.filter((entry) => entry.id !== id))
    },
  }
}
