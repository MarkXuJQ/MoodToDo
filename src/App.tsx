import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Cloud,
  Database,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import './App.css'
import {
  addTodo,
  db,
  deleteAttachment,
  deleteTodo,
  setTodoDone,
  upsertJournalEntry,
  type AttachmentRecord,
  type ChangeLogRecord,
  type JournalEntry,
  type TodoItem,
} from './lib/db'
import type { MoodSignals } from './lib/mood'

type DraftState = {
  title: string
  body: string
  moodText: string
  tags: string
}

type MonthGroup = {
  monthKey: string
  entries: JournalEntry[]
  weeks: WeekGroup[]
  averageScore: number
  completionRate: number
}

type WeekGroup = {
  weekKey: string
  entries: JournalEntry[]
  averageScore: number
  completionRate: number
}

const emptyDraft: DraftState = {
  title: '',
  body: '',
  moodText: '',
  tags: '',
}

const getTodayKey = () => {
  const today = new Date()
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

const formatMonthLabel = (monthKey: string) => {
  const date = new Date(`${monthKey}-01T00:00:00`)

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

const getWeekKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const average = (values: number[]) => {
  if (values.length === 0) return 0

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

const parseTags = (value: string) =>
  value
    .split(/[,，\s]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)

const getCompletionRate = (items: TodoItem[]) => {
  if (items.length === 0) return 0

  return Math.round((items.filter((item) => item.done).length / items.length) * 100)
}

const getSignalValue = (signals: MoodSignals, key: keyof MoodSignals) => {
  const maxBySignal: Record<keyof MoodSignals, number> = {
    clarity: 35,
    load: 40,
    energy: 28,
    recovery: 28,
    reflection: 24,
  }

  return Math.round((signals[key] / maxBySignal[key]) * 100)
}

const createMonthGroups = (entries: JournalEntry[], todos: TodoItem[]) => {
  const todoMap = new Map<string, TodoItem[]>()
  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }

  const monthMap = new Map<string, JournalEntry[]>()
  for (const entry of entries) {
    const key = entry.dateKey.slice(0, 7)
    monthMap.set(key, [...(monthMap.get(key) ?? []), entry])
  }

  return [...monthMap.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([monthKey, monthEntries]): MonthGroup => {
      const weekMap = new Map<string, JournalEntry[]>()
      for (const entry of monthEntries) {
        const weekKey = getWeekKey(entry.dateKey)
        weekMap.set(weekKey, [...(weekMap.get(weekKey) ?? []), entry])
      }

      const weeks = [...weekMap.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([weekKey, weekEntries]): WeekGroup => {
          const weekTodos = weekEntries.flatMap((entry) => todoMap.get(entry.dateKey) ?? [])

          return {
            weekKey,
            entries: weekEntries.sort((left, right) => right.dateKey.localeCompare(left.dateKey)),
            averageScore: average(weekEntries.map((entry) => entry.mood.score)),
            completionRate: getCompletionRate(weekTodos),
          }
        })

      const monthTodos = monthEntries.flatMap((entry) => todoMap.get(entry.dateKey) ?? [])

      return {
        monthKey,
        entries: monthEntries.sort((left, right) => right.dateKey.localeCompare(left.dateKey)),
        weeks,
        averageScore: average(monthEntries.map((entry) => entry.mood.score)),
        completionRate: getCompletionRate(monthTodos),
      }
    })
}

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="metric">
    <span>{label}</span>
    <strong className={tone}>{value}</strong>
  </div>
)

const ProgressBar = ({ value, tone }: { value: number; tone?: string }) => (
  <span
    className={`progress-bar ${tone ?? ''}`}
    style={{ '--value': `${Math.min(100, Math.max(0, value))}%` } as CSSProperties}
  />
)

const AttachmentThumb = ({
  attachment,
  onDelete,
}: {
  attachment: AttachmentRecord
  onDelete: (attachment: AttachmentRecord) => void
}) => {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob)
    setUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [attachment.blob])

  return (
    <figure className="attachment">
      {attachment.type.startsWith('image/') ? (
        <img src={url} alt={attachment.name} />
      ) : (
        <div className="file-fallback">
          <ImagePlus size={20} aria-hidden="true" />
        </div>
      )}
      <figcaption>
        <span>{attachment.name}</span>
        <small>{formatBytes(attachment.size)}</small>
      </figcaption>
      <button
        className="icon-button quiet"
        type="button"
        aria-label={`删除 ${attachment.name}`}
        onClick={() => onDelete(attachment)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </figure>
  )
}

function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [changes, setChanges] = useState<ChangeLogRecord[]>([])
  const [selectedDate, setSelectedDate] = useState(getTodayKey)
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [todoTitle, setTodoTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const reload = async () => {
    const [nextEntries, nextTodos, nextAttachments, nextChanges] = await Promise.all([
      db.entries.orderBy('dateKey').reverse().toArray(),
      db.todos.orderBy('createdAt').reverse().toArray(),
      db.attachments.orderBy('createdAt').reverse().toArray(),
      db.changes.orderBy('changedAt').reverse().toArray(),
    ])

    setEntries(nextEntries)
    setTodos(nextTodos)
    setAttachments(nextAttachments)
    setChanges(nextChanges)
  }

  useEffect(() => {
    void reload()
  }, [])

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.dateKey === selectedDate),
    [entries, selectedDate],
  )

  useEffect(() => {
    if (selectedEntry) {
      setDraft({
        title: selectedEntry.title,
        body: selectedEntry.body,
        moodText: selectedEntry.moodText,
        tags: selectedEntry.tags.join(' '),
      })
      return
    }

    setDraft(emptyDraft)
  }, [selectedEntry])

  const dayTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.dateKey === selectedDate)
        .sort((left, right) => Number(left.done) - Number(right.done) || right.createdAt.localeCompare(left.createdAt)),
    [selectedDate, todos],
  )

  const selectedAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.entryId === selectedEntry?.id),
    [attachments, selectedEntry],
  )

  const latestEntry = entries[0]
  const monthGroups = useMemo(() => createMonthGroups(entries, todos), [entries, todos])
  const lastSevenEntries = entries.slice(0, 7)
  const allEntryTodos = todos.filter((todo) => entries.some((entry) => entry.dateKey === todo.dateKey))
  const pendingChangeCount = changes.filter((change) => change.syncState === 'pending').length
  const completionRate = getCompletionRate(allEntryTodos)
  const todayScore = selectedEntry?.mood.score ?? 50
  const canSave = Boolean(draft.body.trim() || draft.moodText.trim() || draft.title.trim() || pendingFiles.length > 0)

  const handleDraftChange =
    (key: keyof DraftState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((current) => ({ ...current, [key]: event.target.value }))
    }

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPendingFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave || isSaving) return

    setIsSaving(true)
    await upsertJournalEntry(
      {
        dateKey: selectedDate,
        title: draft.title.trim() || formatDateLabel(selectedDate),
        body: draft.body.trim(),
        moodText: draft.moodText.trim(),
        tags: parseTags(draft.tags),
      },
      pendingFiles,
    )
    setPendingFiles([])
    await reload()
    setIsSaving(false)
  }

  const handleAddTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = todoTitle.trim()
    if (!title) return

    await addTodo(selectedDate, title)
    setTodoTitle('')
    await reload()
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    await setTodoDone(todo, !todo.done)
    await reload()
  }

  const handleDeleteTodo = async (todo: TodoItem) => {
    await deleteTodo(todo)
    await reload()
  }

  const handleDeleteAttachment = async (attachment: AttachmentRecord) => {
    await deleteAttachment(attachment)
    await reload()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Xinxiangyi</p>
          <h1>心象仪</h1>
        </div>
        <div className="status-pills" aria-label="本地状态">
          <span>
            <Database size={16} aria-hidden="true" />
            IndexedDB
          </span>
          <span>
            <Cloud size={16} aria-hidden="true" />
            待同步 {pendingChangeCount}
          </span>
        </div>
      </header>

      <section className="day-strip" aria-label="日期选择">
        <label>
          <CalendarDays size={18} aria-hidden="true" />
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </label>
        <Metric label="心象分" value={`${todayScore}`} tone={`score-${selectedEntry?.mood.level ?? '平稳'}`} />
        <Metric label="今日完成" value={`${dayTodos.filter((todo) => todo.done).length}/${dayTodos.length}`} />
        <Metric label="图片" value={`${selectedAttachments.length + pendingFiles.length}`} />
      </section>

      <div className="workspace">
        <section className="panel journal-panel" aria-labelledby="journal-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">{formatDateLabel(selectedDate)}</p>
              <h2 id="journal-title">今日记录</h2>
            </div>
            <span className={`level-badge score-${selectedEntry?.mood.level ?? '平稳'}`}>
              {selectedEntry?.mood.level ?? '未记录'}
            </span>
          </div>

          <form className="journal-form" onSubmit={handleSave}>
            <label>
              <span>标题</span>
              <input value={draft.title} onChange={handleDraftChange('title')} placeholder="今天的主线" />
            </label>
            <label>
              <span>心情描述</span>
              <textarea
                value={draft.moodText}
                onChange={handleDraftChange('moodText')}
                placeholder="比如：上午焦虑但有推进，下午散步后恢复专注"
                rows={4}
              />
            </label>
            <label>
              <span>打卡日记</span>
              <textarea
                value={draft.body}
                onChange={handleDraftChange('body')}
                placeholder="完成了什么，卡在哪里，下一步是什么"
                rows={7}
              />
            </label>
            <label>
              <span>标签</span>
              <input value={draft.tags} onChange={handleDraftChange('tags')} placeholder="工作 健康 学习" />
            </label>

            <div className="form-actions">
              <label className="file-button">
                <ImagePlus size={18} aria-hidden="true" />
                图片
                <input accept="image/*" multiple type="file" onChange={handleFilesChange} />
              </label>
              <button className="primary-button" type="submit" disabled={!canSave || isSaving}>
                <Save size={18} aria-hidden="true" />
                {isSaving ? '保存中' : '保存'}
              </button>
            </div>
          </form>

          {(pendingFiles.length > 0 || selectedAttachments.length > 0) && (
            <div className="attachment-grid" aria-label="图片附件">
              {pendingFiles.map((file) => (
                <div className="pending-file" key={`${file.name}-${file.size}`}>
                  <ImagePlus size={18} aria-hidden="true" />
                  <span>{file.name}</span>
                  <small>{formatBytes(file.size)}</small>
                </div>
              ))}
              {selectedAttachments.map((attachment) => (
                <AttachmentThumb
                  attachment={attachment}
                  key={attachment.id}
                  onDelete={handleDeleteAttachment}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel todo-panel" aria-labelledby="todo-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Todo</p>
              <h2 id="todo-title">今日事项</h2>
            </div>
            <span className="count-badge">{getCompletionRate(dayTodos)}%</span>
          </div>

          <form className="todo-form" onSubmit={handleAddTodo}>
            <input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="新增一个事项" />
            <button className="icon-button solid" type="submit" aria-label="新增事项">
              <Plus size={20} aria-hidden="true" />
            </button>
          </form>

          <ul className="todo-list">
            {dayTodos.map((todo) => (
              <li className={todo.done ? 'done' : ''} key={todo.id}>
                <button
                  className="icon-button quiet"
                  type="button"
                  aria-label={todo.done ? '标记未完成' : '标记完成'}
                  onClick={() => void handleToggleTodo(todo)}
                >
                  {todo.done ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                </button>
                <span>{todo.title}</span>
                <button
                  className="icon-button quiet"
                  type="button"
                  aria-label={`删除 ${todo.title}`}
                  onClick={() => void handleDeleteTodo(todo)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          {dayTodos.length === 0 && <p className="empty-state">今天还没有事项。</p>}
        </section>

        <section className="panel stats-panel" aria-labelledby="stats-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Mood Space</p>
              <h2 id="stats-title">心象分</h2>
            </div>
            <TrendingUp size={22} aria-hidden="true" />
          </div>

          <div className="metric-grid">
            <Metric label="最近 7 次均值" value={`${average(lastSevenEntries.map((entry) => entry.mood.score)) || 0}`} />
            <Metric label="总完成率" value={`${completionRate}%`} />
            <Metric label="记录天数" value={`${entries.length}`} />
          </div>

          {latestEntry ? (
            <div className="signal-stack">
              <div className="score-ring" aria-label={`最近心象分 ${latestEntry.mood.score}`}>
                <strong>{latestEntry.mood.score}</strong>
                <span>{latestEntry.mood.level}</span>
              </div>
              <div className="signal-column">
                <div className="mood-space">
                  <span>象限</span>
                  <strong>{latestEntry.mood.quadrant}</strong>
                </div>
                <div className="signals">
                  <span>晴朗度</span>
                  <ProgressBar value={getSignalValue(latestEntry.mood.signals, 'clarity')} tone="clarity" />
                  <span>负荷度</span>
                  <ProgressBar value={getSignalValue(latestEntry.mood.signals, 'load')} tone="load" />
                  <span>能量感</span>
                  <ProgressBar value={getSignalValue(latestEntry.mood.signals, 'energy')} tone="energy" />
                  <span>修复感</span>
                  <ProgressBar value={getSignalValue(latestEntry.mood.signals, 'recovery')} tone="recovery" />
                  <span>反思度</span>
                  <ProgressBar value={getSignalValue(latestEntry.mood.signals, 'reflection')} tone="reflection" />
                </div>
              </div>
              <p className="review-hint">{latestEntry.mood.reviewHint}</p>
            </div>
          ) : (
            <p className="empty-state">保存第一条日记后生成心象分。</p>
          )}
        </section>
      </div>

      <section className="history-band" aria-labelledby="history-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Hierarchy</p>
            <h2 id="history-title">层级记录</h2>
          </div>
          <span className="count-badge">{monthGroups.length} 个月</span>
        </div>

        <div className="month-stack">
          {monthGroups.map((month, monthIndex) => (
            <details className="month-group" key={month.monthKey} open={monthIndex === 0}>
              <summary>
                <span>{formatMonthLabel(month.monthKey)}</span>
                <span>心象 {month.averageScore}</span>
                <span>{month.completionRate}%</span>
              </summary>
              <div className="week-stack">
                {month.weeks.map((week) => (
                  <div className="week-group" key={week.weekKey}>
                    <div className="week-head">
                      <strong>{formatDateLabel(week.weekKey)} 周</strong>
                      <span>心象 {week.averageScore}</span>
                      <span>
                        <Check size={14} aria-hidden="true" />
                        {week.completionRate}%
                      </span>
                    </div>
                    <div className="entry-strip">
                      {week.entries.map((entry) => (
                        <button
                          className="entry-chip"
                          type="button"
                          key={entry.id}
                          onClick={() => setSelectedDate(entry.dateKey)}
                        >
                          <span>{entry.dateKey.slice(5)}</span>
                          <strong>{entry.mood.score}</strong>
                          <small>{entry.title}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>

        {monthGroups.length === 0 && <p className="empty-state">还没有层级记录。</p>}
      </section>
    </main>
  )
}

export default App
