import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'

import { analyzeMood, type MoodAnalysis } from './mood'
import type {
  AttachmentRecord,
  ChangeEntity,
  ChangeLogRecord,
  ChangeOperation,
  EntryDraft,
  JournalEntry,
  LocalState,
  TodoItem,
  WebDavConnectionTestResult,
  WebDavSyncConfig,
  WebDavSyncResult,
  WeeklySummary,
} from './db'

type DbRow = Record<string, unknown>
type SqlValue = string | number | null

type PendingFilePayload = {
  name: string
  type: string
  size: number
  dataBase64: string
}

type NativeSnapshot = {
  app: 'xinxiangyi'
  format: 'xinxiangyi-native-json'
  schemaVersion: number
  exportedAt: string
  entries: DbRow[]
  todos: DbRow[]
  attachments: DbRow[]
  changes: DbRow[]
  weeklySummaries: DbRow[]
}

const schemaVersion = 4
const nativeDatabaseId = 'xinxiangyi'
const nativeDatabaseName = 'xinxiangyi.sqlite'
const nativeSnapshotFile = 'xinxiangyi-native-snapshot.json'
const nativeManifestFile = 'manifest-native.json'
const sqlite = new SQLiteConnection(CapacitorSQLite)
let webDavHadAuthSuccess = false

let dbConnection: SQLiteDBConnection | null = null
let dbConnectionPromise: Promise<SQLiteDBConnection> | null = null

const nowIso = () => new Date().toISOString()

const createId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `${prefix}_${random}`
}

const getDeviceId = () => {
  const key = 'xinxiangyi-device-id'
  const existing = globalThis.localStorage?.getItem(key)

  if (existing) {
    return existing
  }

  const id = createId('device')
  globalThis.localStorage?.setItem(key, id)
  return id
}

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  const chunks: string[] = []

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    chunks.push(String.fromCharCode(...chunk))
  }

  return globalThis.btoa(chunks.join(''))
}

const base64ToBlob = (dataBase64: string, type: string) => {
  if (!dataBase64) {
    return new Blob([], { type })
  }

  const binary = globalThis.atob(dataBase64)
  const chunkSize = 0x8000
  const chunks: ArrayBuffer[] = []

  for (let index = 0; index < binary.length; index += chunkSize) {
    const slice = binary.slice(index, index + chunkSize)
    const bytes = new Uint8Array(slice.length)

    for (let byteIndex = 0; byteIndex < slice.length; byteIndex += 1) {
      bytes[byteIndex] = slice.charCodeAt(byteIndex)
    }

    chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  }

  return new Blob(chunks, { type })
}

const fileToPayload = async (file: File): Promise<PendingFilePayload> => ({
  name: file.name,
  type: file.type || 'application/octet-stream',
  size: file.size,
  dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
})

const readString = (row: DbRow, key: string, fallback = '') => {
  const value = row[key]

  return typeof value === 'string' ? value : fallback
}

const readNumber = (row: DbRow, key: string, fallback = 0) => {
  const value = row[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const readOptionalString = (row: DbRow, key: string) => {
  const value = row[key]

  return typeof value === 'string' && value ? value : undefined
}

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const queryRows = async <T extends DbRow>(db: SQLiteDBConnection, statement: string, values: SqlValue[] = []) => {
  const result = await db.query(statement, values)

  return (result.values ?? []) as T[]
}

const queryFirst = async <T extends DbRow>(db: SQLiteDBConnection, statement: string, values: SqlValue[] = []) => {
  const rows = await queryRows<T>(db, statement, values)

  return rows[0]
}

const runStatement = (
  db: SQLiteDBConnection,
  statement: string,
  values: SqlValue[] = [],
  transaction = true,
) => db.run(statement, values, transaction)

const withTransaction = async <T>(db: SQLiteDBConnection, callback: () => Promise<T>) => {
  await db.beginTransaction()

  try {
    const result = await callback()
    await db.commitTransaction()
    return result
  } catch (error) {
    await db.rollbackTransaction().catch(() => undefined)
    throw error
  }
}

const appendChange = (
  db: SQLiteDBConnection,
  entity: ChangeEntity,
  entityId: string,
  operation: ChangeOperation,
  payload: unknown,
  deviceId: string,
  transaction = true,
) =>
  runStatement(
    db,
    `
      INSERT INTO changes (entity, entity_id, operation, changed_at, device_id, sync_state, payload_json)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `,
    [entity, entityId, operation, nowIso(), deviceId, JSON.stringify(payload)],
    transaction,
  )

const rowToEntry = (row: DbRow): JournalEntry => {
  const moodText = readString(row, 'mood_text')

  return {
    id: readString(row, 'id'),
    dateKey: readString(row, 'date_key'),
    title: readString(row, 'title'),
    body: readString(row, 'body'),
    moodText,
    weatherText: readString(row, 'weather_text'),
    locationText: readString(row, 'location_text'),
    mood: parseJson<MoodAnalysis>(row.mood_json, analyzeMood(moodText)),
    tags: parseJson<string[]>(row.tags_json, []),
    createdAt: readString(row, 'created_at'),
    updatedAt: readString(row, 'updated_at'),
    syncState: readString(row, 'sync_state', 'pending') as JournalEntry['syncState'],
  }
}

const rowToTodo = (row: DbRow): TodoItem => ({
  id: readString(row, 'id'),
  dateKey: readString(row, 'date_key'),
  title: readString(row, 'title'),
  done: Boolean(readNumber(row, 'done')),
  createdAt: readString(row, 'created_at'),
  updatedAt: readString(row, 'updated_at'),
  completedAt: readOptionalString(row, 'completed_at'),
  syncState: readString(row, 'sync_state', 'pending') as TodoItem['syncState'],
})

const rowToAttachment = (row: DbRow): AttachmentRecord => ({
  id: readString(row, 'id'),
  entryId: readString(row, 'entry_id'),
  dateKey: readString(row, 'date_key'),
  name: readString(row, 'name'),
  type: readString(row, 'type', 'application/octet-stream'),
  size: readNumber(row, 'size'),
  blob: base64ToBlob(readString(row, 'data_base64'), readString(row, 'type', 'application/octet-stream')),
  createdAt: readString(row, 'created_at'),
  updatedAt: readString(row, 'updated_at'),
  syncState: readString(row, 'sync_state', 'pending') as AttachmentRecord['syncState'],
})

const rowToChange = (row: DbRow): ChangeLogRecord => ({
  seq: readNumber(row, 'seq'),
  entity: readString(row, 'entity') as ChangeEntity,
  entityId: readString(row, 'entity_id'),
  operation: readString(row, 'operation') as ChangeOperation,
  changedAt: readString(row, 'changed_at'),
  deviceId: readString(row, 'device_id'),
  syncState: readString(row, 'sync_state', 'pending') as ChangeLogRecord['syncState'],
  payload: parseJson(row.payload_json, null),
})

const rowToWeeklySummary = (row: DbRow): WeeklySummary => ({
  weekKey: readString(row, 'week_key'),
  content: readString(row, 'content'),
  model: readString(row, 'model'),
  provider: readString(row, 'provider'),
  createdAt: readString(row, 'created_at'),
  updatedAt: readString(row, 'updated_at'),
})

const ensureColumn = async (db: SQLiteDBConnection, table: string, column: string, definition: string) => {
  const columns = await queryRows<{ name?: string }>(db, `PRAGMA table_info(${table})`)

  if (columns.some((item) => item.name === column)) {
    return
  }

  await runStatement(db, `ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

const ensureSchema = async (db: SQLiteDBConnection) => {
  await runStatement(db, 'PRAGMA foreign_keys = ON').catch(() => undefined)
  await queryRows(db, 'PRAGMA journal_mode = WAL').catch(() => [])
  await runStatement(db, 'PRAGMA synchronous = NORMAL').catch(() => undefined)

  await db.execute(
    `
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      date_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      mood_text TEXT NOT NULL,
      weather_text TEXT NOT NULL DEFAULT '',
      location_text TEXT NOT NULL DEFAULT '',
      mood_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_state TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      date_key TEXT NOT NULL,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      sync_state TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data_base64 TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_state TEXT NOT NULL,
      FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      device_id TEXT NOT NULL,
      sync_state TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_summaries (
      week_key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metric_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      color TEXT NOT NULL,
      target_value REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_state TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metric_records (
      id TEXT PRIMARY KEY,
      metric_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      value REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_state TEXT NOT NULL,
      UNIQUE(metric_id, date_key),
      FOREIGN KEY(metric_id) REFERENCES metric_definitions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date_key ON entries(date_key);
    CREATE INDEX IF NOT EXISTS idx_todos_date_key ON todos(date_key);
    CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
    CREATE INDEX IF NOT EXISTS idx_attachments_entry_id ON attachments(entry_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at);
    CREATE INDEX IF NOT EXISTS idx_changes_changed_at ON changes(changed_at);
    CREATE INDEX IF NOT EXISTS idx_changes_sync_state ON changes(sync_state);
    CREATE INDEX IF NOT EXISTS idx_metric_records_metric_id ON metric_records(metric_id);
    CREATE INDEX IF NOT EXISTS idx_metric_records_date_key ON metric_records(date_key);
  `,
    false,
  )

  await ensureColumn(db, 'entries', 'weather_text', `weather_text TEXT NOT NULL DEFAULT ''`)
  await ensureColumn(db, 'entries', 'location_text', `location_text TEXT NOT NULL DEFAULT ''`)
  await ensureColumn(db, 'attachments', 'data_base64', `data_base64 TEXT NOT NULL DEFAULT ''`)
  await runStatement(db, `PRAGMA user_version = ${schemaVersion}`)
}

const openNativeDatabase = async () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('当前运行环境不是 Android/iOS 原生环境。')
  }

  await sqlite.checkConnectionsConsistency().catch(() => undefined)

  const existingConnection = await sqlite.isConnection(nativeDatabaseId, false).catch(() => ({ result: false }))
  const db = existingConnection.result
    ? await sqlite.retrieveConnection(nativeDatabaseId, false)
    : await sqlite.createConnection(nativeDatabaseId, false, 'no-encryption', schemaVersion, false)

  const openState = await db.isDBOpen().catch(() => ({ result: false }))

  if (!openState.result) {
    await db.open()
  }

  await ensureSchema(db)
  dbConnection = db

  return db
}

const getDatabase = () => {
  if (dbConnection) {
    return Promise.resolve(dbConnection)
  }

  dbConnectionPromise ??= openNativeDatabase().catch((error) => {
    dbConnectionPromise = null
    throw error
  })

  return dbConnectionPromise
}

const getNativeMeta = async (db: SQLiteDBConnection) => {
  const url = await db.getUrl().then((result) => result.url ?? '').catch(() => '')

  return {
    driver: 'Capacitor SQLite',
    databaseName: nativeDatabaseName,
    databasePath: url || 'Android app sandbox',
    syncBundleName: '',
    syncBundlePath: '',
    apiBaseUrl: 'capacitor://native-sqlite',
    schemaVersion,
  }
}

export const getNativeLocalState = async (): Promise<LocalState> => {
  const db = await getDatabase()
  const [entries, todos, attachments, changes, weeklySummaries, meta] = await Promise.all([
    queryRows(db, 'SELECT * FROM entries ORDER BY date_key DESC').then((rows) => rows.map(rowToEntry)),
    queryRows(db, 'SELECT * FROM todos ORDER BY created_at DESC').then((rows) => rows.map(rowToTodo)),
    queryRows(db, 'SELECT * FROM attachments ORDER BY created_at DESC').then((rows) => rows.map(rowToAttachment)),
    queryRows(db, 'SELECT * FROM changes ORDER BY changed_at DESC').then((rows) => rows.map(rowToChange)),
    queryRows(db, 'SELECT * FROM weekly_summaries ORDER BY updated_at DESC').then((rows) =>
      rows.map(rowToWeeklySummary),
    ),
    getNativeMeta(db),
  ])

  return {
    entries,
    todos,
    attachments,
    changes,
    weeklySummaries,
    meta,
  }
}

export const upsertNativeJournalEntry = async (draft: EntryDraft, files: File[]) => {
  const db = await getDatabase()
  const timestamp = nowIso()
  const existing = await queryFirst(db, 'SELECT * FROM entries WHERE date_key = ?', [draft.dateKey])
  const mood = analyzeMood(draft.moodText)
  const entry: JournalEntry = {
    id: existing ? readString(existing, 'id') : createId('entry'),
    dateKey: draft.dateKey,
    title: draft.title,
    body: draft.body,
    moodText: draft.moodText,
    weatherText: draft.weatherText ?? (existing ? readString(existing, 'weather_text') : ''),
    locationText: draft.locationText ?? (existing ? readString(existing, 'location_text') : ''),
    mood,
    tags: draft.tags,
    createdAt: existing ? readString(existing, 'created_at') : timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const filePayloads = await Promise.all(files.map(fileToPayload))
  const deviceId = getDeviceId()

  await withTransaction(db, async () => {
    await runStatement(
      db,
      `
        INSERT INTO entries (
          id, date_key, title, body, mood_text, weather_text, location_text,
          mood_json, tags_json, created_at, updated_at, sync_state
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date_key = excluded.date_key,
          title = excluded.title,
          body = excluded.body,
          mood_text = excluded.mood_text,
          weather_text = excluded.weather_text,
          location_text = excluded.location_text,
          mood_json = excluded.mood_json,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at,
          sync_state = excluded.sync_state
      `,
      [
        entry.id,
        entry.dateKey,
        entry.title,
        entry.body,
        entry.moodText,
        entry.weatherText,
        entry.locationText,
        JSON.stringify(entry.mood),
        JSON.stringify(entry.tags),
        entry.createdAt,
        entry.updatedAt,
        entry.syncState,
      ],
      false,
    )
    await appendChange(db, 'entry', entry.id, 'upsert', entry, deviceId, false)

    for (const file of filePayloads) {
      const attachment = {
        id: createId('attachment'),
        entryId: entry.id,
        dateKey: entry.dateKey,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncState: 'pending' as const,
      }

      await runStatement(
        db,
        `
          INSERT INTO attachments (
            id, entry_id, date_key, name, type, size, data_base64, created_at, updated_at, sync_state
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          attachment.id,
          attachment.entryId,
          attachment.dateKey,
          attachment.name,
          attachment.type,
          attachment.size,
          file.dataBase64,
          attachment.createdAt,
          attachment.updatedAt,
          attachment.syncState,
        ],
        false,
      )
      await appendChange(
        db,
        'attachment',
        attachment.id,
        'upsert',
        {
          ...attachment,
          blob: {
            type: attachment.type,
            size: attachment.size,
          },
        },
        deviceId,
        false,
      )
    }
  })

  return entry
}

const deleteNativeEntryRows = async (db: SQLiteDBConnection, entryRows: DbRow[], deviceId: string) => {
  for (const row of entryRows) {
    const entry = rowToEntry(row)
    const attachments = await queryRows(db, 'SELECT * FROM attachments WHERE entry_id = ?', [entry.id])

    await runStatement(db, 'DELETE FROM entries WHERE id = ?', [entry.id], false)

    for (const attachmentRow of attachments) {
      const attachment = rowToAttachment(attachmentRow)

      await appendChange(
        db,
        'attachment',
        attachment.id,
        'delete',
        {
          id: attachment.id,
          entryId: attachment.entryId,
          dateKey: attachment.dateKey,
          name: attachment.name,
        },
        deviceId,
        false,
      )
    }

    await appendChange(db, 'entry', entry.id, 'delete', entry, deviceId, false)
  }
}

export const deleteNativeJournalEntry = async (entry: JournalEntry) => {
  const db = await getDatabase()
  const existing = await queryFirst(db, 'SELECT * FROM entries WHERE id = ?', [entry.id])

  if (!existing) {
    throw new Error('Journal entry not found.')
  }

  await withTransaction(db, () => deleteNativeEntryRows(db, [existing], getDeviceId()))
}

export const deleteNativeJournalEntries = async (entryIds: string[]) => {
  const ids = [...new Set(entryIds.map((item) => item.trim()).filter(Boolean))]

  if (ids.length === 0) {
    throw new Error('请选择至少一条日记记录。')
  }

  const db = await getDatabase()
  const placeholders = ids.map(() => '?').join(', ')
  const entryRows = await queryRows(db, `SELECT * FROM entries WHERE id IN (${placeholders})`, ids)

  if (entryRows.length === 0) {
    throw new Error('没有找到可删除的日记记录。')
  }

  await withTransaction(db, () => deleteNativeEntryRows(db, entryRows, getDeviceId()))
}

export const addNativeTodo = async (dateKey: string, title: string) => {
  const db = await getDatabase()
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
  const deviceId = getDeviceId()

  await withTransaction(db, async () => {
    await runStatement(
      db,
      `
        INSERT INTO todos (id, date_key, title, done, created_at, updated_at, sync_state)
        VALUES (?, ?, ?, 0, ?, ?, ?)
      `,
      [todo.id, todo.dateKey, todo.title, todo.createdAt, todo.updatedAt, todo.syncState],
      false,
    )
    await appendChange(db, 'todo', todo.id, 'upsert', todo, deviceId, false)
  })

  return todo
}

export const setNativeTodoDone = async (todo: TodoItem, done: boolean) => {
  const db = await getDatabase()
  const existing = await queryFirst(db, 'SELECT * FROM todos WHERE id = ?', [todo.id])

  if (!existing) {
    throw new Error('Todo not found.')
  }

  const timestamp = nowIso()
  const next: TodoItem = {
    ...rowToTodo(existing),
    done,
    completedAt: done ? timestamp : undefined,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId()

  await withTransaction(db, async () => {
    await runStatement(
      db,
      `
        UPDATE todos
        SET done = ?, completed_at = ?, updated_at = ?, sync_state = 'pending'
        WHERE id = ?
      `,
      [next.done ? 1 : 0, next.completedAt ?? null, next.updatedAt, next.id],
      false,
    )
    await appendChange(db, 'todo', next.id, 'upsert', next, deviceId, false)
  })

  return next
}

export const deleteNativeTodo = async (todo: TodoItem) => {
  const db = await getDatabase()
  const existing = await queryFirst(db, 'SELECT * FROM todos WHERE id = ?', [todo.id])

  if (!existing) {
    throw new Error('Todo not found.')
  }

  const existingTodo = rowToTodo(existing)
  const deviceId = getDeviceId()

  await withTransaction(db, async () => {
    await runStatement(db, 'DELETE FROM todos WHERE id = ?', [existingTodo.id], false)
    await appendChange(db, 'todo', existingTodo.id, 'delete', existingTodo, deviceId, false)
  })
}

export const deleteNativeAttachment = async (attachment: AttachmentRecord) => {
  const db = await getDatabase()
  const existing = await queryFirst(db, 'SELECT * FROM attachments WHERE id = ?', [attachment.id])

  if (!existing) {
    throw new Error('Attachment not found.')
  }

  const existingAttachment = rowToAttachment(existing)
  const deviceId = getDeviceId()

  await withTransaction(db, async () => {
    await runStatement(db, 'DELETE FROM attachments WHERE id = ?', [existingAttachment.id], false)
    await appendChange(
      db,
      'attachment',
      existingAttachment.id,
      'delete',
      {
        id: existingAttachment.id,
        entryId: existingAttachment.entryId,
        dateKey: existingAttachment.dateKey,
        name: existingAttachment.name,
      },
      deviceId,
      false,
    )
  })
}

export const upsertNativeWeeklySummary = async (
  weekKey: string,
  content: string,
  model: string,
  provider = 'openai-compatible',
) => {
  const db = await getDatabase()
  const timestamp = nowIso()
  const existing = await queryFirst(db, 'SELECT * FROM weekly_summaries WHERE week_key = ?', [weekKey])
  const summary: WeeklySummary = {
    weekKey,
    content,
    model,
    provider,
    createdAt: existing ? readString(existing, 'created_at') : timestamp,
    updatedAt: timestamp,
  }

  await runStatement(
    db,
    `
      INSERT INTO weekly_summaries (week_key, content, model, provider, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_key) DO UPDATE SET
        content = excluded.content,
        model = excluded.model,
        provider = excluded.provider,
        updated_at = excluded.updated_at
    `,
    [summary.weekKey, summary.content, summary.model, summary.provider, summary.createdAt, summary.updatedAt],
  )

  return summary
}

const normalizeRemotePath = (value: string) => {
  const raw = typeof value === 'string' ? value.trim() : ''

  return raw || '/xinxiangyi-sync'
}

const getRemoteSegments = (...parts: string[]) =>
  parts
    .flatMap((part) => String(part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)

const getWebDavUrl = (config: WebDavSyncConfig, ...parts: string[]) => {
  const url = new URL(config.url)
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  const relativePath = getRemoteSegments(config.remotePath, ...parts)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  url.pathname = `${basePath}${relativePath}`.replace(/\/{2,}/g, '/')
  url.search = ''
  url.hash = ''

  return url.toString()
}

const encodeBasicAuth = (username: string, password: string) => {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  const chunkSize = 0x8000
  const chunks: string[] = []

  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)))
  }

  return globalThis.btoa(chunks.join(''))
}

const getWebDavConfig = (payload: WebDavSyncConfig): WebDavSyncConfig => {
  const url = typeof payload.url === 'string' ? payload.url.trim() : ''
  const username = typeof payload.username === 'string' ? payload.username.trim() : ''
  const password = typeof payload.password === 'string' ? payload.password : ''
  const remotePath = normalizeRemotePath(payload.remotePath)

  if (!url) {
    throw new Error('请先配置 WebDAV Server URL。')
  }

  if (!username || !password) {
    throw new Error('请先配置 WebDAV 用户名和应用密码。')
  }

  try {
    new URL(url)
  } catch {
    throw new Error('WebDAV Server URL 不是合法地址。')
  }

  return {
    url,
    username,
    password,
    remotePath,
  }
}

const getWebDavHeaders = (config: WebDavSyncConfig, contentType?: string) => ({
  Authorization: `Basic ${encodeBasicAuth(config.username, config.password)}`,
  ...(contentType ? { 'Content-Type': contentType } : {}),
})

class NativeDiagnosticError extends Error {
  readonly diagnostic: unknown

  constructor(message: string, diagnostic: unknown) {
    super(message)
    this.name = 'NativeDiagnosticError'
    this.diagnostic = diagnostic
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getSafeHeaders = (headers?: Record<string, string>) => {
  const next = { ...(headers ?? {}) }

  if ('Authorization' in next) {
    next.Authorization = '[redacted]'
  }

  return next
}

const getUtf8Size = (value: string) => new TextEncoder().encode(value).length

const isSuccessStatus = (status: number) => status >= 200 && status < 300

const getResponseText = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value == null) return ''

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const getWebDavResponseSnippet = (response: HttpResponse) => getResponseText(response.data).slice(0, 800)

const shouldRetryWebDavStatus = (status: number) => {
  if (status === 401 && webDavHadAuthSuccess) return true
  if (status === 429) return true
  if (status >= 500 && status < 600) return true
  return false
}

const requestWebDav = async (options: HttpOptions, label: string) => {
  const maxAttempts = 3
  let lastResponse: HttpResponse | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const startedAt = Date.now()

    try {
      const response = await CapacitorHttp.request({
        connectTimeout: 30_000,
        readTimeout: options.method === 'GET' || options.method === 'PUT' ? 300_000 : 30_000,
        ...options,
      })
      lastResponse = response

      if (isSuccessStatus(response.status) || response.status === 207) {
        webDavHadAuthSuccess = true
        return response
      }

      if (attempt < maxAttempts - 1 && shouldRetryWebDavStatus(response.status)) {
        await wait(500 * 2 ** attempt)
        continue
      }

      return response
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        await wait(500 * 2 ** attempt)
        continue
      }

      throw new NativeDiagnosticError(error instanceof Error ? error.message : `${label} 请求失败。`, {
        label,
        method: options.method ?? 'GET',
        url: options.url,
        headers: getSafeHeaders(options.headers),
        attempt: attempt + 1,
        elapsedMs: Date.now() - startedAt,
        cause: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
        lastResponse: lastResponse
          ? {
              status: lastResponse.status,
              headers: lastResponse.headers,
              dataSnippet: getWebDavResponseSnippet(lastResponse),
            }
          : null,
      })
    }
  }

  throw new NativeDiagnosticError(`${label} 请求失败。`, {
    label,
    method: options.method ?? 'GET',
    url: options.url,
    headers: getSafeHeaders(options.headers),
    lastResponse: lastResponse
      ? {
          status: lastResponse.status,
          headers: lastResponse.headers,
          dataSnippet: getWebDavResponseSnippet(lastResponse),
        }
      : null,
  })
}

const syncedRow = (row: DbRow): DbRow => ('sync_state' in row ? { ...row, sync_state: 'synced' } : row)

const createNativeSnapshot = async (): Promise<NativeSnapshot> => {
  const db = await getDatabase()
  const [entries, todos, attachments, changes, weeklySummaries] = await Promise.all([
    queryRows(db, 'SELECT * FROM entries ORDER BY date_key DESC'),
    queryRows(db, 'SELECT * FROM todos ORDER BY created_at DESC'),
    queryRows(db, 'SELECT * FROM attachments ORDER BY created_at DESC'),
    queryRows(db, 'SELECT * FROM changes ORDER BY changed_at DESC'),
    queryRows(db, 'SELECT * FROM weekly_summaries ORDER BY updated_at DESC'),
  ])

  return {
    app: 'xinxiangyi',
    format: 'xinxiangyi-native-json',
    schemaVersion,
    exportedAt: nowIso(),
    entries: entries.map(syncedRow),
    todos: todos.map(syncedRow),
    attachments: attachments.map(syncedRow),
    changes: changes.map(syncedRow),
    weeklySummaries,
  }
}

const markNativeContentSynced = async () => {
  const db = await getDatabase()

  await withTransaction(db, async () => {
    await runStatement(db, `UPDATE entries SET sync_state = 'synced' WHERE sync_state = 'pending'`, [], false)
    await runStatement(db, `UPDATE todos SET sync_state = 'synced' WHERE sync_state = 'pending'`, [], false)
    await runStatement(db, `UPDATE attachments SET sync_state = 'synced' WHERE sync_state = 'pending'`, [], false)
    await runStatement(db, `UPDATE changes SET sync_state = 'synced' WHERE sync_state = 'pending'`, [], false)
  })
}

const putWebDavText = async (config: WebDavSyncConfig, file: string, body: string, contentType: string) => {
  const url = getWebDavUrl(config, file)
  const response = await requestWebDav({
    method: 'PUT',
    url,
    headers: getWebDavHeaders(config, contentType),
    data: body,
  }, `PUT ${file}`)

  if (response.status === 401 || response.status === 403) {
    throw new NativeDiagnosticError('WebDAV 已响应，但上传没有通过认证。请确认坚果云账号使用邮箱，密码使用应用密码。', {
      method: 'PUT',
      url,
      status: response.status,
      headers: response.headers,
      dataSnippet: getWebDavResponseSnippet(response),
    })
  }

  if ([404, 409].includes(response.status)) {
    throw new NativeDiagnosticError(`WebDAV 远端目录不存在或不可写：${response.status}。请先在坚果云中创建 Remote Path。`, {
      method: 'PUT',
      url,
      status: response.status,
      headers: response.headers,
      dataSnippet: getWebDavResponseSnippet(response),
    })
  }

  if (!isSuccessStatus(response.status)) {
    throw new NativeDiagnosticError(`WebDAV 上传失败：${response.status}`, {
      method: 'PUT',
      url,
      status: response.status,
      headers: response.headers,
      dataSnippet: getWebDavResponseSnippet(response),
    })
  }

  return response
}

const getWebDavText = async (config: WebDavSyncConfig, file: string) => {
  const url = getWebDavUrl(config, file)
  const response = await requestWebDav({
    method: 'GET',
    url,
    headers: getWebDavHeaders(config),
    responseType: 'text',
  }, `GET ${file}`)

  if (response.status === 401 || response.status === 403) {
    throw new NativeDiagnosticError('WebDAV 已响应，但下载没有通过认证。请确认坚果云账号使用邮箱，密码使用应用密码。', {
      method: 'GET',
      url,
      status: response.status,
      headers: response.headers,
      dataSnippet: getWebDavResponseSnippet(response),
    })
  }

  if (response.status === 404) {
    throw new NativeDiagnosticError(`远端同步快照不存在：404 ${file}`, {
      method: 'GET',
      url,
      status: response.status,
      headers: response.headers,
      dataSnippet: getWebDavResponseSnippet(response),
    })
  }

  if (!isSuccessStatus(response.status)) {
    throw new NativeDiagnosticError(`WebDAV 下载失败：${response.status}`, {
      method: 'GET',
      url,
      status: response.status,
      headers: response.headers,
      dataSnippet: getWebDavResponseSnippet(response),
    })
  }

  return getResponseText(response.data)
}

const validateNativeSnapshot = (value: unknown): NativeSnapshot => {
  const snapshot = value as Partial<NativeSnapshot>

  if (
    snapshot.app !== 'xinxiangyi' ||
    snapshot.format !== 'xinxiangyi-native-json' ||
    !Array.isArray(snapshot.entries) ||
    !Array.isArray(snapshot.todos) ||
    !Array.isArray(snapshot.attachments) ||
    !Array.isArray(snapshot.changes) ||
    !Array.isArray(snapshot.weeklySummaries)
  ) {
    throw new Error('远端文件不是有效的心象仪移动端同步快照。')
  }

  return snapshot as NativeSnapshot
}

const importNativeSnapshot = async (snapshot: NativeSnapshot) => {
  const db = await getDatabase()
  const timestamp = nowIso()

  await withTransaction(db, async () => {
    await runStatement(db, 'DELETE FROM attachments', [], false)
    await runStatement(db, 'DELETE FROM entries', [], false)
    await runStatement(db, 'DELETE FROM todos', [], false)
    await runStatement(db, 'DELETE FROM changes', [], false)
    await runStatement(db, 'DELETE FROM weekly_summaries', [], false)

    for (const row of snapshot.entries) {
      await runStatement(
        db,
        `
          INSERT INTO entries (
            id, date_key, title, body, mood_text, weather_text, location_text,
            mood_json, tags_json, created_at, updated_at, sync_state
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
        `,
        [
          readString(row, 'id', createId('entry')),
          readString(row, 'date_key'),
          readString(row, 'title'),
          readString(row, 'body'),
          readString(row, 'mood_text'),
          readString(row, 'weather_text'),
          readString(row, 'location_text'),
          readString(row, 'mood_json', JSON.stringify(analyzeMood(readString(row, 'mood_text')))),
          readString(row, 'tags_json', '[]'),
          readString(row, 'created_at', timestamp),
          readString(row, 'updated_at', timestamp),
        ],
        false,
      )
    }

    for (const row of snapshot.todos) {
      await runStatement(
        db,
        `
          INSERT INTO todos (id, date_key, title, done, created_at, updated_at, completed_at, sync_state)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')
        `,
        [
          readString(row, 'id', createId('todo')),
          readString(row, 'date_key'),
          readString(row, 'title'),
          readNumber(row, 'done'),
          readString(row, 'created_at', timestamp),
          readString(row, 'updated_at', timestamp),
          readOptionalString(row, 'completed_at') ?? null,
        ],
        false,
      )
    }

    for (const row of snapshot.attachments) {
      await runStatement(
        db,
        `
          INSERT INTO attachments (
            id, entry_id, date_key, name, type, size, data_base64, created_at, updated_at, sync_state
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
        `,
        [
          readString(row, 'id', createId('attachment')),
          readString(row, 'entry_id'),
          readString(row, 'date_key'),
          readString(row, 'name'),
          readString(row, 'type', 'application/octet-stream'),
          readNumber(row, 'size'),
          readString(row, 'data_base64'),
          readString(row, 'created_at', timestamp),
          readString(row, 'updated_at', timestamp),
        ],
        false,
      )
    }

    for (const row of snapshot.changes) {
      await runStatement(
        db,
        `
          INSERT INTO changes (entity, entity_id, operation, changed_at, device_id, sync_state, payload_json)
          VALUES (?, ?, ?, ?, ?, 'synced', ?)
        `,
        [
          readString(row, 'entity'),
          readString(row, 'entity_id'),
          readString(row, 'operation'),
          readString(row, 'changed_at', timestamp),
          readString(row, 'device_id', 'webdav'),
          readString(row, 'payload_json', 'null'),
        ],
        false,
      )
    }

    for (const row of snapshot.weeklySummaries) {
      await runStatement(
        db,
        `
          INSERT INTO weekly_summaries (week_key, content, model, provider, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          readString(row, 'week_key'),
          readString(row, 'content'),
          readString(row, 'model'),
          readString(row, 'provider', 'local'),
          readString(row, 'created_at', timestamp),
          readString(row, 'updated_at', timestamp),
        ],
        false,
      )
    }
  })
}

export const testNativeWebDavConnection = async (
  payload: WebDavSyncConfig,
): Promise<WebDavConnectionTestResult> => {
  const config = getWebDavConfig(payload)
  const checkedAt = nowIso()
  const testFile = `.xinxiangyi-webdav-test-${Date.now()}.txt`

  try {
    const writeResponse = await requestWebDav({
      method: 'PUT',
      url: getWebDavUrl(config, testFile),
      headers: getWebDavHeaders(config, 'text/plain; charset=utf-8'),
      data: `xinxiangyi webdav test ${checkedAt}\n`,
    }, `PUT ${testFile}`)

    if (writeResponse.status === 401 || writeResponse.status === 403) {
      return {
        ok: false,
        pathExists: false,
        writable: false,
        status: writeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: 'WebDAV 已响应，但测试写入没有通过认证。请确认坚果云账号使用邮箱，密码使用应用密码。',
      }
    }

    if ([404, 409].includes(writeResponse.status)) {
      return {
        ok: true,
        pathExists: false,
        writable: false,
        status: writeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: 'WebDAV 账号验证通过，但远端目录不存在。请先在坚果云中创建该目录，或把 Remote Path 改成已存在目录。',
      }
    }

    if (writeResponse.status < 200 || writeResponse.status >= 300) {
      return {
        ok: false,
        pathExists: false,
        writable: false,
        status: writeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: `WebDAV 测试写入失败：${writeResponse.status}`,
      }
    }

    await requestWebDav({
      method: 'DELETE',
      url: getWebDavUrl(config, testFile),
      headers: getWebDavHeaders(config),
    }, `DELETE ${testFile}`).catch(() => undefined)

    return {
      ok: true,
      pathExists: true,
      writable: true,
      status: writeResponse.status,
      remotePath: config.remotePath,
      checkedAt,
      message: 'WebDAV 连接成功，目录存在，并且测试写入通过。',
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('WebDAV 连接测试失败。')
  }
}

export const pushNativeWebDavSnapshot = async (payload: WebDavSyncConfig): Promise<WebDavSyncResult> => {
  const config = getWebDavConfig(payload)
  const snapshot = await createNativeSnapshot()
  const snapshotBody = JSON.stringify(snapshot, null, 2)
  const syncedAt = nowIso()
  const manifest = {
    app: 'xinxiangyi',
    format: 'xinxiangyi-native-json',
    schemaVersion,
    file: nativeSnapshotFile,
    pushedAt: syncedAt,
    size: getUtf8Size(snapshotBody),
  }

  await putWebDavText(config, nativeSnapshotFile, snapshotBody, 'application/json; charset=utf-8')
  await putWebDavText(config, nativeManifestFile, JSON.stringify(manifest, null, 2), 'application/json; charset=utf-8')
  await markNativeContentSynced()

  return {
    ok: true,
    direction: 'push',
    remotePath: config.remotePath,
    file: nativeSnapshotFile,
    size: manifest.size,
    syncedAt,
  }
}

export const pullNativeWebDavSnapshot = async (payload: WebDavSyncConfig): Promise<WebDavSyncResult> => {
  const config = getWebDavConfig(payload)
  let raw = ''

  try {
    raw = await getWebDavText(config, nativeSnapshotFile)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if (/404|不存在|not found/i.test(message)) {
      const legacyUrl = getWebDavUrl(config, nativeDatabaseName)
      const legacyResponse = await requestWebDav({
        method: 'HEAD',
        url: legacyUrl,
        headers: getWebDavHeaders(config),
      }, `HEAD ${nativeDatabaseName}`).catch(() => null)

      if (legacyResponse && isSuccessStatus(legacyResponse.status)) {
        throw new NativeDiagnosticError('远端目录里只有旧版 SQLite 快照，Android 端不能直接导入。请先在电脑端更新到当前版本后执行一次同步，生成跨端 JSON 快照。', {
          method: 'HEAD',
          url: legacyUrl,
          status: legacyResponse.status,
          headers: legacyResponse.headers,
          expectedFile: nativeSnapshotFile,
          legacyFile: nativeDatabaseName,
        })
      }
    }

    throw error
  }
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('远端同步快照不是合法 JSON 文件。')
  }

  const snapshot = validateNativeSnapshot(parsed)

  await importNativeSnapshot(snapshot)

  return {
    ok: true,
    direction: 'pull',
    remotePath: config.remotePath,
    file: nativeSnapshotFile,
    size: getUtf8Size(raw),
    syncedAt: nowIso(),
  }
}
