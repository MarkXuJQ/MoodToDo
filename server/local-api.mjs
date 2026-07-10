import { createServer } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const require = createRequire(import.meta.url)
const { localApiDefaults } = require('../config/local-api.cjs')
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.XINXIANGYI_DATA_DIR
  ? resolve(process.env.XINXIANGYI_DATA_DIR)
  : resolve(projectRoot, 'data')
const databaseName = 'xinxiangyi.sqlite'
const databasePath = resolve(dataDir, databaseName)
const syncDir = resolve(dataDir, '.sync')
const webDavRecoveryMarkerPath = resolve(syncDir, 'webdav-recovery-required')
const syncBundleName = 'xinxiangyi-sync'
const syncBundleRootDir = process.env.XINXIANGYI_SYNC_BUNDLE_DIR
  ? resolve(process.env.XINXIANGYI_SYNC_BUNDLE_DIR)
  : resolve(projectRoot, 'sync')
const syncBundleDir = resolve(syncBundleRootDir, syncBundleName)
const port = Number(process.env.XINXIANGYI_API_PORT ?? localApiDefaults.browserPort)
const host = process.env.XINXIANGYI_API_HOST ?? localApiDefaults.host
const apiToken = process.env.XINXIANGYI_API_TOKEN?.trim() ?? ''
const allowedOrigins = new Set(
  (process.env.XINXIANGYI_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,null')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)
const schemaVersion = 7
const portableSnapshotFile = 'xinxiangyi-native-snapshot.json'
const portableManifestFile = 'manifest-native.json'
const syncBundleGuideFile = 'README.txt'
const portableAttachmentDir = 'attachments'
const portableAttachmentExtension = '.b64'
const compactChangePayloadJson = 'null'
const changeLogRetentionDays = 60
const changeLogRetentionMs = changeLogRetentionDays * 24 * 60 * 60 * 1000
const getChangeLogRetentionCutoffIso = () => new Date(Date.now() - changeLogRetentionMs).toISOString()
const defaultTodoReminderTime = '09:00'
const todoRepeatFrequencies = new Set(['none', 'daily', 'weekly', 'monthly'])

if (!apiToken) {
  throw new Error('XINXIANGYI_API_TOKEN 未配置。请通过 npm run dev、npm run api 或 Electron 启动本地 API。')
}

const hasValidApiToken = (request) => {
  const suppliedToken = String(request.headers['x-xinxiangyi-api-token'] ?? '')
  const expected = Buffer.from(apiToken)
  const supplied = Buffer.from(suppliedToken)

  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

const applyCorsHeaders = (request, response) => {
  const origin = request.headers.origin

  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }

  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Xinxiangyi-Device-Id, X-Xinxiangyi-API-Token',
  )
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
}

const ensureDirectory = (dir) => {
  try {
    mkdirSync(dir, { recursive: true })
    return
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }

    const stat = lstatSync(dir)
    if (!stat.isSymbolicLink()) {
      throw error
    }

    const target = readlinkSync(dir)
    const targetPath = resolve(dirname(dir), target)
    mkdirSync(targetPath, { recursive: true })
    mkdirSync(dir, { recursive: true })
  }
}

const ensureLocalDataDirectory = (dir) => {
  ensureDirectory(dir)

  if (lstatSync(dir).isSymbolicLink()) {
    throw new Error(
      `SQLite 数据目录不能是符号链接：${dir}。请先把数据库复制到本机普通目录，再启动心象仪。`,
    )
  }
}

ensureLocalDataDirectory(dataDir)
ensureDirectory(syncDir)
ensureDirectory(syncBundleDir)

let db = new DatabaseSync(databasePath)

const configureDatabaseConnection = () => {
  db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = DELETE;
  PRAGMA synchronous = NORMAL;
  `)
}

configureDatabaseConnection()

db.exec(`

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
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'normal',
    lane_id TEXT NOT NULL DEFAULT 'inbox',
    countdown_enabled INTEGER NOT NULL DEFAULT 0,
    repeat_frequency TEXT NOT NULL DEFAULT 'none',
    repeat_group_id TEXT NOT NULL DEFAULT '',
    board_visible INTEGER NOT NULL DEFAULT 1,
    reminder_enabled INTEGER NOT NULL DEFAULT 0,
    reminder_time TEXT NOT NULL DEFAULT '09:00',
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    archived_at TEXT,
    sync_state TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    blob BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL,
    FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS board_lanes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL
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

`)

const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (columns.some((item) => item.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

const createIndexes = () => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entries_date_key ON entries(date_key);
    CREATE INDEX IF NOT EXISTS idx_todos_date_key ON todos(date_key);
    CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
    CREATE INDEX IF NOT EXISTS idx_todos_lane_done_created_at ON todos(lane_id, done, created_at);
    CREATE INDEX IF NOT EXISTS idx_todos_date_done ON todos(date_key, done);
    CREATE INDEX IF NOT EXISTS idx_todos_repeat_group_date ON todos(repeat_group_id, date_key);
    CREATE INDEX IF NOT EXISTS idx_attachments_entry_id ON attachments(entry_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at);
    CREATE INDEX IF NOT EXISTS idx_board_lanes_created_at ON board_lanes(created_at);
    CREATE INDEX IF NOT EXISTS idx_changes_changed_at ON changes(changed_at);
    CREATE INDEX IF NOT EXISTS idx_changes_sync_state ON changes(sync_state);
    CREATE INDEX IF NOT EXISTS idx_changes_entity_id_changed_at ON changes(entity, entity_id, changed_at);
    CREATE INDEX IF NOT EXISTS idx_weekly_summaries_updated_at ON weekly_summaries(updated_at);
    CREATE INDEX IF NOT EXISTS idx_metric_records_metric_id ON metric_records(metric_id);
    CREATE INDEX IF NOT EXISTS idx_metric_records_date_key ON metric_records(date_key);
  `)
}

ensureColumn('entries', 'weather_text', `weather_text TEXT NOT NULL DEFAULT ''`)
ensureColumn('entries', 'location_text', `location_text TEXT NOT NULL DEFAULT ''`)
ensureColumn('todos', 'description', `description TEXT NOT NULL DEFAULT ''`)
ensureColumn('todos', 'priority', `priority TEXT NOT NULL DEFAULT 'normal'`)
ensureColumn('todos', 'lane_id', `lane_id TEXT NOT NULL DEFAULT 'inbox'`)
ensureColumn('todos', 'countdown_enabled', `countdown_enabled INTEGER NOT NULL DEFAULT 0`)
ensureColumn('todos', 'repeat_frequency', `repeat_frequency TEXT NOT NULL DEFAULT 'none'`)
ensureColumn('todos', 'repeat_group_id', `repeat_group_id TEXT NOT NULL DEFAULT ''`)
ensureColumn('todos', 'board_visible', `board_visible INTEGER NOT NULL DEFAULT 1`)
ensureColumn('todos', 'reminder_enabled', `reminder_enabled INTEGER NOT NULL DEFAULT 0`)
ensureColumn('todos', 'reminder_time', `reminder_time TEXT NOT NULL DEFAULT '09:00'`)
ensureColumn('todos', 'archived_at', `archived_at TEXT`)
ensureColumn('changes', 'payload_json', `payload_json TEXT NOT NULL DEFAULT 'null'`)
createIndexes()
db.prepare(`UPDATE changes SET payload_json = ? WHERE payload_json <> ?`).run(
  compactChangePayloadJson,
  compactChangePayloadJson,
)
db.prepare(`DELETE FROM changes WHERE sync_state <> 'pending' AND changed_at < ?`).run(
  getChangeLogRetentionCutoffIso(),
)

db.exec(`PRAGMA user_version = ${schemaVersion}`)

const nowIso = () => new Date().toISOString()

const createId = (prefix) => `${prefix}_${randomUUID()}`

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const getDeviceId = (request) => request.headers['x-xinxiangyi-device-id'] || 'local-api'

const rowToEntry = (row) => ({
  id: row.id,
  dateKey: row.date_key,
  title: row.title,
  body: row.body,
  moodText: row.mood_text,
  weatherText: row.weather_text ?? '',
  locationText: row.location_text ?? '',
  mood: parseJson(row.mood_json, {}),
  tags: parseJson(row.tags_json, []),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const rowToTodo = (row) => ({
  id: row.id,
  dateKey: row.date_key,
  title: row.title,
  description: row.description ?? '',
  priority: row.priority ?? 'normal',
  laneId: row.lane_id ?? 'inbox',
  countdownEnabled: Boolean(row.countdown_enabled),
  repeatFrequency: todoRepeatFrequencies.has(row.repeat_frequency) ? row.repeat_frequency : 'none',
  repeatGroupId: row.repeat_group_id ?? '',
  boardVisible: row.board_visible == null ? true : Boolean(row.board_visible),
  reminderEnabled: Boolean(row.reminder_enabled),
  reminderTime: normalizeReminderTime(row.reminder_time),
  done: Boolean(row.done),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at ?? undefined,
  archivedAt: row.archived_at ?? undefined,
  syncState: row.sync_state,
})

const rowToAttachment = (row) => ({
  id: row.id,
  entryId: row.entry_id,
  dateKey: row.date_key,
  name: row.name,
  type: row.type,
  size: row.size,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const rowToBoardLane = (row) => ({
  id: row.id,
  label: row.label,
  colorId: row.color_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const rowToChange = (row) => ({
  seq: Number(row.seq),
  entity: row.entity,
  entityId: row.entity_id,
  operation: row.operation,
  changedAt: row.changed_at,
  deviceId: row.device_id,
  syncState: row.sync_state,
  payload: parseJson(row.payload_json, null),
})

const rowToWeeklySummary = (row) => ({
  weekKey: row.week_key,
  content: row.content,
  model: row.model,
  provider: row.provider,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const rowToMetricDefinition = (row) => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  color: row.color,
  targetValue: row.target_value ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const rowToMetricRecord = (row) => ({
  id: row.id,
  metricId: row.metric_id,
  dateKey: row.date_key,
  value: Number(row.value),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const getMeta = () => ({
  driver: 'SQLite',
  databaseName,
  databasePath,
  syncBundleName,
  syncBundlePath: syncBundleDir,
  apiBaseUrl: `http://${host}:${port}`,
  schemaVersion,
  webDavRecoveryRequired: existsSync(webDavRecoveryMarkerPath),
})

const rejectUnsafeWebDavMerge = (response) => {
  if (!existsSync(webDavRecoveryMarkerPath)) return false

  sendJson(response, 409, {
    error: '云端快照需要先由本机数据重建。为避免受污染数据回流，普通同步和云端恢复已暂时停用。',
  })
  return true
}

const normalizeRemotePath = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw || '/xinxiangyi-sync'
}

const getWebDavConfig = (payload) => {
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

const getWebDavHeaders = (config, contentType, extraHeaders = {}) => ({
  Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
  ...(contentType ? { 'Content-Type': contentType } : {}),
  ...extraHeaders,
})

const isMissingWebDavResource = (status) => status === 404 || status === 409

const getRemoteSegments = (...parts) =>
  parts
    .flatMap((part) => String(part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)

const getWebDavUrl = (config, ...parts) => {
  const url = new URL(config.url)
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  const relativePath = getRemoteSegments(config.remotePath, ...parts)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  url.pathname = `${basePath}${relativePath}`.replace(/\/{2,}/g, '/')
  url.search = ''
  url.hash = ''

  return url
}

const ensureWebDavCollection = async (config, ...parts) => {
  const segments = getRemoteSegments(config.remotePath, ...parts)

  for (let index = 0; index < segments.length; index += 1) {
    const url = getWebDavUrl({ ...config, remotePath: `/${segments.slice(0, index + 1).join('/')}` })
    const response = await fetch(url, {
      method: 'MKCOL',
      headers: getWebDavHeaders(config),
    })

    if (![200, 201, 204, 405].includes(response.status)) {
      const detail = await response.text().catch(() => '')
      throw new Error(`创建 WebDAV 目录失败：${response.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
    }
  }
}

const markLocalContentSynced = () => {
  transaction(() => {
    db.prepare(`UPDATE entries SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE todos SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE board_lanes SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE attachments SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE metric_definitions SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE metric_records SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE changes SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
  })
}

const compactLocalChangeLog = () => {
  const changes = getRetainedChangeRows(db.prepare(`SELECT * FROM changes ORDER BY changed_at DESC`).all()).map((row) => ({
    ...row,
    sync_state: readString(row, 'sync_state', 'synced'),
    payload_json: compactChangePayloadJson,
  }))
  const insertChange = db.prepare(`
    INSERT INTO changes (entity, entity_id, operation, changed_at, device_id, sync_state, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  transaction(() => {
    db.prepare('DELETE FROM changes').run()

    for (const row of changes) {
      insertChange.run(
        readString(row, 'entity'),
        readString(row, 'entity_id'),
        readString(row, 'operation'),
        readString(row, 'changed_at', nowIso()),
        readString(row, 'device_id', 'local'),
        readString(row, 'sync_state', 'synced'),
        compactChangePayloadJson,
      )
    }
  })
}

const readString = (row, key, fallback = '') => {
  const value = row?.[key]
  if (value == null) return fallback
  return String(value)
}

const readStringAny = (row, keys, fallback = '') => {
  for (const key of keys) {
    const value = row?.[key]
    if (value != null && value !== '') return String(value)
  }

  return fallback
}

const readOptionalString = (row, key) => {
  const value = row?.[key]
  if (value == null || value === '') return null
  return String(value)
}

const readNumber = (row, key, fallback = 0) => {
  const value = Number(row?.[key])
  return Number.isFinite(value) ? value : fallback
}

const readNumberAny = (row, keys, fallback = 0) => {
  for (const key of keys) {
    const value = Number(row?.[key])
    if (Number.isFinite(value)) return value
  }

  return fallback
}

const toDateKey = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const getTodayKey = () => toDateKey(new Date())

const addDays = (dateKey, amount) => {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + amount)

  return toDateKey(date)
}

const addMonths = (dateKey, amount) => {
  const date = new Date(`${dateKey}T00:00:00`)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + amount)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, lastDay))

  return toDateKey(date)
}

const normalizeRepeatFrequency = (value) => (todoRepeatFrequencies.has(value) ? value : 'none')

const normalizeReminderTime = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/)

  return match ? raw : defaultTodoReminderTime
}

const readRepeatFrequency = (row) => normalizeRepeatFrequency(readStringAny(row, ['repeat_frequency', 'repeatFrequency'], 'none'))

const readReminderTime = (row) => normalizeReminderTime(readStringAny(row, ['reminder_time', 'reminderTime'], defaultTodoReminderTime))

const readBoardVisible = (row, fallback = 1) => readNumberAny(row, ['board_visible', 'boardVisible'], fallback) !== 0

const readReminderEnabled = (row) => readNumberAny(row, ['reminder_enabled', 'reminderEnabled']) !== 0

const getNextRepeatDateKey = (dateKey, frequency, todayKey = getTodayKey()) => {
  if (frequency === 'daily') return todayKey > dateKey ? todayKey : addDays(dateKey, 1)
  if (frequency === 'weekly') return addDays(dateKey, 7)
  if (frequency === 'monthly') return addMonths(dateKey, 1)
  return ''
}

const getNextDueRepeatDateKey = (dateKey, frequency, todayKey = getTodayKey()) => {
  const repeatFrequency = normalizeRepeatFrequency(frequency)
  let nextDateKey = getNextRepeatDateKey(dateKey, repeatFrequency, todayKey)

  if (!nextDateKey || nextDateKey.localeCompare(todayKey) > 0) {
    return ''
  }

  for (let index = 0; index < 120; index += 1) {
    const followingDateKey =
      repeatFrequency === 'weekly'
        ? addDays(nextDateKey, 7)
        : repeatFrequency === 'monthly'
          ? addMonths(nextDateKey, 1)
          : ''

    if (!followingDateKey || followingDateKey.localeCompare(todayKey) > 0) break
    nextDateKey = followingDateKey
  }

  return nextDateKey
}

const createRecurringTodoInstance = (template, nextDateKey, timestamp = nowIso()) => ({
  ...template,
  id: createId('todo'),
  dateKey: nextDateKey,
  done: false,
  completedAt: undefined,
  archivedAt: undefined,
  laneId: 'inbox',
  boardVisible: false,
  createdAt: timestamp,
  updatedAt: timestamp,
  syncState: 'pending',
})

const insertTodoRecord = db.prepare(`
  INSERT INTO todos (
    id, date_key, title, description, priority, lane_id, countdown_enabled,
    repeat_frequency, repeat_group_id, board_visible, reminder_enabled, reminder_time,
    done, created_at, updated_at, completed_at, archived_at, sync_state
  )
  VALUES (
    $id, $dateKey, $title, $description, $priority, $laneId, $countdownEnabled,
    $repeatFrequency, $repeatGroupId, $boardVisible, $reminderEnabled, $reminderTime,
    $done, $createdAt, $updatedAt, $completedAt, $archivedAt, $syncState
  )
`)

const runInsertTodo = (todo) =>
  insertTodoRecord.run({
    $id: todo.id,
    $dateKey: todo.dateKey,
    $title: todo.title,
    $description: todo.description,
    $priority: todo.priority,
    $laneId: todo.laneId,
    $countdownEnabled: todo.countdownEnabled ? 1 : 0,
    $repeatFrequency: normalizeRepeatFrequency(todo.repeatFrequency),
    $repeatGroupId: todo.repeatGroupId ?? '',
    $boardVisible: todo.boardVisible ? 1 : 0,
    $reminderEnabled: todo.reminderEnabled ? 1 : 0,
    $reminderTime: normalizeReminderTime(todo.reminderTime),
    $done: todo.done ? 1 : 0,
    $createdAt: todo.createdAt,
    $updatedAt: todo.updatedAt,
    $completedAt: todo.completedAt ?? null,
    $archivedAt: todo.archivedAt ?? null,
    $syncState: todo.syncState,
  })

const materializeDueRecurringTodos = () => {
  const rows = db
    .prepare(`SELECT * FROM todos WHERE repeat_frequency <> 'none' OR repeat_group_id <> '' ORDER BY date_key ASC, created_at ASC`)
    .all()

  if (rows.length === 0) return []

  const todayKey = getTodayKey()
  const groups = new Map()
  const createdTodos = []

  for (const row of rows) {
    const groupId = readString(row, 'repeat_group_id') || readString(row, 'id')
    if (!groupId) continue

    const existing = groups.get(groupId)
    if (
      !existing ||
      readString(row, 'date_key').localeCompare(readString(existing, 'date_key')) > 0 ||
      (readString(row, 'date_key') === readString(existing, 'date_key') &&
        readString(row, 'created_at').localeCompare(readString(existing, 'created_at')) > 0)
    ) {
      groups.set(groupId, row)
    }
  }

  const deviceId = 'recurrence'

  transaction(() => {
    for (const row of groups.values()) {
      const template = rowToTodo(row)
      const repeatFrequency = normalizeRepeatFrequency(template.repeatFrequency)
      const repeatGroupId = template.repeatGroupId || template.id
      if (repeatFrequency === 'none' || !repeatGroupId || !template.done) continue

      const nextDateKey = getNextDueRepeatDateKey(template.dateKey, repeatFrequency, todayKey)
      if (!nextDateKey) continue

      const timestamp = nowIso()
      const todo = createRecurringTodoInstance({ ...template, repeatGroupId }, nextDateKey, timestamp)

      runInsertTodo(todo)
      appendChange('todo', todo.id, 'upsert', todo, deviceId)
      createdTodos.push(todo)
    }
  })

  return createdTodos
}

const toPortableRow = (row, defaults = {}) => {
  const next = { ...row }
  delete next.sync_state

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (next[key] == null || next[key] === defaultValue) {
      delete next[key]
    }
  }

  return next
}

const toPortableBaseRow = (row) => toPortableRow(row)

const toPortableEntryRow = (row) =>
  toPortableRow(row, {
    weather_text: '',
    location_text: '',
  })

const toPortableTodoRow = (row) =>
  toPortableRow(row, {
    description: '',
    priority: 'normal',
    lane_id: 'inbox',
    countdown_enabled: 0,
    repeat_frequency: 'none',
    repeat_group_id: '',
    board_visible: 1,
    reminder_enabled: 0,
    reminder_time: defaultTodoReminderTime,
    done: 0,
    completed_at: null,
    archived_at: null,
  })

const toPortableChangeRow = (row) => ({
  entity: readString(row, 'entity'),
  entity_id: readString(row, 'entity_id'),
  operation: readString(row, 'operation'),
  changed_at: readString(row, 'changed_at', nowIso()),
  device_id: readString(row, 'device_id', 'local'),
  payload_json: compactChangePayloadJson,
})

const getSafeAttachmentFileName = (row) => {
  const id = readString(row, 'id')
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment'

  return `${safeId}${portableAttachmentExtension}`
}

const getAttachmentDataPath = (row) => `${portableAttachmentDir}/${getSafeAttachmentFileName(row)}`

const hasInlineAttachmentData = (row) => row?.data_base64 != null || row?.dataBase64 != null

const readInlineAttachmentDataBase64 = (row) => {
  if (row?.data_base64 != null) return readString(row, 'data_base64')
  if (row?.dataBase64 != null) return readString(row, 'dataBase64')
  return null
}

const toPortableAttachmentRow = (row) => {
  const next = toPortableBaseRow(row)
  delete next.blob
  delete next.data_base64
  delete next.dataBase64
  next.data_path = getAttachmentDataPath(row)

  return next
}

const getRowId = (row) => readString(row, 'id')
const getRowUpdatedAt = (row) => readString(row, 'updated_at') || readString(row, 'created_at')
const getChangeKey = (row) => {
  const entity = readString(row, 'entity')
  const entityId = readString(row, 'entity_id')

  return entity && entityId ? `${entity}:${entityId}` : ''
}

const compactChangeRows = (rows) => {
  const byEntity = new Map()

  for (const row of rows ?? []) {
    const key = getChangeKey(row)
    if (!key) continue

    const existing = byEntity.get(key)
    if (!existing || readString(row, 'changed_at').localeCompare(readString(existing, 'changed_at')) >= 0) {
      byEntity.set(key, row)
    }
  }

  return [...byEntity.values()].sort((left, right) =>
    readString(right, 'changed_at').localeCompare(readString(left, 'changed_at')),
  )
}

const getRetainedChangeRows = (rows) => {
  const cutoff = getChangeLogRetentionCutoffIso()

  return compactChangeRows(rows).filter((row) => {
    if (readString(row, 'sync_state', 'synced') === 'pending') return true
    return readString(row, 'changed_at').localeCompare(cutoff) >= 0
  })
}

const buildTombstones = (...changeGroups) => {
  const tombstones = new Map()

  for (const change of compactChangeRows(changeGroups.flat())) {
    if (readString(change, 'operation') !== 'delete') continue

    const key = getChangeKey(change)
    if (!key) continue

    tombstones.set(key, readString(change, 'changed_at'))
  }

  return tombstones
}

const mergeRowsByKey = (entity, rowGroups, tombstones, keyGetter, timestampGetter = getRowUpdatedAt) => {
  const byKey = new Map()

  for (const row of rowGroups.flat()) {
    const id = getRowId(row)
    const key = keyGetter(row)
    if (!key) continue

    const deletedAt = id ? tombstones.get(`${entity}:${id}`) : undefined
    const updatedAt = timestampGetter(row)
    if (deletedAt && (!updatedAt || deletedAt.localeCompare(updatedAt) >= 0)) continue

    const existing = byKey.get(key)
    if (!existing || updatedAt.localeCompare(timestampGetter(existing)) >= 0) {
      byKey.set(key, row)
    }
  }

  return [...byKey.values()]
}

const normalizeSnapshotArray = (snapshot, key) => (Array.isArray(snapshot?.[key]) ? snapshot[key] : [])

const mergePortableSnapshots = (localSnapshot, remoteSnapshot) => {
  const changes = compactChangeRows([
    ...getRetainedChangeRows(normalizeSnapshotArray(remoteSnapshot, 'changes')),
    ...normalizeSnapshotArray(localSnapshot, 'changes'),
  ]).map(toPortableChangeRow)
  const tombstones = buildTombstones(changes)
  const entries = mergeRowsByKey(
    'entry',
    [normalizeSnapshotArray(remoteSnapshot, 'entries'), normalizeSnapshotArray(localSnapshot, 'entries')],
    tombstones,
    (row) => readString(row, 'date_key') || getRowId(row),
  ).sort((left, right) => readString(right, 'date_key').localeCompare(readString(left, 'date_key')))
  const entryIds = new Set(entries.map(getRowId).filter(Boolean))
  const todos = mergeRowsByKey(
    'todo',
    [normalizeSnapshotArray(remoteSnapshot, 'todos'), normalizeSnapshotArray(localSnapshot, 'todos')],
    tombstones,
    getRowId,
  ).sort((left, right) => readString(right, 'created_at').localeCompare(readString(left, 'created_at')))
  const boardLanes = mergeRowsByKey(
    'boardLane',
    [
      normalizeSnapshotArray(remoteSnapshot, 'board_lanes'),
      normalizeSnapshotArray(remoteSnapshot, 'boardLanes'),
      normalizeSnapshotArray(localSnapshot, 'board_lanes'),
      normalizeSnapshotArray(localSnapshot, 'boardLanes'),
    ],
    tombstones,
    getRowId,
  ).sort((left, right) => readString(left, 'created_at').localeCompare(readString(right, 'created_at')))
  const attachments = mergeRowsByKey(
    'attachment',
    [normalizeSnapshotArray(remoteSnapshot, 'attachments'), normalizeSnapshotArray(localSnapshot, 'attachments')],
    tombstones,
    getRowId,
  )
    .filter((row) => entryIds.has(readString(row, 'entry_id')))
    .sort((left, right) => readString(right, 'created_at').localeCompare(readString(left, 'created_at')))
  const weeklySummaries = mergeRowsByKey(
    'weeklySummary',
    [normalizeSnapshotArray(remoteSnapshot, 'weeklySummaries'), normalizeSnapshotArray(localSnapshot, 'weeklySummaries')],
    tombstones,
    (row) => readString(row, 'week_key'),
    (row) => readString(row, 'updated_at') || readString(row, 'created_at'),
  ).sort((left, right) => readString(right, 'updated_at').localeCompare(readString(left, 'updated_at')))
  const metricDefinitions = mergeRowsByKey(
    'metricDefinition',
    [
      normalizeSnapshotArray(remoteSnapshot, 'metricDefinitions'),
      normalizeSnapshotArray(localSnapshot, 'metricDefinitions'),
    ],
    tombstones,
    getRowId,
  ).sort((left, right) => readString(right, 'created_at').localeCompare(readString(left, 'created_at')))
  const metricDefinitionIds = new Set(metricDefinitions.map(getRowId).filter(Boolean))
  const metricRecords = mergeRowsByKey(
    'metricRecord',
    [normalizeSnapshotArray(remoteSnapshot, 'metricRecords'), normalizeSnapshotArray(localSnapshot, 'metricRecords')],
    tombstones,
    (row) => `${readString(row, 'metric_id')}:${readString(row, 'date_key')}`,
  )
    .filter((row) => metricDefinitionIds.has(readString(row, 'metric_id')))
    .sort((left, right) =>
      readString(right, 'date_key').localeCompare(readString(left, 'date_key')) ||
      readString(right, 'updated_at').localeCompare(readString(left, 'updated_at')),
    )

  const snapshot = {
    app: 'xinxiangyi',
    format: 'xinxiangyi-native-json',
    schemaVersion,
    exportedAt: nowIso(),
    entries: entries.map(toPortableEntryRow),
    todos: todos.map(toPortableTodoRow),
    board_lanes: boardLanes.map(toPortableBaseRow),
    attachments: attachments.map(toPortableAttachmentRow),
    changes,
    weeklySummaries: weeklySummaries.map(toPortableBaseRow),
  }

  if (metricDefinitions.length) {
    snapshot.metricDefinitions = metricDefinitions.map(toPortableBaseRow)
  }

  if (metricRecords.length) {
    snapshot.metricRecords = metricRecords.map(toPortableBaseRow)
  }

  return snapshot
}

const createPortableSnapshot = () => {
  materializeDueRecurringTodos()

  const entries = db.prepare(`SELECT * FROM entries ORDER BY date_key DESC`).all()
  const todos = db.prepare(`SELECT * FROM todos ORDER BY created_at DESC`).all()
  const boardLanes = db.prepare(`SELECT * FROM board_lanes ORDER BY created_at ASC`).all()
  const attachmentRows = db.prepare(`SELECT * FROM attachments ORDER BY created_at DESC`).all()
  const changes = getRetainedChangeRows(db.prepare(`SELECT * FROM changes ORDER BY changed_at DESC`).all())
  const weeklySummaries = db.prepare(`SELECT * FROM weekly_summaries ORDER BY updated_at DESC`).all()
  const metricDefinitions = db.prepare(`SELECT * FROM metric_definitions ORDER BY created_at DESC`).all()
  const metricRecords = db.prepare(`SELECT * FROM metric_records ORDER BY created_at DESC`).all()

  const snapshot = {
    app: 'xinxiangyi',
    format: 'xinxiangyi-native-json',
    schemaVersion,
    exportedAt: nowIso(),
    entries: entries.map(toPortableEntryRow),
    todos: todos.map(toPortableTodoRow),
    board_lanes: boardLanes.map(toPortableBaseRow),
    attachments: attachmentRows.map(toPortableAttachmentRow),
    changes: changes.map(toPortableChangeRow),
    weeklySummaries: weeklySummaries.map(toPortableBaseRow),
  }

  if (metricDefinitions.length) {
    snapshot.metricDefinitions = metricDefinitions.map(toPortableBaseRow)
  }

  if (metricRecords.length) {
    snapshot.metricRecords = metricRecords.map(toPortableBaseRow)
  }

  return snapshot
}

const validatePortableSnapshot = (value) => {
  if (
    value?.app !== 'xinxiangyi' ||
    value?.format !== 'xinxiangyi-native-json' ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.todos) ||
    !Array.isArray(value.attachments) ||
    !Array.isArray(value.changes) ||
    !Array.isArray(value.weeklySummaries)
  ) {
    throw new Error('远端文件不是有效的心象仪跨端同步快照。')
  }

  return value
}

const getLocalAttachmentDataBase64 = (id) => {
  if (!id) return null

  const row = db.prepare('SELECT blob FROM attachments WHERE id = ?').get(id)
  if (!row) return null

  return Buffer.from(row.blob ?? '').toString('base64')
}

const getSourceAttachmentDataBase64 = (row, sourceSnapshots = []) => {
  const id = readString(row, 'id')

  for (const snapshot of sourceSnapshots) {
    const sourceRow = normalizeSnapshotArray(snapshot, 'attachments').find((item) => readString(item, 'id') === id)
    if (!sourceRow || !hasInlineAttachmentData(sourceRow)) continue

    return readInlineAttachmentDataBase64(sourceRow)
  }

  return null
}

const getAttachmentDataBase64ForWrite = (row, sourceSnapshots = []) => {
  if (hasInlineAttachmentData(row)) {
    return readInlineAttachmentDataBase64(row)
  }

  return getLocalAttachmentDataBase64(readString(row, 'id')) ?? getSourceAttachmentDataBase64(row, sourceSnapshots)
}

const writeSyncBundleAttachmentFiles = (snapshot) => {
  const attachmentRows = normalizeSnapshotArray(snapshot, 'attachments')
  const attachmentDir = resolve(syncBundleDir, portableAttachmentDir)
  let count = 0
  let size = 0

  rmSync(attachmentDir, { recursive: true, force: true })

  if (!attachmentRows.length) {
    return {
      directory: portableAttachmentDir,
      count,
      size,
    }
  }

  mkdirSync(attachmentDir, { recursive: true })

  for (const row of attachmentRows) {
    const dataBase64 = getAttachmentDataBase64ForWrite(row)
    if (dataBase64 == null) continue

    const filePath = resolve(syncBundleDir, getAttachmentDataPath(row))
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, dataBase64)
    count += 1
    size += Buffer.byteLength(dataBase64, 'utf8')
  }

  return {
    directory: portableAttachmentDir,
    count,
    size,
  }
}

const getSyncBundleGuide = (manifest) => `心象仪本地同步包

这个文件夹可以作为 WebDAV / 坚果云远端同步目录的内容。

推荐远端目录：
${manifest.recommendedRemotePath}

需要上传的文件：
- ${portableSnapshotFile}: 跨端数据快照，包含日记、Todo、周总结和附件元数据。
- ${portableAttachmentDir}/: 附件内容文件，每个附件一个独立 .b64 文件。
- ${portableManifestFile}: 同步清单，记录快照格式、schema、生成时间和大小。

不需要上传：
- data/xinxiangyi.sqlite
- data/.sync
- 任意本机临时文件或备份文件

当前推荐使用方式：
1. 在当前设备编辑后，点击应用里的同步按钮上传快照。
2. 换到另一台设备后，先点击同步按钮拉取快照，再开始编辑。
3. 如果本机有待同步改动，当前版本会先读取远端快照，按记录更新时间和删除标记合并后再上传。极端同一条记录同时编辑时，较新的更新时间会优先。

当前同步协议：
${manifest.format}

生成时间：
${manifest.generatedAt}
`

const writeSyncBundleFiles = (snapshotBody, manifest) => {
  mkdirSync(syncBundleDir, { recursive: true })

  const manifestBody = JSON.stringify(manifest, null, 2)
  writeFileSync(resolve(syncBundleDir, portableSnapshotFile), snapshotBody)
  writeFileSync(resolve(syncBundleDir, portableManifestFile), manifestBody)
  writeFileSync(resolve(syncBundleDir, syncBundleGuideFile), getSyncBundleGuide(manifest))

  return manifestBody
}

const createPortableManifest = (snapshotBody, extra = {}, attachmentFiles = { directory: portableAttachmentDir, count: 0, size: 0 }) => {
  const generatedAt = nowIso()
  const snapshotSize = Buffer.byteLength(snapshotBody, 'utf8')
  const files = [
    {
      name: portableSnapshotFile,
      role: 'snapshot',
      size: snapshotSize,
    },
    {
      name: portableManifestFile,
      role: 'manifest',
    },
    {
      name: syncBundleGuideFile,
      role: 'guide',
    },
  ]

  if (attachmentFiles.count > 0) {
    files.push({
      name: attachmentFiles.directory,
      role: 'attachments',
      size: attachmentFiles.size,
      count: attachmentFiles.count,
    })
  }

  return {
    app: 'xinxiangyi',
    format: 'xinxiangyi-native-json',
    schemaVersion,
    file: portableSnapshotFile,
    manifest: portableManifestFile,
    bundleName: syncBundleName,
    recommendedRemotePath: `/${syncBundleName}`,
    generatedAt,
    pushedAt: generatedAt,
    size: snapshotSize,
    totalSize: snapshotSize + attachmentFiles.size,
    attachmentFiles,
    files,
    ...extra,
  }
}

const createLocalSyncBundle = (extra = {}, snapshot = createPortableSnapshot()) => {
  const snapshotBody = JSON.stringify(snapshot)
  const attachmentFiles = writeSyncBundleAttachmentFiles(snapshot)
  const manifest = createPortableManifest(snapshotBody, extra, attachmentFiles)
  const manifestBody = writeSyncBundleFiles(snapshotBody, manifest)

  return {
    snapshotBody,
    manifest,
    manifestBody,
  }
}

const readRemotePortableSnapshot = async (config) => {
  const snapshotResponse = await fetch(getWebDavUrl(config, portableSnapshotFile), {
    method: 'GET',
    headers: getWebDavHeaders(config),
  })

  if (snapshotResponse.ok) {
    const raw = await snapshotResponse.text()
    let parsed

    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('远端跨端同步快照不是合法 JSON 文件。')
    }

    return {
      raw,
      snapshot: validatePortableSnapshot(parsed),
    }
  }

  if (isMissingWebDavResource(snapshotResponse.status)) {
    return null
  }

  const detail = await snapshotResponse.text().catch(() => '')
  throw new Error(`下载跨端同步快照失败：${snapshotResponse.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
}

const getWebDavTextFile = async (config, file) => {
  const response = await fetch(getWebDavUrl(config, file), {
    method: 'GET',
    headers: getWebDavHeaders(config),
  })

  if (response.ok) {
    return response.text()
  }

  const detail = await response.text().catch(() => '')
  throw new Error(`下载远端文件失败：${file} ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
}

const putWebDavTextFile = async (config, file, body, contentType = 'text/plain; charset=utf-8') => {
  const response = await fetch(getWebDavUrl(config, file), {
    method: 'PUT',
    headers: getWebDavHeaders(config, contentType),
    body,
  })

  if (response.ok) {
    return response
  }

  const detail = await response.text().catch(() => '')
  throw new Error(`上传远端文件失败：${file} ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
}

const uploadPortableAttachmentFiles = async (config, snapshot, sourceSnapshots = []) => {
  const attachmentRows = normalizeSnapshotArray(snapshot, 'attachments')
  let count = 0
  let size = 0

  if (!attachmentRows.length) {
    return {
      directory: portableAttachmentDir,
      count,
      size,
    }
  }

  await ensureWebDavCollection(config, portableAttachmentDir)

  for (const row of attachmentRows) {
    const dataBase64 = getAttachmentDataBase64ForWrite(row, sourceSnapshots)
    if (dataBase64 == null) continue

    await putWebDavTextFile(config, getAttachmentDataPath(row), dataBase64)
    count += 1
    size += Buffer.byteLength(dataBase64, 'utf8')
  }

  return {
    directory: portableAttachmentDir,
    count,
    size,
  }
}

const resolvePortableAttachmentDataBase64 = async (row, resolveDetachedAttachment) => {
  if (hasInlineAttachmentData(row)) {
    return readInlineAttachmentDataBase64(row)
  }

  const localDataBase64 = getLocalAttachmentDataBase64(readString(row, 'id'))
  if (localDataBase64 != null) {
    return localDataBase64
  }

  if (resolveDetachedAttachment) {
    const remoteDataBase64 = await resolveDetachedAttachment(row)
    if (remoteDataBase64 != null) {
      return remoteDataBase64
    }
  }

  if (readNumber(row, 'size') === 0) {
    return ''
  }

  throw new Error(`附件内容缺失：${readString(row, 'name', readString(row, 'id', 'unknown'))}`)
}

const preparePortableAttachmentImports = async (snapshot, resolveDetachedAttachment) =>
  Promise.all(
    normalizeSnapshotArray(snapshot, 'attachments').map(async (row) => ({
      row,
      dataBase64: await resolvePortableAttachmentDataBase64(row, resolveDetachedAttachment),
    })),
  )

const importPortableSnapshot = async (snapshot, options = {}) => {
  const timestamp = nowIso()
  const attachmentImports = await preparePortableAttachmentImports(snapshot, options.resolveDetachedAttachment)

  transaction(() => {
    db.prepare('DELETE FROM attachments').run()
    db.prepare('DELETE FROM entries').run()
    db.prepare('DELETE FROM todos').run()
    db.prepare('DELETE FROM board_lanes').run()
    db.prepare('DELETE FROM changes').run()
    db.prepare('DELETE FROM weekly_summaries').run()
    db.prepare('DELETE FROM metric_records').run()
    db.prepare('DELETE FROM metric_definitions').run()

    const insertEntry = db.prepare(`
      INSERT INTO entries (
        id, date_key, title, body, mood_text, weather_text, location_text,
        mood_json, tags_json, created_at, updated_at, sync_state
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    `)
    for (const row of snapshot.entries) {
      insertEntry.run(
        readString(row, 'id', createId('entry')),
        readString(row, 'date_key'),
        readString(row, 'title'),
        readString(row, 'body'),
        readString(row, 'mood_text'),
        readString(row, 'weather_text'),
        readString(row, 'location_text'),
        readString(row, 'mood_json', '{}'),
        readString(row, 'tags_json', '[]'),
        readString(row, 'created_at', timestamp),
        readString(row, 'updated_at', timestamp),
      )
    }

    const insertTodo = db.prepare(`
      INSERT INTO todos (
        id, date_key, title, description, priority, lane_id, countdown_enabled,
        repeat_frequency, repeat_group_id, board_visible, reminder_enabled, reminder_time,
        done, created_at, updated_at, completed_at, archived_at, sync_state
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    `)
    for (const row of snapshot.todos) {
      insertTodo.run(
        readString(row, 'id', createId('todo')),
        readString(row, 'date_key'),
        readString(row, 'title'),
        readString(row, 'description', ''),
        readString(row, 'priority', 'normal'),
        readString(row, 'lane_id', 'inbox'),
        readNumberAny(row, ['countdown_enabled', 'countdownEnabled']),
        readRepeatFrequency(row),
        readStringAny(row, ['repeat_group_id', 'repeatGroupId']),
        readBoardVisible(row) ? 1 : 0,
        readReminderEnabled(row) ? 1 : 0,
        readReminderTime(row),
        readNumber(row, 'done'),
        readString(row, 'created_at', timestamp),
        readString(row, 'updated_at', timestamp),
        readOptionalString(row, 'completed_at'),
        readStringAny(row, ['archived_at', 'archivedAt']) || null,
      )
    }

    const insertBoardLane = db.prepare(`
      INSERT INTO board_lanes (id, label, color_id, created_at, updated_at, sync_state)
      VALUES (?, ?, ?, ?, ?, 'synced')
    `)
    for (const row of snapshot.board_lanes ?? snapshot.boardLanes ?? []) {
      insertBoardLane.run(
        readString(row, 'id', createId('lane')),
        readString(row, 'label'),
        readString(row, 'color_id', readString(row, 'colorId', 'blue')),
        readString(row, 'created_at', timestamp),
        readString(row, 'updated_at', timestamp),
      )
    }

    const insertAttachment = db.prepare(`
      INSERT INTO attachments (
        id, entry_id, date_key, name, type, size, blob, created_at, updated_at, sync_state
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    `)
    for (const { row, dataBase64 } of attachmentImports) {
      const blob = Buffer.from(dataBase64, 'base64')

      insertAttachment.run(
        readString(row, 'id', createId('attachment')),
        readString(row, 'entry_id'),
        readString(row, 'date_key'),
        readString(row, 'name'),
        readString(row, 'type', 'application/octet-stream'),
        readNumber(row, 'size', blob.length),
        blob,
        readString(row, 'created_at', timestamp),
        readString(row, 'updated_at', timestamp),
      )
    }

    const insertChange = db.prepare(`
      INSERT INTO changes (entity, entity_id, operation, changed_at, device_id, sync_state, payload_json)
      VALUES (?, ?, ?, ?, ?, 'synced', ?)
    `)
    for (const row of getRetainedChangeRows(snapshot.changes)) {
      insertChange.run(
        readString(row, 'entity'),
        readString(row, 'entity_id'),
        readString(row, 'operation'),
        readString(row, 'changed_at', timestamp),
        readString(row, 'device_id', 'webdav'),
        compactChangePayloadJson,
      )
    }

    const insertWeeklySummary = db.prepare(`
      INSERT INTO weekly_summaries (week_key, content, model, provider, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const row of snapshot.weeklySummaries) {
      insertWeeklySummary.run(
        readString(row, 'week_key'),
        readString(row, 'content'),
        readString(row, 'model'),
        readString(row, 'provider', 'local'),
        readString(row, 'created_at', timestamp),
        readString(row, 'updated_at', timestamp),
      )
    }

    const metricDefinitions = Array.isArray(snapshot.metricDefinitions) ? snapshot.metricDefinitions : []
    const metricRecords = Array.isArray(snapshot.metricRecords) ? snapshot.metricRecords : []
    const insertMetricDefinition = db.prepare(`
      INSERT INTO metric_definitions (id, name, unit, color, target_value, created_at, updated_at, sync_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')
    `)
    for (const row of metricDefinitions) {
      insertMetricDefinition.run(
        readString(row, 'id', createId('metric')),
        readString(row, 'name'),
        readString(row, 'unit'),
        readString(row, 'color', '#176f66'),
        row.target_value == null ? null : readNumber(row, 'target_value'),
        readString(row, 'created_at', timestamp),
        readString(row, 'updated_at', timestamp),
      )
    }

    const insertMetricRecord = db.prepare(`
      INSERT INTO metric_records (id, metric_id, date_key, value, created_at, updated_at, sync_state)
      VALUES (?, ?, ?, ?, ?, ?, 'synced')
    `)
    for (const row of metricRecords) {
      insertMetricRecord.run(
        readString(row, 'id', createId('metric_record')),
        readString(row, 'metric_id'),
        readString(row, 'date_key'),
        readNumber(row, 'value'),
        readString(row, 'created_at', timestamp),
        readString(row, 'updated_at', timestamp),
      )
    }
  })
}

const uploadPortableSnapshot = async (config, snapshot = createPortableSnapshot(), sourceSnapshots = []) => {
  const uploadedAttachments = await uploadPortableAttachmentFiles(config, snapshot, sourceSnapshots)
  const { snapshotBody, manifest, manifestBody } = createLocalSyncBundle({
    remotePath: config.remotePath,
    source: 'webdav-push',
    uploadedAttachments,
  }, snapshot)
  await putWebDavTextFile(config, portableSnapshotFile, snapshotBody, 'application/json; charset=utf-8')
  await putWebDavTextFile(config, portableManifestFile, manifestBody, 'application/json; charset=utf-8')

  return manifest
}

const validateIncomingDatabase = (incomingPath) => {
  const incomingDb = new DatabaseSync(incomingPath, { readOnly: true })

  try {
    const integrity = incomingDb.prepare('PRAGMA integrity_check').get()
    const integrityValue = Object.values(integrity ?? {})[0]

    if (integrityValue !== 'ok') {
      throw new Error(`远端数据库完整性检查失败：${integrityValue}`)
    }

    const tables = incomingDb
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('entries', 'todos', 'attachments', 'changes')`)
      .all()

    if (tables.length < 4) {
      throw new Error('远端数据库不是有效的心象仪数据文件。')
    }
  } finally {
    incomingDb.close()
  }
}

const pushWebDavSnapshot = async (request, response) => {
  let config

  try {
    config = getWebDavConfig(await readJson(request))
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'WebDAV 配置无效。' })
    return
  }

  if (rejectUnsafeWebDavMerge(response)) return

  try {
    await ensureWebDavCollection(config)
    const localSnapshot = createPortableSnapshot()
    const remote = await readRemotePortableSnapshot(config)
    const snapshot = remote ? mergePortableSnapshots(localSnapshot, remote.snapshot) : localSnapshot
    const manifest = await uploadPortableSnapshot(config, snapshot, [localSnapshot, remote?.snapshot].filter(Boolean))

    if (remote) {
      await importPortableSnapshot(snapshot, {
        resolveDetachedAttachment: (row) => getWebDavTextFile(config, getAttachmentDataPath(row)),
      })
      createLocalSyncBundle({
        remotePath: config.remotePath,
        source: 'webdav-push',
        mirroredAt: nowIso(),
      })
    } else {
      markLocalContentSynced()
      compactLocalChangeLog()
    }

    sendJson(response, 200, {
      ok: true,
      direction: 'push',
      remotePath: config.remotePath,
      file: portableSnapshotFile,
      size: manifest.size,
      syncedAt: manifest.pushedAt,
    })
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'WebDAV Push 失败。' })
  }
}

const replaceWebDavSnapshot = async (request, response) => {
  let config

  try {
    config = getWebDavConfig(await readJson(request))
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'WebDAV 配置无效。' })
    return
  }

  try {
    await ensureWebDavCollection(config)
    const snapshot = createPortableSnapshot()
    const manifest = await uploadPortableSnapshot(config, snapshot, [snapshot])

    rmSync(webDavRecoveryMarkerPath, { force: true })
    markLocalContentSynced()
    compactLocalChangeLog()
    createLocalSyncBundle({
      remotePath: config.remotePath,
      source: 'webdav-local-replace',
      mirroredAt: nowIso(),
    })

    sendJson(response, 200, {
      ok: true,
      direction: 'push',
      remotePath: config.remotePath,
      file: portableSnapshotFile,
      size: manifest.size,
      syncedAt: manifest.pushedAt,
    })
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : '用本机数据重建云端失败。' })
  }
}

const exportSyncBundle = async (_request, response) => {
  try {
    const { manifest } = createLocalSyncBundle({
      source: 'manual-export',
    })

    sendJson(response, 200, {
      ok: true,
      path: syncBundleDir,
      remotePath: `/${syncBundleName}`,
      exportedAt: manifest.generatedAt,
      files: manifest.files,
      message: `本地同步包已生成：${syncBundleDir}`,
    })
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : '生成本地同步包失败。' })
  }
}

const pullWebDavSnapshot = async (request, response) => {
  let config

  try {
    config = getWebDavConfig(await readJson(request))
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'WebDAV 配置无效。' })
    return
  }

  if (rejectUnsafeWebDavMerge(response)) return

  const incomingPath = resolve(syncDir, `incoming-${Date.now()}.sqlite`)
  const backupPath = resolve(syncDir, `local-backup-${Date.now()}.sqlite`)

  try {
    const snapshotResponse = await fetch(getWebDavUrl(config, portableSnapshotFile), {
      method: 'GET',
      headers: getWebDavHeaders(config),
    })

    if (snapshotResponse.ok) {
      const raw = await snapshotResponse.text()
      let parsed

      try {
        parsed = JSON.parse(raw)
      } catch {
        throw new Error('远端跨端同步快照不是合法 JSON 文件。')
      }

      const snapshot = validatePortableSnapshot(parsed)
      let remoteManifest = {}
      const remoteManifestResponse = await fetch(getWebDavUrl(config, portableManifestFile), {
        method: 'GET',
        headers: getWebDavHeaders(config),
      }).catch(() => null)

      if (remoteManifestResponse?.ok) {
        const remoteManifestText = await remoteManifestResponse.text().catch(() => '')

        try {
          remoteManifest = JSON.parse(remoteManifestText)
        } catch {
          remoteManifest = {}
        }
      }

      if (existsSync(databasePath)) {
        copyFileSync(databasePath, backupPath)
      }

      try {
        await importPortableSnapshot(snapshot, {
          resolveDetachedAttachment: (row) => getWebDavTextFile(config, getAttachmentDataPath(row)),
        })
      } catch (error) {
        if (existsSync(backupPath)) {
          copyFileSync(backupPath, databasePath)
          db = new DatabaseSync(databasePath)
          configureDatabaseConnection()
        }

        throw error
      }

      createLocalSyncBundle({
        ...remoteManifest,
        remotePath: config.remotePath,
        source: 'webdav-pull',
        mirroredAt: nowIso(),
      })

      sendJson(response, 200, {
        ok: true,
        direction: 'pull',
        remotePath: config.remotePath,
        file: portableSnapshotFile,
        size: Buffer.byteLength(raw, 'utf8'),
        backupPath: existsSync(backupPath) ? backupPath : '',
        syncedAt: nowIso(),
      })
      return
    }

    if (!isMissingWebDavResource(snapshotResponse.status)) {
      const detail = await snapshotResponse.text().catch(() => '')
      throw new Error(`下载跨端同步快照失败：${snapshotResponse.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
    }

    const remoteResponse = await fetch(getWebDavUrl(config, databaseName), {
      method: 'GET',
      headers: getWebDavHeaders(config),
    })

    if (!remoteResponse.ok) {
      const detail = await remoteResponse.text().catch(() => '')
      if (isMissingWebDavResource(remoteResponse.status)) {
        throw new Error(`远端目录或同步快照不存在：${remoteResponse.status}。请确认 Remote Path 使用 /xinxiangyi-sync；如果是首次使用，点击同步会上传本机快照初始化远端。${detail ? ` ${detail.slice(0, 160)}` : ''}`)
      }
      throw new Error(`远端没有跨端同步快照，也没有旧版 SQLite 快照：${remoteResponse.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
    }

    writeFileSync(incomingPath, Buffer.from(await remoteResponse.arrayBuffer()))
    validateIncomingDatabase(incomingPath)

    if (existsSync(databasePath)) {
      copyFileSync(databasePath, backupPath)
    }

    db.close()

    try {
      copyFileSync(incomingPath, databasePath)
      db = new DatabaseSync(databasePath)
      configureDatabaseConnection()
      ensureColumn('entries', 'weather_text', `weather_text TEXT NOT NULL DEFAULT ''`)
      ensureColumn('entries', 'location_text', `location_text TEXT NOT NULL DEFAULT ''`)
      ensureColumn('todos', 'description', `description TEXT NOT NULL DEFAULT ''`)
      ensureColumn('todos', 'priority', `priority TEXT NOT NULL DEFAULT 'normal'`)
      ensureColumn('todos', 'lane_id', `lane_id TEXT NOT NULL DEFAULT 'inbox'`)
      ensureColumn('todos', 'countdown_enabled', `countdown_enabled INTEGER NOT NULL DEFAULT 0`)
      ensureColumn('todos', 'repeat_frequency', `repeat_frequency TEXT NOT NULL DEFAULT 'none'`)
      ensureColumn('todos', 'repeat_group_id', `repeat_group_id TEXT NOT NULL DEFAULT ''`)
      ensureColumn('todos', 'board_visible', `board_visible INTEGER NOT NULL DEFAULT 1`)
      ensureColumn('todos', 'reminder_enabled', `reminder_enabled INTEGER NOT NULL DEFAULT 0`)
      ensureColumn('todos', 'reminder_time', `reminder_time TEXT NOT NULL DEFAULT '09:00'`)
      createIndexes()
      db.exec(`PRAGMA user_version = ${schemaVersion}`)
    } catch (error) {
      if (existsSync(backupPath)) {
        copyFileSync(backupPath, databasePath)
      }
      db = new DatabaseSync(databasePath)
      configureDatabaseConnection()
      throw error
    }

    const manifest = await uploadPortableSnapshot(config)

    sendJson(response, 200, {
      ok: true,
      direction: 'pull',
      remotePath: config.remotePath,
      file: databaseName,
      size: statSync(databasePath).size,
      backupPath: existsSync(backupPath) ? backupPath : '',
      syncedAt: nowIso(),
      migratedFile: manifest.file,
      migratedSize: manifest.size,
    })
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'WebDAV Pull 失败。' })
  } finally {
    rmSync(incomingPath, { force: true })
  }
}

const testWebDavConnection = async (request, response) => {
  let config

  try {
    config = getWebDavConfig(await readJson(request))
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'WebDAV 配置无效。' })
    return
  }

  const checkedAt = nowIso()
  const targetUrl = getWebDavUrl(config)

  try {
    const probeResponse = await fetch(targetUrl, {
      method: 'PROPFIND',
      headers: getWebDavHeaders(config, undefined, {
        Accept: 'application/xml, text/xml, */*',
        Depth: '0',
      }),
    })

    if (probeResponse.status === 401 || probeResponse.status === 403) {
      sendJson(response, 200, {
        ok: false,
        pathExists: false,
        writable: false,
        status: probeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: 'WebDAV 已响应，但账号或应用密码没有通过验证。',
      })
      return
    }

    if (probeResponse.status === 404) {
      sendJson(response, 200, {
        ok: true,
        pathExists: false,
        writable: false,
        status: probeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: 'WebDAV 连接成功，但远端目录不存在。首次上传同步时会尝试自动创建该目录。',
      })
      return
    }

    if (![200, 207].includes(probeResponse.status)) {
      const detail = await probeResponse.text().catch(() => '')
      sendJson(response, 200, {
        ok: false,
        pathExists: false,
        writable: false,
        status: probeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: `WebDAV 目录探测失败：${probeResponse.status}${detail ? ` ${detail.slice(0, 160)}` : ''}`,
      })
      return
    }

    const testFile = `.xinxiangyi-webdav-test-${Date.now()}.txt`
    const writeResponse = await fetch(getWebDavUrl(config, testFile), {
      method: 'PUT',
      headers: getWebDavHeaders(config, 'text/plain; charset=utf-8'),
      body: `xinxiangyi webdav test ${checkedAt}\n`,
    })

    if (!writeResponse.ok) {
      const detail = await writeResponse.text().catch(() => '')
      sendJson(response, 200, {
        ok: false,
        pathExists: true,
        writable: false,
        status: writeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: `WebDAV 目录可访问，但测试写入失败：${writeResponse.status}${detail ? ` ${detail.slice(0, 160)}` : ''}`,
      })
      return
    }

    await fetch(getWebDavUrl(config, testFile), {
      method: 'DELETE',
      headers: getWebDavHeaders(config),
    }).catch(() => undefined)

    sendJson(response, 200, {
      ok: true,
      pathExists: true,
      writable: true,
      status: writeResponse.status,
      remotePath: config.remotePath,
      checkedAt,
      message: 'WebDAV 连接成功，目录存在，并且测试写入通过。',
    })
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'WebDAV 连接测试失败。' })
  }
}

const normalizeChatCompletionsEndpoint = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''

  if (!raw) {
    throw new Error('请先配置大模型 Endpoint。')
  }

  let url

  try {
    url = new URL(raw)
  } catch {
    throw new Error('Endpoint 不是合法的 URL。请填写完整的 http(s) 地址。')
  }

  const normalizedPath = url.pathname.replace(/\/+$/, '')

  if (
    normalizedPath === '' ||
    normalizedPath === '/' ||
    normalizedPath === '/v1' ||
    normalizedPath.startsWith('/docs')
  ) {
    url.pathname = '/v1/chat/completions'
    url.search = ''
    return url.toString()
  }

  if (normalizedPath.endsWith('/chat/completions')) {
    url.pathname = normalizedPath
    return url.toString()
  }

  if (normalizedPath.endsWith('/responses')) {
    throw new Error('当前周总结只支持 Chat Completions 兼容接口，请填写 /v1/chat/completions 或可自动补全的基础网关地址。')
  }

  return url.toString()
}

const extractAiContent = (payload) => {
  if (payload?.error?.message) {
    throw new Error(payload.error.message)
  }

  return payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? ''
}

const requestWeeklySummary = async (request, response) => {
  const payload = await readJson(request)
  let endpoint = ''
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  const model = typeof payload.model === 'string' ? payload.model.trim() : ''
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const temperature = typeof payload.temperature === 'number' ? payload.temperature : 0.4

  try {
    endpoint = normalizeChatCompletionsEndpoint(payload.endpoint)
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : 'Endpoint 配置无效。',
    })
    return
  }

  if (!apiKey) {
    sendJson(response, 400, { error: '请先配置大模型 API Key。' })
    return
  }

  if (!model) {
    sendJson(response, 400, { error: '请先配置模型名称。' })
    return
  }

  if (messages.length === 0) {
    sendJson(response, 400, { error: '本次总结没有可发送的消息内容。' })
    return
  }

  let upstreamResponse

  try {
    upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知网络错误。'
    sendJson(response, 502, {
      error: `本地代理无法连接到上游模型接口。请检查 Endpoint、网络、HTTPS 证书或代理设置。原始错误：${detail}`,
    })
    return
  }

  const responseText = await upstreamResponse.text()
  let upstreamPayload = {}

  try {
    upstreamPayload = responseText ? JSON.parse(responseText) : {}
  } catch {
    upstreamPayload = {}
  }

  try {
    const content = extractAiContent(upstreamPayload).trim()

    if (!upstreamResponse.ok) {
      throw new Error(content || `请求失败：${upstreamResponse.status}`)
    }

    if (!content) {
      throw new Error(responseText || '模型没有返回可用内容。')
    }

    sendJson(response, 200, {
      content,
      model,
      resolvedEndpoint: endpoint,
    })
  } catch (error) {
    sendJson(response, upstreamResponse.ok ? 502 : upstreamResponse.status, {
      error: error instanceof Error ? error.message : '生成周总结失败。',
      upstreamStatus: upstreamResponse.status,
    })
  }
}

const appendChange = (entity, entityId, operation, _payload, deviceId) => {
  db.prepare(`
    INSERT INTO changes (entity, entity_id, operation, changed_at, device_id, sync_state, payload_json)
    VALUES ($entity, $entityId, $operation, $changedAt, $deviceId, 'pending', $payloadJson)
  `).run({
    $entity: entity,
    $entityId: entityId,
    $operation: operation,
    $changedAt: nowIso(),
    $deviceId: deviceId,
    $payloadJson: compactChangePayloadJson,
  })
}

const transaction = (callback) => {
  db.exec('BEGIN IMMEDIATE')

  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

const readRequestBody = async (request, maxBytes = 80 * 1024 * 1024) => {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) {
      throw new Error('请求体过大。请先压缩图片，或等待附件分片同步版本。')
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

const readJson = async (request) => {
  const raw = await readRequestBody(request)

  return raw ? JSON.parse(raw) : {}
}

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

const notFound = (response) => sendJson(response, 404, { error: 'API route not found.' })

const getState = () => {
  materializeDueRecurringTodos()

  return {
    boardLanes: db.prepare('SELECT * FROM board_lanes ORDER BY created_at ASC').all().map(rowToBoardLane),
    metricDefinitions: db
      .prepare('SELECT * FROM metric_definitions ORDER BY created_at ASC')
      .all()
      .map(rowToMetricDefinition),
    metricRecords: db
      .prepare('SELECT * FROM metric_records ORDER BY date_key DESC, updated_at DESC')
      .all()
      .map(rowToMetricRecord),
    changes: db.prepare('SELECT * FROM changes ORDER BY changed_at DESC').all().map(rowToChange),
    weeklySummaries: db
      .prepare('SELECT * FROM weekly_summaries ORDER BY updated_at DESC')
      .all()
      .map(rowToWeeklySummary),
    counts: {
      entries: Number(db.prepare('SELECT COUNT(*) AS count FROM entries').get()?.count ?? 0),
      todos: Number(db.prepare('SELECT COUNT(*) AS count FROM todos').get()?.count ?? 0),
      archivedTodos: Number(db.prepare('SELECT COUNT(*) AS count FROM todos WHERE archived_at IS NOT NULL').get()?.count ?? 0),
      attachments: Number(db.prepare('SELECT COUNT(*) AS count FROM attachments').get()?.count ?? 0),
    },
    meta: getMeta(),
  }
}

const readPagination = (url, defaults) => {
  const requestedLimit = Number(url.searchParams.get('limit'))
  const requestedOffset = Number(url.searchParams.get('offset'))

  return {
    limit: Number.isFinite(requestedLimit)
      ? Math.min(defaults.max, Math.max(1, Math.round(requestedLimit)))
      : defaults.limit,
    offset: Number.isFinite(requestedOffset) ? Math.max(0, Math.round(requestedOffset)) : 0,
  }
}

const createPage = (items, total, limit, offset) => ({
  items,
  total,
  limit,
  offset,
  hasMore: offset + items.length < total,
})

const getEntriesPage = (url) => {
  const { limit, offset } = readPagination(url, { limit: 366, max: 500 })
  const total = Number(db.prepare('SELECT COUNT(*) AS count FROM entries').get()?.count ?? 0)
  const items = db.prepare('SELECT * FROM entries ORDER BY date_key DESC LIMIT ? OFFSET ?').all(limit, offset).map(rowToEntry)

  return createPage(items, total, limit, offset)
}

const getTodosPage = (url) => {
  materializeDueRecurringTodos()
  const { limit, offset } = readPagination(url, { limit: 500, max: 1000 })
  const total = Number(db.prepare('SELECT COUNT(*) AS count FROM todos').get()?.count ?? 0)
  const items = db.prepare('SELECT * FROM todos ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset).map(rowToTodo)

  return createPage(items, total, limit, offset)
}

const getAttachmentsPage = (url) => {
  const { limit, offset } = readPagination(url, { limit: 500, max: 1000 })
  const total = Number(db.prepare('SELECT COUNT(*) AS count FROM attachments').get()?.count ?? 0)
  const entryId = url.searchParams.get('entryId')?.trim() ?? ''
  const rows = entryId
    ? db.prepare('SELECT * FROM attachments WHERE entry_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(entryId, limit, offset)
    : db.prepare('SELECT * FROM attachments ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset)
  const scopedTotal = entryId
    ? Number(db.prepare('SELECT COUNT(*) AS count FROM attachments WHERE entry_id = ?').get(entryId)?.count ?? 0)
    : total

  return createPage(rows.map(rowToAttachment), scopedTotal, limit, offset)
}

const sendAttachmentContent = (response, id) => {
  const attachment = db.prepare('SELECT name, type, size, blob FROM attachments WHERE id = ?').get(id)

  if (!attachment) {
    sendJson(response, 404, { error: 'Attachment not found.' })
    return
  }

  const body = Buffer.from(attachment.blob)
  response.writeHead(200, {
    'Content-Type': attachment.type || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'private, max-age=300',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.name || id)}`,
  })
  response.end(body)
}

const upsertEntry = async (request, response) => {
  const payload = await readJson(request)
  const { draft, mood, files = [] } = payload
  const timestamp = nowIso()
  const existing = db.prepare('SELECT * FROM entries WHERE date_key = ?').get(draft.dateKey)
  const entry = {
    id: existing?.id ?? createId('entry'),
    dateKey: draft.dateKey,
    title: draft.title,
    body: draft.body,
    moodText: draft.moodText,
    weatherText: draft.weatherText ?? existing?.weather_text ?? '',
    locationText: draft.locationText ?? existing?.location_text ?? '',
    mood,
    tags: draft.tags,
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)
  const createdAttachments = []

  transaction(() => {
    db.prepare(`
      INSERT INTO entries (
        id, date_key, title, body, mood_text, weather_text, location_text, mood_json, tags_json, created_at, updated_at, sync_state
      )
      VALUES (
        $id, $dateKey, $title, $body, $moodText, $weatherText, $locationText, $moodJson, $tagsJson, $createdAt, $updatedAt, $syncState
      )
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
    `).run({
      $id: entry.id,
      $dateKey: entry.dateKey,
      $title: entry.title,
      $body: entry.body,
      $moodText: entry.moodText,
      $weatherText: entry.weatherText,
      $locationText: entry.locationText,
      $moodJson: JSON.stringify(entry.mood),
      $tagsJson: JSON.stringify(entry.tags),
      $createdAt: entry.createdAt,
      $updatedAt: entry.updatedAt,
      $syncState: entry.syncState,
    })
    appendChange('entry', entry.id, 'upsert', entry, deviceId)

    for (const file of files) {
      const attachment = {
        id: createId('attachment'),
        entryId: entry.id,
        dateKey: entry.dateKey,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncState: 'pending',
      }
      createdAttachments.push(attachment)

      db.prepare(`
        INSERT INTO attachments (
          id, entry_id, date_key, name, type, size, blob, created_at, updated_at, sync_state
        )
        VALUES (
          $id, $entryId, $dateKey, $name, $type, $size, $blob, $createdAt, $updatedAt, $syncState
        )
      `).run({
        $id: attachment.id,
        $entryId: attachment.entryId,
        $dateKey: attachment.dateKey,
        $name: attachment.name,
        $type: attachment.type,
        $size: attachment.size,
        $blob: Buffer.from(file.dataBase64, 'base64'),
        $createdAt: attachment.createdAt,
        $updatedAt: attachment.updatedAt,
        $syncState: attachment.syncState,
      })
      appendChange(
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
      )
    }
  })

  sendJson(response, 200, { entry, attachments: createdAttachments })
}

const deleteEntryRows = (entryRows, deviceId) => {
  for (const row of entryRows) {
    const entry = rowToEntry(row)
    const attachmentsForEntry = db.prepare('SELECT * FROM attachments WHERE entry_id = ?').all(entry.id).map(rowToAttachment)

    db.prepare('DELETE FROM entries WHERE id = ?').run(entry.id)

    for (const attachment of attachmentsForEntry) {
      appendChange(
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
      )
    }

    appendChange('entry', entry.id, 'delete', entry, deviceId)
  }
}

const deleteEntry = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Journal entry not found.' })
    return
  }

  const deviceId = getDeviceId(request)

  transaction(() => {
    deleteEntryRows([existing], deviceId)
  })

  sendJson(response, 200, { ok: true })
}

const deleteEntriesBatch = async (request, response) => {
  const payload = await readJson(request)
  const ids = Array.isArray(payload.ids)
    ? [...new Set(payload.ids.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))]
    : []

  if (ids.length === 0) {
    sendJson(response, 400, { error: '请选择至少一条日记记录。' })
    return
  }

  const placeholders = ids.map(() => '?').join(', ')
  const entryRows = db.prepare(`SELECT * FROM entries WHERE id IN (${placeholders})`).all(...ids)

  if (entryRows.length === 0) {
    sendJson(response, 404, { error: '没有找到可删除的日记记录。' })
    return
  }

  const deviceId = getDeviceId(request)

  transaction(() => {
    deleteEntryRows(entryRows, deviceId)
  })

  sendJson(response, 200, { ok: true, deletedCount: entryRows.length })
}

const addTodo = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const repeatFrequency = normalizeRepeatFrequency(payload.repeatFrequency)
  const repeatGroupId = repeatFrequency === 'none' ? '' : createId('repeat')
  const boardVisible = Object.hasOwn(payload, 'boardVisible')
    ? Boolean(payload.boardVisible)
    : repeatFrequency === 'none'
  const todo = {
    id: createId('todo'),
    dateKey: payload.dateKey,
    title: payload.title,
    description: typeof payload.description === 'string' ? payload.description : '',
    priority: typeof payload.priority === 'string' ? payload.priority : 'normal',
    laneId: typeof payload.laneId === 'string' ? payload.laneId : 'inbox',
    countdownEnabled: Boolean(payload.countdownEnabled),
    repeatFrequency,
    repeatGroupId,
    boardVisible,
    reminderEnabled: Boolean(payload.reminderEnabled),
    reminderTime: normalizeReminderTime(payload.reminderTime),
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: undefined,
    archivedAt: undefined,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    runInsertTodo(todo)
    appendChange('todo', todo.id, 'upsert', todo, deviceId)
  })

  sendJson(response, 200, { todo })
}

const updateTodo = async (request, response, id) => {
  const payload = await readJson(request)
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Todo not found.' })
    return
  }

  const timestamp = nowIso()
  const existingTodo = rowToTodo(existing)
  const nextDone = Object.hasOwn(payload, 'done') ? Boolean(payload.done) : existingTodo.done
  const repeatFrequency = Object.hasOwn(payload, 'repeatFrequency')
    ? normalizeRepeatFrequency(payload.repeatFrequency)
    : existingTodo.repeatFrequency
  const repeatGroupId =
    repeatFrequency === 'none'
      ? existingTodo.repeatGroupId
      : existingTodo.repeatGroupId || createId('repeat')
  const boardVisible = Object.hasOwn(payload, 'boardVisible')
    ? Boolean(payload.boardVisible)
    : existingTodo.repeatFrequency === 'none' && repeatFrequency !== 'none'
      ? false
      : existingTodo.boardVisible
  const todo = {
    ...existingTodo,
    description: typeof payload.description === 'string' ? payload.description : existingTodo.description,
    priority: typeof payload.priority === 'string' ? payload.priority : existingTodo.priority,
    laneId: typeof payload.laneId === 'string' ? payload.laneId : existingTodo.laneId,
    countdownEnabled: Object.hasOwn(payload, 'countdownEnabled') ? Boolean(payload.countdownEnabled) : existingTodo.countdownEnabled,
    repeatFrequency,
    repeatGroupId,
    boardVisible,
    reminderEnabled: Object.hasOwn(payload, 'reminderEnabled') ? Boolean(payload.reminderEnabled) : existingTodo.reminderEnabled,
    reminderTime: Object.hasOwn(payload, 'reminderTime') ? normalizeReminderTime(payload.reminderTime) : existingTodo.reminderTime,
    done: nextDone,
    completedAt: Object.hasOwn(payload, 'done') ? (nextDone ? timestamp : undefined) : existingTodo.completedAt,
    archivedAt: Object.hasOwn(payload, 'archived')
      ? payload.archived
        ? timestamp
        : undefined
      : existingTodo.archivedAt,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)
  const createdTodos = []

  transaction(() => {
    db.prepare(`
      UPDATE todos
      SET description = $description, priority = $priority, lane_id = $laneId, countdown_enabled = $countdownEnabled,
          repeat_frequency = $repeatFrequency, repeat_group_id = $repeatGroupId, board_visible = $boardVisible,
          reminder_enabled = $reminderEnabled, reminder_time = $reminderTime,
          done = $done, completed_at = $completedAt, archived_at = $archivedAt,
          updated_at = $updatedAt, sync_state = 'pending'
      WHERE id = $id
    `).run({
      $id: todo.id,
      $description: todo.description,
      $priority: todo.priority,
      $laneId: todo.laneId,
      $countdownEnabled: todo.countdownEnabled ? 1 : 0,
      $repeatFrequency: todo.repeatFrequency,
      $repeatGroupId: todo.repeatGroupId,
      $boardVisible: todo.boardVisible ? 1 : 0,
      $reminderEnabled: todo.reminderEnabled ? 1 : 0,
      $reminderTime: todo.reminderTime,
      $done: todo.done ? 1 : 0,
      $completedAt: todo.completedAt ?? null,
      $archivedAt: todo.archivedAt ?? null,
      $updatedAt: todo.updatedAt,
    })
    appendChange('todo', todo.id, 'upsert', todo, deviceId)

    if (!existingTodo.done && todo.done && todo.repeatFrequency !== 'none' && todo.repeatGroupId) {
      const nextDateKey = getNextDueRepeatDateKey(todo.dateKey, todo.repeatFrequency)
      const existingNext = nextDateKey
        ? db.prepare('SELECT id FROM todos WHERE repeat_group_id = ? AND date_key = ?').get(todo.repeatGroupId, nextDateKey)
        : null

      if (nextDateKey && !existingNext) {
        const nextTodo = createRecurringTodoInstance(todo, nextDateKey, timestamp)
        runInsertTodo(nextTodo)
        appendChange('todo', nextTodo.id, 'upsert', nextTodo, deviceId)
        createdTodos.push(nextTodo)
      }
    }
  })

  sendJson(response, 200, { todo, createdTodos })
}

const deleteTodo = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Todo not found.' })
    return
  }

  const todo = rowToTodo(existing)
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id)
    appendChange('todo', todo.id, 'delete', todo, deviceId)
  })

  sendJson(response, 200, { ok: true })
}

const addBoardLane = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const lane = {
    id: createId('lane'),
    label: payload.label,
    colorId: payload.colorId ?? 'blue',
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO board_lanes (id, label, color_id, created_at, updated_at, sync_state)
      VALUES ($id, $label, $colorId, $createdAt, $updatedAt, $syncState)
    `).run({
      $id: lane.id,
      $label: lane.label,
      $colorId: lane.colorId,
      $createdAt: lane.createdAt,
      $updatedAt: lane.updatedAt,
      $syncState: lane.syncState,
    })
    appendChange('boardLane', lane.id, 'upsert', lane, deviceId)
  })

  sendJson(response, 200, { lane })
}

const deleteBoardLane = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM board_lanes WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Board lane not found.' })
    return
  }

  const lane = rowToBoardLane(existing)
  const deviceId = getDeviceId(request)
  const timestamp = nowIso()
  const movedTodos = db
    .prepare('SELECT * FROM todos WHERE lane_id = ?')
    .all(id)
    .map((row) => ({
      ...rowToTodo(row),
      laneId: 'inbox',
      updatedAt: timestamp,
      syncState: 'pending',
    }))

  transaction(() => {
    db.prepare(`UPDATE todos SET lane_id = 'inbox', updated_at = ?, sync_state = 'pending' WHERE lane_id = ?`).run(timestamp, id)
    db.prepare('DELETE FROM board_lanes WHERE id = ?').run(id)
    for (const todo of movedTodos) {
      appendChange('todo', todo.id, 'upsert', todo, deviceId)
    }
    appendChange('boardLane', lane.id, 'delete', lane, deviceId)
  })

  sendJson(response, 200, { ok: true, movedTodos })
}

const deleteAttachment = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Attachment not found.' })
    return
  }

  const attachment = rowToAttachment(existing)
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    appendChange(
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
    )
  })

  sendJson(response, 200, { ok: true })
}

const upsertWeeklySummary = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const existing = db.prepare('SELECT * FROM weekly_summaries WHERE week_key = ?').get(payload.weekKey)
  const summary = {
    weekKey: payload.weekKey,
    content: payload.content,
    model: payload.model,
    provider: payload.provider ?? 'openai-compatible',
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
  }

  db.prepare(`
    INSERT INTO weekly_summaries (week_key, content, model, provider, created_at, updated_at)
    VALUES ($weekKey, $content, $model, $provider, $createdAt, $updatedAt)
    ON CONFLICT(week_key) DO UPDATE SET
      content = excluded.content,
      model = excluded.model,
      provider = excluded.provider,
      updated_at = excluded.updated_at
  `).run({
    $weekKey: summary.weekKey,
    $content: summary.content,
    $model: summary.model,
    $provider: summary.provider,
    $createdAt: summary.createdAt,
    $updatedAt: summary.updatedAt,
  })

  sendJson(response, 200, { summary })
}

const upsertMetricDefinition = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const existing = payload.id ? db.prepare('SELECT * FROM metric_definitions WHERE id = ?').get(payload.id) : null
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const unit = typeof payload.unit === 'string' ? payload.unit.trim() : ''
  const color = typeof payload.color === 'string' ? payload.color.trim() : ''
  const targetValue =
    typeof payload.targetValue === 'number' && Number.isFinite(payload.targetValue) ? payload.targetValue : null

  if (!name) {
    sendJson(response, 400, { error: '指标名称不能为空。' })
    return
  }

  if (!/^#([0-9a-fA-F]{6})$/.test(color)) {
    sendJson(response, 400, { error: '请使用合法的颜色值。' })
    return
  }

  const metricDefinition = {
    id: existing?.id ?? createId('metric'),
    name,
    unit,
    color,
    targetValue: targetValue ?? undefined,
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO metric_definitions (
        id, name, unit, color, target_value, created_at, updated_at, sync_state
      )
      VALUES (
        $id, $name, $unit, $color, $targetValue, $createdAt, $updatedAt, $syncState
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        unit = excluded.unit,
        color = excluded.color,
        target_value = excluded.target_value,
        updated_at = excluded.updated_at,
        sync_state = excluded.sync_state
    `).run({
      $id: metricDefinition.id,
      $name: metricDefinition.name,
      $unit: metricDefinition.unit,
      $color: metricDefinition.color,
      $targetValue: metricDefinition.targetValue ?? null,
      $createdAt: metricDefinition.createdAt,
      $updatedAt: metricDefinition.updatedAt,
      $syncState: metricDefinition.syncState,
    })
    appendChange('metricDefinition', metricDefinition.id, 'upsert', metricDefinition, deviceId)
  })

  sendJson(response, 200, { metricDefinition })
}

const upsertMetricRecord = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const metricId = typeof payload.metricId === 'string' ? payload.metricId.trim() : ''
  const dateKey = typeof payload.dateKey === 'string' ? payload.dateKey.trim() : ''
  const value = Number(payload.value)

  if (!metricId || !dateKey || !Number.isFinite(value)) {
    sendJson(response, 400, { error: '指标记录缺少有效的日期或数值。' })
    return
  }

  const definition = db.prepare('SELECT * FROM metric_definitions WHERE id = ?').get(metricId)

  if (!definition) {
    sendJson(response, 404, { error: '指标不存在。' })
    return
  }

  const existing = db.prepare('SELECT * FROM metric_records WHERE metric_id = ? AND date_key = ?').get(metricId, dateKey)
  const metricRecord = {
    id: existing?.id ?? createId('metric_record'),
    metricId,
    dateKey,
    value,
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO metric_records (
        id, metric_id, date_key, value, created_at, updated_at, sync_state
      )
      VALUES (
        $id, $metricId, $dateKey, $value, $createdAt, $updatedAt, $syncState
      )
      ON CONFLICT(metric_id, date_key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        sync_state = excluded.sync_state
    `).run({
      $id: metricRecord.id,
      $metricId: metricRecord.metricId,
      $dateKey: metricRecord.dateKey,
      $value: metricRecord.value,
      $createdAt: metricRecord.createdAt,
      $updatedAt: metricRecord.updatedAt,
      $syncState: metricRecord.syncState,
    })
    appendChange('metricRecord', metricRecord.id, 'upsert', metricRecord, deviceId)
  })

  sendJson(response, 200, { metricRecord })
}

const deleteMetricDefinition = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM metric_definitions WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: '指标不存在。' })
    return
  }

  const metricDefinition = rowToMetricDefinition(existing)
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare('DELETE FROM metric_definitions WHERE id = ?').run(id)
    appendChange('metricDefinition', metricDefinition.id, 'delete', metricDefinition, deviceId)
  })

  sendJson(response, 200, { ok: true })
}

const route = async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  if (!hasValidApiToken(request)) {
    sendJson(response, 401, { error: '本地 API 鉴权失败。请从心象仪应用内访问。' })
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
  const pathname = url.pathname

  if (request.method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, { ok: true, meta: getMeta() })
    return
  }

  if (request.method === 'GET' && pathname === '/api/state') {
    sendJson(response, 200, getState())
    return
  }

  if (request.method === 'GET' && pathname === '/api/entries') {
    sendJson(response, 200, getEntriesPage(url))
    return
  }

  if (request.method === 'GET' && pathname === '/api/todos') {
    sendJson(response, 200, getTodosPage(url))
    return
  }

  if (request.method === 'GET' && pathname === '/api/attachments') {
    sendJson(response, 200, getAttachmentsPage(url))
    return
  }

  const attachmentContentMatch = pathname.match(/^\/api\/attachments\/([^/]+)\/content$/)
  if (attachmentContentMatch && request.method === 'GET') {
    sendAttachmentContent(response, decodeURIComponent(attachmentContentMatch[1]))
    return
  }

  if (request.method === 'POST' && pathname === '/api/ai/weekly-summary') {
    await requestWeeklySummary(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/webdav/push') {
    await pushWebDavSnapshot(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/webdav/replace') {
    await replaceWebDavSnapshot(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/webdav/pull') {
    await pullWebDavSnapshot(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/sync-bundle/export') {
    await exportSyncBundle(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/webdav/test') {
    await testWebDavConnection(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/entries/upsert') {
    await upsertEntry(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/entries/batch-delete') {
    await deleteEntriesBatch(request, response)
    return
  }

  const entryMatch = pathname.match(/^\/api\/entries\/([^/]+)$/)
  if (entryMatch && request.method === 'DELETE') {
    await deleteEntry(request, response, decodeURIComponent(entryMatch[1]))
    return
  }

  if (request.method === 'POST' && pathname === '/api/todos') {
    await addTodo(request, response)
    return
  }

  const todoMatch = pathname.match(/^\/api\/todos\/([^/]+)$/)
  if (todoMatch && request.method === 'PATCH') {
    await updateTodo(request, response, decodeURIComponent(todoMatch[1]))
    return
  }

  if (todoMatch && request.method === 'DELETE') {
    await deleteTodo(request, response, decodeURIComponent(todoMatch[1]))
    return
  }

  if (request.method === 'POST' && pathname === '/api/board-lanes') {
    await addBoardLane(request, response)
    return
  }

  const boardLaneMatch = pathname.match(/^\/api\/board-lanes\/([^/]+)$/)
  if (boardLaneMatch && request.method === 'DELETE') {
    await deleteBoardLane(request, response, decodeURIComponent(boardLaneMatch[1]))
    return
  }

  const attachmentMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/)
  if (attachmentMatch && request.method === 'DELETE') {
    await deleteAttachment(request, response, decodeURIComponent(attachmentMatch[1]))
    return
  }

  if (request.method === 'POST' && pathname === '/api/summaries/upsert') {
    await upsertWeeklySummary(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/metrics/definitions/upsert') {
    await upsertMetricDefinition(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/metrics/records/upsert') {
    await upsertMetricRecord(request, response)
    return
  }

  const metricDefinitionMatch = pathname.match(/^\/api\/metrics\/definitions\/([^/]+)$/)
  if (metricDefinitionMatch && request.method === 'DELETE') {
    await deleteMetricDefinition(request, response, decodeURIComponent(metricDefinitionMatch[1]))
    return
  }

  notFound(response)
}

const server = createServer((request, response) => {
  applyCorsHeaders(request, response)
  route(request, response).catch((error) => {
    console.error(error)
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Local API failed.' })
  })
})

server.listen(port, host, () => {
  console.log(`Xinxiangyi SQLite API listening on http://${host}:${port}`)
  console.log(`Database: ${databasePath}`)
})

const shutdown = () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
