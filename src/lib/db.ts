import Dexie, { type Table } from 'dexie'
import { analyzeMood, type MoodAnalysis } from './mood'

export type SyncState = 'pending' | 'synced' | 'conflict'

export type JournalEntry = {
  id: string
  dateKey: string
  title: string
  body: string
  moodText: string
  mood: MoodAnalysis
  tags: string[]
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type TodoItem = {
  id: string
  dateKey: string
  title: string
  done: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
  syncState: SyncState
}

export type AttachmentRecord = {
  id: string
  entryId: string
  dateKey: string
  name: string
  type: string
  size: number
  blob: Blob
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type ChangeEntity = 'entry' | 'todo' | 'attachment'
export type ChangeOperation = 'upsert' | 'delete'

export type ChangeLogRecord = {
  seq?: number
  entity: ChangeEntity
  entityId: string
  operation: ChangeOperation
  changedAt: string
  deviceId: string
  syncState: SyncState
  payload: unknown
}

export type EntryDraft = {
  dateKey: string
  title: string
  body: string
  moodText: string
  tags: string[]
}

export type WeeklySummary = {
  weekKey: string
  content: string
  model: string
  provider: string
  createdAt: string
  updatedAt: string
}

class LocalTodoDatabase extends Dexie {
  entries!: Table<JournalEntry, string>
  todos!: Table<TodoItem, string>
  attachments!: Table<AttachmentRecord, string>
  changes!: Table<ChangeLogRecord, number>
  weeklySummaries!: Table<WeeklySummary, string>

  constructor() {
    super('xinxiangyi_local')
    this.version(1).stores({
      entries: 'id, &dateKey, updatedAt, syncState, mood.score',
      todos: 'id, dateKey, done, updatedAt, syncState',
      attachments: 'id, entryId, dateKey, updatedAt, syncState',
      changes: '++seq, entity, entityId, changedAt, syncState',
    })
    this.version(2).stores({
      entries: 'id, &dateKey, updatedAt, syncState, mood.score',
      todos: 'id, dateKey, done, updatedAt, syncState',
      attachments: 'id, entryId, dateKey, updatedAt, syncState',
      changes: '++seq, entity, entityId, changedAt, syncState',
      weeklySummaries: '&weekKey, updatedAt, provider, model',
    })
  }
}

export const db = new LocalTodoDatabase()

const createId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `${prefix}_${random}`
}

const nowIso = () => new Date().toISOString()

const getDeviceId = () => {
  const key = 'xinxiangyi-device-id'
  const existing = window.localStorage.getItem(key)

  if (existing) {
    return existing
  }

  const id = createId('device')
  window.localStorage.setItem(key, id)
  return id
}

const appendChange = async (
  entity: ChangeEntity,
  entityId: string,
  operation: ChangeOperation,
  payload: unknown,
) => {
  await db.changes.add({
    entity,
    entityId,
    operation,
    changedAt: nowIso(),
    deviceId: getDeviceId(),
    syncState: 'pending',
    payload,
  })
}

export const upsertJournalEntry = async (draft: EntryDraft, files: File[]) => {
  const timestamp = nowIso()
  const existing = await db.entries.where('dateKey').equals(draft.dateKey).first()
  const mood = analyzeMood(draft.moodText)
  const entry: JournalEntry = {
    id: existing?.id ?? createId('entry'),
    dateKey: draft.dateKey,
    title: draft.title,
    body: draft.body,
    moodText: draft.moodText,
    mood,
    tags: draft.tags,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }

  await db.transaction('rw', db.entries, db.attachments, db.changes, async () => {
    await db.entries.put(entry)
    await appendChange('entry', entry.id, 'upsert', entry)

    for (const file of files) {
      const attachment: AttachmentRecord = {
        id: createId('attachment'),
        entryId: entry.id,
        dateKey: entry.dateKey,
        name: file.name,
        type: file.type,
        size: file.size,
        blob: file,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncState: 'pending',
      }

      await db.attachments.put(attachment)
      await appendChange('attachment', attachment.id, 'upsert', {
        ...attachment,
        blob: {
          type: attachment.type,
          size: attachment.size,
        },
      })
    }
  })

  return entry
}

export const addTodo = async (dateKey: string, title: string) => {
  const timestamp = nowIso()
  const todo: TodoItem = {
    id: createId('todo'),
    dateKey,
    title,
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }

  await db.transaction('rw', db.todos, db.changes, async () => {
    await db.todos.add(todo)
    await appendChange('todo', todo.id, 'upsert', todo)
  })

  return todo
}

export const setTodoDone = async (todo: TodoItem, done: boolean) => {
  const timestamp = nowIso()
  const next: TodoItem = {
    ...todo,
    done,
    completedAt: done ? timestamp : undefined,
    updatedAt: timestamp,
    syncState: 'pending',
  }

  await db.transaction('rw', db.todos, db.changes, async () => {
    await db.todos.put(next)
    await appendChange('todo', next.id, 'upsert', next)
  })

  return next
}

export const deleteTodo = async (todo: TodoItem) => {
  await db.transaction('rw', db.todos, db.changes, async () => {
    await db.todos.delete(todo.id)
    await appendChange('todo', todo.id, 'delete', todo)
  })
}

export const deleteAttachment = async (attachment: AttachmentRecord) => {
  await db.transaction('rw', db.attachments, db.changes, async () => {
    await db.attachments.delete(attachment.id)
    await appendChange('attachment', attachment.id, 'delete', {
      id: attachment.id,
      entryId: attachment.entryId,
      dateKey: attachment.dateKey,
      name: attachment.name,
    })
  })
}

export const upsertWeeklySummary = async (
  weekKey: string,
  content: string,
  model: string,
  provider = 'openai-compatible',
) => {
  const timestamp = nowIso()
  const existing = await db.weeklySummaries.get(weekKey)
  const summary: WeeklySummary = {
    weekKey,
    content,
    model,
    provider,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  await db.weeklySummaries.put(summary)
  return summary
}
