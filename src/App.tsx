import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  Database,
  ImagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
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
  upsertWeeklySummary,
  upsertJournalEntry,
  type AttachmentRecord,
  type ChangeLogRecord,
  type JournalEntry,
  type TodoItem,
  type WeeklySummary,
} from './lib/db'
import type { MoodSignals } from './lib/mood'

type ActiveView = 'dashboard' | 'journal' | 'summary' | 'overview'

type DraftState = {
  title: string
  body: string
  moodText: string
  tags: string
}

type AiConfig = {
  endpoint: string
  apiKey: string
  model: string
}

type WebDavConfig = {
  url: string
  username: string
  password: string
  remotePath: string
}

type CalendarCell = {
  dateKey: string
  inMonth: boolean
  entry?: JournalEntry
  todos: TodoItem[]
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

const defaultAiConfig: AiConfig = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
}

const defaultWebDavConfig: WebDavConfig = {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  remotePath: '/xinxiangyi',
}

const aiConfigStorageKey = 'xinxiangyi-ai-config-v1'
const webDavConfigStorageKey = 'xinxiangyi-webdav-config-v1'

const getTodayKey = () => {
  const today = new Date()
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const toDateKey = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const addDays = (dateKey: string, amount: number) => {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + amount)

  return toDateKey(date)
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

const getWeekDays = (weekKey: string) => Array.from({ length: 7 }, (_, index) => addDays(weekKey, index))

const getMonthDays = (monthKey: string) => {
  const first = new Date(`${monthKey}-01T00:00:00`)
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()

  return Array.from({ length: days }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`)
}

const getCalendarDates = (monthKey: string) => {
  const first = new Date(`${monthKey}-01T00:00:00`)
  const mondayOffset = (first.getDay() + 6) % 7
  first.setDate(first.getDate() - mondayOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first)
    date.setDate(first.getDate() + index)

    return toDateKey(date)
  })
}

const shiftMonth = (monthKey: string, amount: number) => {
  const date = new Date(`${monthKey}-01T00:00:00`)
  date.setMonth(date.getMonth() + amount)

  return toDateKey(date).slice(0, 7)
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

const getCheckinRate = (entries: JournalEntry[], monthKey: string) => {
  const todayKey = getTodayKey()
  const monthDays = getMonthDays(monthKey).filter((dateKey) => dateKey <= todayKey)

  if (monthDays.length === 0) return 0

  const entryDateKeys = new Set(entries.map((entry) => entry.dateKey))
  const checkedDays = monthDays.filter((dateKey) => entryDateKeys.has(dateKey)).length

  return Math.round((checkedDays / monthDays.length) * 100)
}

const getCurrentStreak = (entries: JournalEntry[]) => {
  const entryDateKeys = new Set(entries.map((entry) => entry.dateKey))
  let cursor = getTodayKey()
  let streak = 0

  while (entryDateKeys.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return streak
}

const getLongestStreak = (entries: JournalEntry[]) => {
  const sortedDateKeys = [...new Set(entries.map((entry) => entry.dateKey))].sort()
  let best = 0
  let current = 0
  let previous = ''

  for (const dateKey of sortedDateKeys) {
    current = previous && addDays(previous, 1) === dateKey ? current + 1 : 1
    best = Math.max(best, current)
    previous = dateKey
  }

  return best
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

const createCalendarCells = (monthKey: string, entries: JournalEntry[], todos: TodoItem[]): CalendarCell[] => {
  const entryMap = new Map(entries.map((entry) => [entry.dateKey, entry]))
  const todoMap = new Map<string, TodoItem[]>()

  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }

  return getCalendarDates(monthKey).map((dateKey) => ({
    dateKey,
    inMonth: dateKey.startsWith(monthKey),
    entry: entryMap.get(dateKey),
    todos: todoMap.get(dateKey) ?? [],
  }))
}

const getHeatLevel = (entry?: JournalEntry) => {
  if (!entry) return 'empty'
  if (entry.mood.score < 35) return 'low'
  if (entry.mood.score < 50) return 'stress'
  if (entry.mood.score < 66) return 'steady'
  if (entry.mood.score < 82) return 'good'

  return 'bright'
}

const buildWeeklyPrompt = (weekKey: string, entries: JournalEntry[], todos: TodoItem[]) => {
  const weekDays = getWeekDays(weekKey)
  const todoMap = new Map<string, TodoItem[]>()

  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }

  const entryMap = new Map(entries.map((entry) => [entry.dateKey, entry]))
  const lines = weekDays.map((dateKey) => {
    const entry = entryMap.get(dateKey)
    const dayTodos = todoMap.get(dateKey) ?? []
    const todoText = dayTodos.length
      ? dayTodos.map((todo) => `${todo.done ? '完成' : '未完成'}:${todo.title}`).join('；')
      : '无事项'

    if (!entry) {
      return `${dateKey}: 未打卡；事项：${todoText}`
    }

    return [
      `${dateKey}: ${entry.title}`,
      `心象分 ${entry.mood.score}，象限 ${entry.mood.quadrant ?? '未知'}`,
      `心情：${entry.moodText || '未填写'}`,
      `记录：${entry.body || '未填写'}`,
      `事项：${todoText}`,
      `标签：${entry.tags.join(' ') || '无'}`,
    ].join('\n')
  })

  return `请用中文为这一周做一份温和、具体、可执行的复盘。不要做医学诊断，不要夸大结论。

输出结构：
1. 本周心象：2-3 句概括情绪走势和打卡情况。
2. 有迹可循的进步：列出 2-3 个真实进步信号。
3. 需要照看的模式：指出 1-2 个可能反复出现的压力或低能量模式。
4. 下周一个小动作：给出一个足够小、可执行、可验证的建议。

本周从 ${weekKey} 开始，原始记录如下：

${lines.join('\n\n')}`
}

const readAiConfig = (): AiConfig => {
  const raw = window.localStorage.getItem(aiConfigStorageKey)

  if (!raw) return defaultAiConfig

  try {
    return { ...defaultAiConfig, ...JSON.parse(raw) }
  } catch {
    return defaultAiConfig
  }
}

const readWebDavConfig = (): WebDavConfig => {
  const raw = window.localStorage.getItem(webDavConfigStorageKey)

  if (!raw) return defaultWebDavConfig

  try {
    return { ...defaultWebDavConfig, ...JSON.parse(raw) }
  } catch {
    return defaultWebDavConfig
  }
}

const extractAiContent = (payload: unknown) => {
  const chatPayload = payload as {
    choices?: Array<{ message?: { content?: string } }>
    output_text?: string
    error?: { message?: string }
  }

  if (chatPayload.error?.message) {
    throw new Error(chatPayload.error.message)
  }

  return chatPayload.choices?.[0]?.message?.content ?? chatPayload.output_text ?? ''
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
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [changes, setChanges] = useState<ChangeLogRecord[]>([])
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([])
  const [selectedDate, setSelectedDate] = useState(getTodayKey)
  const [visibleMonth, setVisibleMonth] = useState(getTodayKey().slice(0, 7))
  const [selectedWeek, setSelectedWeek] = useState(getWeekKey(getTodayKey()))
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [todoTitle, setTodoTitle] = useState('')
  const [aiConfig, setAiConfig] = useState<AiConfig>(defaultAiConfig)
  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>(defaultWebDavConfig)
  const [journalSearch, setJournalSearch] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const reload = async () => {
    const [nextEntries, nextTodos, nextAttachments, nextChanges, nextWeeklySummaries] = await Promise.all([
      db.entries.orderBy('dateKey').reverse().toArray(),
      db.todos.orderBy('createdAt').reverse().toArray(),
      db.attachments.orderBy('createdAt').reverse().toArray(),
      db.changes.orderBy('changedAt').reverse().toArray(),
      db.weeklySummaries.orderBy('updatedAt').reverse().toArray(),
    ])

    setEntries(nextEntries)
    setTodos(nextTodos)
    setAttachments(nextAttachments)
    setChanges(nextChanges)
    setWeeklySummaries(nextWeeklySummaries)
  }

  useEffect(() => {
    setAiConfig(readAiConfig())
    setWebDavConfig(readWebDavConfig())
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
  const calendarCells = useMemo(() => createCalendarCells(visibleMonth, entries, todos), [entries, todos, visibleMonth])
  const selectedWeekDays = useMemo(() => getWeekDays(selectedWeek), [selectedWeek])
  const selectedWeekEntries = useMemo(
    () => entries.filter((entry) => selectedWeekDays.includes(entry.dateKey)),
    [entries, selectedWeekDays],
  )
  const selectedWeekTodos = useMemo(
    () => todos.filter((todo) => selectedWeekDays.includes(todo.dateKey)),
    [selectedWeekDays, todos],
  )
  const selectedWeekSummary = useMemo(
    () => weeklySummaries.find((summary) => summary.weekKey === selectedWeek),
    [selectedWeek, weeklySummaries],
  )
  const filteredEntries = useMemo(() => {
    const keyword = journalSearch.trim().toLowerCase()

    if (!keyword) return entries

    return entries.filter((entry) =>
      [entry.title, entry.body, entry.moodText, entry.tags.join(' '), entry.mood.quadrant]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [entries, journalSearch])
  const pendingChangeCount = changes.filter((change) => change.syncState === 'pending').length
  const completionRate = getCompletionRate(allEntryTodos)
  const monthEntries = entries.filter((entry) => entry.dateKey.startsWith(visibleMonth))
  const monthTodos = todos.filter((todo) => todo.dateKey.startsWith(visibleMonth))
  const monthScore = average(monthEntries.map((entry) => entry.mood.score))
  const monthCompletionRate = getCompletionRate(monthTodos)
  const monthCheckinRate = getCheckinRate(entries, visibleMonth)
  const currentStreak = getCurrentStreak(entries)
  const longestStreak = getLongestStreak(entries)
  const selectedWeekScore = average(selectedWeekEntries.map((entry) => entry.mood.score))
  const selectedWeekCompletionRate = getCompletionRate(selectedWeekTodos)
  const todayScore = selectedEntry?.mood.score ?? 50
  const canSave = Boolean(draft.body.trim() || draft.moodText.trim() || draft.title.trim() || pendingFiles.length > 0)
  const canGenerateSummary = Boolean(aiConfig.endpoint.trim() && aiConfig.apiKey.trim() && selectedWeekEntries.length > 0)

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

  const handleSelectCalendarDay = (dateKey: string) => {
    setSelectedDate(dateKey)
    setSelectedWeek(getWeekKey(dateKey))
    setActiveView('dashboard')
  }

  const handleAiConfigChange =
    (key: keyof AiConfig) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...aiConfig, [key]: event.target.value }
      setAiConfig(next)
      window.localStorage.setItem(aiConfigStorageKey, JSON.stringify(next))
    }

  const handleWebDavConfigChange =
    (key: keyof WebDavConfig) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...webDavConfig, [key]: event.target.value }
      setWebDavConfig(next)
      window.localStorage.setItem(webDavConfigStorageKey, JSON.stringify(next))
    }

  const handleGenerateSummary = async () => {
    if (!canGenerateSummary || isGeneratingSummary) return

    setIsGeneratingSummary(true)
    setSummaryError('')

    try {
      const response = await fetch(aiConfig.endpoint.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: aiConfig.model.trim(),
          messages: [
            {
              role: 'system',
              content: '你是一个克制、温和、具体的个人复盘助手。只根据用户给出的本地记录总结，不臆测。',
            },
            {
              role: 'user',
              content: buildWeeklyPrompt(selectedWeek, selectedWeekEntries, selectedWeekTodos),
            },
          ],
          temperature: 0.4,
        }),
      })
      const payload = await response.json()
      const content = extractAiContent(payload).trim()

      if (!response.ok) {
        throw new Error(content || `请求失败：${response.status}`)
      }

      if (!content) {
        throw new Error('模型没有返回可用内容。')
      }

      const summary = await upsertWeeklySummary(selectedWeek, content, aiConfig.model.trim())
      setSummaryDraft(summary.content)
      await reload()
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : '生成周总结失败。')
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const handleSaveSummaryDraft = async () => {
    const content = summaryDraft.trim()
    if (!content) return

    await upsertWeeklySummary(selectedWeek, content, 'manual', 'local')
    await reload()
  }

  useEffect(() => {
    setSummaryDraft(selectedWeekSummary?.content ?? '')
  }, [selectedWeekSummary])

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

      <nav className="view-tabs" aria-label="视图切换">
        <button
          className={activeView === 'dashboard' ? 'active' : ''}
          type="button"
          onClick={() => setActiveView('dashboard')}
        >
          <BarChart3 size={18} aria-hidden="true" />
          Dashboard
        </button>
        <button
          className={activeView === 'journal' ? 'active' : ''}
          type="button"
          onClick={() => setActiveView('journal')}
        >
          <BookOpen size={18} aria-hidden="true" />
          日记浏览
        </button>
        <button
          className={activeView === 'summary' ? 'active' : ''}
          type="button"
          onClick={() => setActiveView('summary')}
        >
          <TrendingUp size={18} aria-hidden="true" />
          总结
        </button>
        <button
          className={activeView === 'overview' ? 'active' : ''}
          type="button"
          onClick={() => setActiveView('overview')}
        >
          <Database size={18} aria-hidden="true" />
          总览
        </button>
      </nav>

      {activeView === 'dashboard' ? (
        <>
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
        </>
      ) : activeView === 'journal' ? (
        <section className="journal-browser" aria-labelledby="journal-browser-title">
          <div className="summary-head">
            <div>
              <p className="eyebrow">Journal Browser</p>
              <h2 id="journal-browser-title">日记浏览</h2>
            </div>
            <label className="search-box">
              <Search size={18} aria-hidden="true" />
              <input
                value={journalSearch}
                onChange={(event) => setJournalSearch(event.target.value)}
                placeholder="搜索标题、正文、心情、标签"
              />
            </label>
          </div>

          <div className="summary-metrics">
            <Metric label="日记总数" value={`${entries.length}`} />
            <Metric label="搜索结果" value={`${filteredEntries.length}`} />
            <Metric label="最近心象" value={`${latestEntry?.mood.score ?? 0}`} />
            <Metric label="连续打卡" value={`${currentStreak} 天`} />
            <Metric label="待同步" value={`${pendingChangeCount}`} />
          </div>

          <div className="journal-list">
            {filteredEntries.map((entry) => {
              const entryTodos = todos.filter((todo) => todo.dateKey === entry.dateKey)
              const entryAttachments = attachments.filter((attachment) => attachment.entryId === entry.id)

              return (
                <button
                  className="journal-card"
                  type="button"
                  key={entry.id}
                  onClick={() => {
                    setSelectedDate(entry.dateKey)
                    setActiveView('dashboard')
                  }}
                >
                  <div className="journal-card-head">
                    <span>{entry.dateKey}</span>
                    <strong className={`score-${entry.mood.level}`}>{entry.mood.score}</strong>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.moodText || entry.body || '没有正文'}</p>
                  <div className="journal-meta">
                    <span>{entry.mood.quadrant}</span>
                    <span>{entryTodos.filter((todo) => todo.done).length}/{entryTodos.length} 事项</span>
                    <span>{entryAttachments.length} 图</span>
                    {entry.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          {filteredEntries.length === 0 && <p className="empty-state">还没有匹配的日记。</p>}
        </section>
      ) : activeView === 'summary' ? (
        <section className="summary-shell" aria-labelledby="summary-title">
          <div className="summary-head">
            <div>
              <p className="eyebrow">Traceable Progress</p>
              <h2 id="summary-title">总结</h2>
            </div>
            <div className="month-switcher" aria-label="月份切换">
              <button className="icon-button quiet" type="button" aria-label="上个月" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <strong>{formatMonthLabel(visibleMonth)}</strong>
              <button className="icon-button quiet" type="button" aria-label="下个月" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="summary-metrics">
            <Metric label="本月心象均值" value={`${monthScore || 0}`} />
            <Metric label="本月打卡率" value={`${monthCheckinRate}%`} />
            <Metric label="本月完成率" value={`${monthCompletionRate}%`} />
            <Metric label="连续打卡" value={`${currentStreak} 天`} />
            <Metric label="最长连续" value={`${longestStreak} 天`} />
          </div>

          <div className="summary-grid">
            <section className="panel calendar-panel" aria-labelledby="calendar-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Calendar Heatmap</p>
                  <h2 id="calendar-title">心情日历</h2>
                </div>
                <span className="count-badge">{monthEntries.length} 次打卡</span>
              </div>

              <div className="calendar-weekdays" aria-hidden="true">
                {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarCells.map((cell) => {
                  const dayNumber = Number(cell.dateKey.slice(-2))
                  const completion = getCompletionRate(cell.todos)

                  return (
                    <button
                      className={`calendar-day heat-${getHeatLevel(cell.entry)} ${cell.inMonth ? '' : 'outside'} ${cell.dateKey === selectedDate ? 'selected' : ''}`}
                      type="button"
                      key={cell.dateKey}
                      onClick={() => handleSelectCalendarDay(cell.dateKey)}
                      aria-label={`${cell.dateKey}，${cell.entry ? `心象分 ${cell.entry.mood.score}` : '未打卡'}，完成率 ${completion}%`}
                    >
                      <span>{dayNumber}</span>
                      {cell.entry && <strong>{cell.entry.mood.score}</strong>}
                      {cell.todos.length > 0 && <small>{cell.todos.filter((todo) => todo.done).length}/{cell.todos.length}</small>}
                    </button>
                  )
                })}
              </div>
              <div className="heat-legend" aria-label="热力图图例">
                <span>未打卡</span>
                <i className="heat-empty" />
                <i className="heat-low" />
                <i className="heat-stress" />
                <i className="heat-steady" />
                <i className="heat-good" />
                <i className="heat-bright" />
                <span>高亮</span>
              </div>
            </section>

            <section className="panel week-panel" aria-labelledby="week-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Weekly Review</p>
                  <h2 id="week-title">一周回顾</h2>
                </div>
                <label className="week-picker">
                  <CalendarDays size={16} aria-hidden="true" />
                  <input type="date" value={selectedWeek} onChange={(event) => setSelectedWeek(getWeekKey(event.target.value))} />
                </label>
              </div>

              <div className="week-metrics">
                <Metric label="本周心象" value={`${selectedWeekScore || 0}`} />
                <Metric label="本周打卡" value={`${selectedWeekEntries.length}/7`} />
                <Metric label="事项完成" value={`${selectedWeekCompletionRate}%`} />
              </div>

              <div className="week-days">
                {selectedWeekDays.map((dateKey) => {
                  const entry = entries.find((item) => item.dateKey === dateKey)
                  const dayItems = todos.filter((todo) => todo.dateKey === dateKey)

                  return (
                    <button className="week-day-card" type="button" key={dateKey} onClick={() => handleSelectCalendarDay(dateKey)}>
                      <span>{dateKey.slice(5)}</span>
                      <strong>{entry?.mood.score ?? '-'}</strong>
                      <small>{entry?.mood.quadrant ?? '未打卡'}</small>
                      <em>{dayItems.length ? `${dayItems.filter((todo) => todo.done).length}/${dayItems.length}` : '无事项'}</em>
                    </button>
                  )
                })}
              </div>

              <div className="ai-config">
                <div className="config-head">
                  <Settings2 size={17} aria-hidden="true" />
                  <strong>大模型 API</strong>
                </div>
                <label>
                  <span>Endpoint</span>
                  <input value={aiConfig.endpoint} onChange={handleAiConfigChange('endpoint')} placeholder="https://api.openai.com/v1/chat/completions" />
                </label>
                <label>
                  <span>Model</span>
                  <input value={aiConfig.model} onChange={handleAiConfigChange('model')} placeholder="gpt-4o-mini" />
                </label>
                <label>
                  <span>API Key</span>
                  <input value={aiConfig.apiKey} onChange={handleAiConfigChange('apiKey')} placeholder="只保存在本机浏览器" type="password" />
                </label>
              </div>

              <div className="summary-actions">
                <button className="primary-button" type="button" disabled={!canGenerateSummary || isGeneratingSummary} onClick={() => void handleGenerateSummary()}>
                  {isGeneratingSummary ? <RefreshCw size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                  {isGeneratingSummary ? '生成中' : '生成周总结'}
                </button>
                <button className="file-button plain" type="button" disabled={!summaryDraft.trim()} onClick={() => void handleSaveSummaryDraft()}>
                  <Save size={18} aria-hidden="true" />
                  保存总结
                </button>
              </div>

              {summaryError && <p className="error-state">{summaryError}</p>}

              <label className="summary-editor">
                <span>周总结</span>
                <textarea
                  value={summaryDraft}
                  onChange={(event) => setSummaryDraft(event.target.value)}
                  placeholder={selectedWeekEntries.length ? '生成后可继续手动修改。' : '本周还没有打卡记录。'}
                  rows={10}
                />
              </label>
            </section>
          </div>
        </section>
      ) : (
        <section className="overview-shell" aria-labelledby="overview-title">
          <div className="summary-head">
            <div>
              <p className="eyebrow">Local First</p>
              <h2 id="overview-title">总览</h2>
            </div>
            <span className="count-badge">localhost + IndexedDB</span>
          </div>

          <div className="summary-metrics">
            <Metric label="数据库" value="xinxiangyi_local" />
            <Metric label="日记" value={`${entries.length}`} />
            <Metric label="事项" value={`${todos.length}`} />
            <Metric label="附件" value={`${attachments.length}`} />
            <Metric label="周总结" value={`${weeklySummaries.length}`} />
          </div>

          <div className="overview-grid">
            <section className="panel" aria-labelledby="database-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Database</p>
                  <h2 id="database-title">本地数据库</h2>
                </div>
                <Database size={22} aria-hidden="true" />
              </div>
              <div className="data-table">
                <span>entries</span>
                <strong>{entries.length}</strong>
                <span>todos</span>
                <strong>{todos.length}</strong>
                <span>attachments</span>
                <strong>{attachments.length}</strong>
                <span>changes</span>
                <strong>{changes.length}</strong>
                <span>pending changes</span>
                <strong>{pendingChangeCount}</strong>
                <span>weeklySummaries</span>
                <strong>{weeklySummaries.length}</strong>
              </div>
            </section>

            <section className="panel" aria-labelledby="webdav-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">WebDAV</p>
                  <h2 id="webdav-title">坚果云同步准备</h2>
                </div>
                <Cloud size={22} aria-hidden="true" />
              </div>
              <div className="ai-config">
                <label>
                  <span>Server URL</span>
                  <input value={webDavConfig.url} onChange={handleWebDavConfigChange('url')} placeholder="https://dav.jianguoyun.com/dav/" />
                </label>
                <label>
                  <span>Username</span>
                  <input value={webDavConfig.username} onChange={handleWebDavConfigChange('username')} placeholder="坚果云账号邮箱" />
                </label>
                <label>
                  <span>Password</span>
                  <input value={webDavConfig.password} onChange={handleWebDavConfigChange('password')} placeholder="坚果云应用密码" type="password" />
                </label>
                <label>
                  <span>Remote Path</span>
                  <input value={webDavConfig.remotePath} onChange={handleWebDavConfigChange('remotePath')} placeholder="/xinxiangyi" />
                </label>
              </div>
              <p className="sync-note">
                当前版本只保存同步配置和本地变更日志。下一步会把 `changes` 打包成 JSON 增量文件，并把图片附件按 `attachments/` 上传到 WebDAV。
              </p>
            </section>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
