import { Bot, CircleDot, Folder, type LucideIcon } from 'lucide-react'
import type { BlockType, DataType } from '@shared/blocks'
import type { TranslationKey } from '@renderer/i18n'

/**
 * How building blocks look in the app. Their ports and settings are defined in
 * `@shared/blocks`; add an entry here when a block is added there.
 */
export interface BlockPresentation {
  icon: LucideIcon
  labelKey: TranslationKey
  descriptionKey: TranslationKey
  /** Classes for the icon tile. */
  tone: string
}

export const blockPresentation: Record<BlockType, BlockPresentation> = {
  folder: {
    icon: Folder,
    labelKey: 'blocks.folder.label',
    descriptionKey: 'blocks.folder.description',
    tone: 'bg-port-folder/15 text-port-folder',
  },
  workItem: {
    icon: CircleDot,
    labelKey: 'blocks.workItem.label',
    descriptionKey: 'blocks.workItem.description',
    tone: 'bg-port-work-item/15 text-port-work-item',
  },
  agent: {
    icon: Bot,
    labelKey: 'blocks.agent.label',
    descriptionKey: 'blocks.agent.description',
    tone: 'bg-port-result/15 text-port-result',
  },
}

export interface DataTypePresentation {
  labelKey: TranslationKey
  /** CSS color of the port and its connections. */
  color: string
}

export const dataTypePresentation: Record<DataType, DataTypePresentation> = {
  folder: { labelKey: 'dataTypes.folder', color: 'var(--color-port-folder)' },
  workItem: { labelKey: 'dataTypes.workItem', color: 'var(--color-port-work-item)' },
  result: { labelKey: 'dataTypes.result', color: 'var(--color-port-result)' },
}

export interface LibraryGroup {
  id: string
  labelKey: TranslationKey
  blocks: readonly BlockType[]
}

/** How the library groups the blocks. Every block belongs to one group; add groups as areas grow. */
export const libraryGroups: readonly LibraryGroup[] = [
  { id: 'sources', labelKey: 'library.group.sources', blocks: ['workItem', 'folder'] },
  { id: 'ai', labelKey: 'library.group.ai', blocks: ['agent'] },
]

/** `dataTransfer` type used when a block is dragged from the library. */
export const blockDragType = 'application/x-hub-block'
