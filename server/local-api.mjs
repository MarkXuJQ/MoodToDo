import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.XINXIANGYI_DATA_DIR
  ? resolve(process.env.XINXIANGYI_DATA_DIR)
  : resolve(projectRoot, 'data')
const databaseName = 'xinxiangyi.sqlite'
const databasePath = resolve(dataDir, databaseName)
const port = Number(process.env.XINXIANGYI_API_PORT ?? 8787)
const host = process.env.XINXIANGYI_API_HOST ?? '127.0.0.1'
const schemaVersion = 1

mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(databasePath)

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    date_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    mood_text TEXT NOT NULL,
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
    blob BLOB NOT NULL,
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

  CREATE INDEX IF NOT EXISTS idx_entries_date_key ON entries(date_key);
  CREATE INDEX IF NOT EXISTS idx_todos_date_key ON todos(date_key);
  CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
  CREATE INDEX IF NOT EXISTS idx_attachments_entry_id ON attachments(entry_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at);
  CREATE INDEX IF NOT EXISTS idx_changes_changed_at ON changes(changed_at);
  CREATE INDEX IF NOT EXISTS idx_changes_sync_state ON changes(sync_state);
`)

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
  done: Boolean(row.done),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at ?? undefined,
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
  dataBase64: Buffer.from(row.blob).toString('base64'),
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

const getMeta = () => ({
  driver: 'SQLite',
  databaseName,
  databasePath,
  apiBaseUrl: `http://${host}:${port}`,
  schemaVersion,
})

const appendChange = (entity, entityId, operation, payload, deviceId) => {
  db.prepare(`
    INSERT INTO changes (entity, entity_id, operation, changed_at, device_id, sync_state, payload_json)
    VALUES ($entity, $entityId, $operation, $changedAt, $deviceId, 'pending', $payloadJson)
  `).run({
    $entity: entity,
    $entityId: entityId,
    $operation: operation,
    $changedAt: nowIso(),
    $deviceId: deviceId,
    $payloadJson: JSON.stringify(payload),
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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Xinxiangyi-Device-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

const notFound = (response) => sendJson(response, 404, { error: 'API route not found.' })

const getState = () => ({
  entries: db.prepare('SELECT * FROM entries ORDER BY date_key DESC').all().map(rowToEntry),
  todos: db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all().map(rowToTodo),
  attachments: db.prepare('SELECT * FROM attachments ORDER BY created_at DESC').all().map(rowToAttachment),
  changes: db.prepare('SELECT * FROM changes ORDER BY changed_at DESC').all().map(rowToChange),
  weeklySummaries: db
    .prepare('SELECT * FROM weekly_summaries ORDER BY updated_at DESC')
    .all()
    .map(rowToWeeklySummary),
  meta: getMeta(),
})

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
    mood,
    tags: draft.tags,
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO entries (
        id, date_key, title, body, mood_text, mood_json, tags_json, created_at, updated_at, sync_state
      )
      VALUES (
        $id, $dateKey, $title, $body, $moodText, $moodJson, $tagsJson, $createdAt, $updatedAt, $syncState
      )
      ON CONFLICT(id) DO UPDATE SET
        date_key = excluded.date_key,
        title = excluded.title,
        body = excluded.body,
        mood_text = excluded.mood_text,
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

  sendJson(response, 200, { entry })
}

const addTodo = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const todo = {
    id: createId('todo'),
    dateKey: payload.dateKey,
    title: payload.title,
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO todos (id, date_key, title, done, created_at, updated_at, sync_state)
      VALUES ($id, $dateKey, $title, 0, $createdAt, $updatedAt, $syncState)
    `).run({
      $id: todo.id,
      $dateKey: todo.dateKey,
      $title: todo.title,
      $createdAt: todo.createdAt,
      $updatedAt: todo.updatedAt,
      $syncState: todo.syncState,
    })
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
  const todo = {
    ...rowToTodo(existing),
    done: Boolean(payload.done),
    completedAt: payload.done ? timestamp : undefined,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      UPDATE todos
      SET done = $done, completed_at = $completedAt, updated_at = $updatedAt, sync_state = 'pending'
      WHERE id = $id
    `).run({
      $id: todo.id,
      $done: todo.done ? 1 : 0,
      $completedAt: todo.completedAt ?? null,
      $updatedAt: todo.updatedAt,
    })
    appendChange('todo', todo.id, 'upsert', todo, deviceId)
  })

  sendJson(response, 200, { todo })
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

const route = async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
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

  if (request.method === 'POST' && pathname === '/api/entries/upsert') {
    await upsertEntry(request, response)
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

  const attachmentMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/)
  if (attachmentMatch && request.method === 'DELETE') {
    await deleteAttachment(request, response, decodeURIComponent(attachmentMatch[1]))
    return
  }

  if (request.method === 'POST' && pathname === '/api/summaries/upsert') {
    await upsertWeeklySummary(request, response)
    return
  }

  notFound(response)
}

const server = createServer((request, response) => {
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
