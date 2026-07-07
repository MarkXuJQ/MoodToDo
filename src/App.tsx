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
  Menu,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import './App.css'
import {
  addTodo,
  deleteAttachment,
  deleteTodo,
  getLocalState,
  localDatabaseDriver,
  localDatabaseName,
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
import {
  createGameEngineSnapshot,
  defaultGameEngineSettings,
  type GameEngineSettings,
} from './lib/gameEngine'
import DynamicBackground from './components/ui/dynamic-background'

type ActiveView = 'dashboard' | 'journal' | 'summary' | 'settings'

type JournalMode = 'entries' | 'board'

type SettingsSection = 'overview' | 'cards' | 'database' | 'ai' | 'webdav' | 'engine'

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

type DatabaseStatus = {
  origin: string
  driver: string
  databaseName: string
  databasePath: string
  apiBaseUrl: string
  schemaVersion: number
  lastLoadedAt: string
}

type DashboardCardId = 'streak' | 'monthCheckin' | 'todoCompletion' | 'latestMood' | 'pendingSync' | 'attachments'

type DashboardCardConfig = {
  id: DashboardCardId
  enabled: boolean
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
const gameEngineSettingsStorageKey = 'xinxiangyi-game-engine-settings-v1'
const dashboardCardsStorageKey = 'xinxiangyi-dashboard-cards-v1'

const defaultDashboardCards: DashboardCardConfig[] = [
  { id: 'latestMood', enabled: true },
  { id: 'streak', enabled: true },
  { id: 'todoCompletion', enabled: true },
  { id: 'monthCheckin', enabled: true },
  { id: 'pendingSync', enabled: true },
  { id: 'attachments', enabled: false },
]

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

const readGameEngineSettings = (): GameEngineSettings => {
  const raw = window.localStorage.getItem(gameEngineSettingsStorageKey)

  if (!raw) return defaultGameEngineSettings

  try {
    const parsed = JSON.parse(raw) as Partial<GameEngineSettings>
    const snapshotDays = Number(parsed.snapshotDays)

    return {
      ...defaultGameEngineSettings,
      snapshotDays: Number.isFinite(snapshotDays)
        ? Math.min(365, Math.max(7, Math.round(snapshotDays)))
        : defaultGameEngineSettings.snapshotDays,
    }
  } catch {
    return defaultGameEngineSettings
  }
}

const readDashboardCards = (): DashboardCardConfig[] => {
  const raw = window.localStorage.getItem(dashboardCardsStorageKey)

  if (!raw) return defaultDashboardCards

  try {
    const parsed = JSON.parse(raw) as DashboardCardConfig[]
    const byId = new Map(parsed.map((item) => [item.id, item.enabled]))

    return defaultDashboardCards.map((item) => ({
      ...item,
      enabled: byId.get(item.id) ?? item.enabled,
    }))
  } catch {
    return defaultDashboardCards
  }
}

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const navigationItems: Array<{ id: ActiveView; label: string; note: string }> = [
  { id: 'dashboard', label: '今日台', note: '记录、Todo 与心象分' },
  { id: 'journal', label: '日记浏览', note: '历史记录与 Todo 看板' },
  { id: 'summary', label: '总结', note: '热力图、周回顾与 AI 总结' },
  { id: 'settings', label: '设置', note: '系统总览、同步与接口配置' },
]

const journalModes: Array<{ id: JournalMode; label: string }> = [
  { id: 'entries', label: '记录' },
  { id: 'board', label: 'Todo 看板' },
]

const settingsSections: Array<{ id: SettingsSection; label: string; note: string }> = [
  { id: 'overview', label: '系统总览', note: '数据规模与引擎快照' },
  { id: 'cards', label: '统计卡片', note: '决定今日台展示哪些指标' },
  { id: 'database', label: '本地数据库', note: 'SQLite 与持久化状态' },
  { id: 'ai', label: '大模型 API', note: '周总结代理与模型配置' },
  { id: 'webdav', label: 'WebDAV', note: '坚果云同步预留' },
  { id: 'engine', label: '游戏接口', note: '外部引擎消费快照' },
]

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="metric-line">
    <span className="metric-label">{label}</span>
    <strong className={`metric-value ${tone ?? ''}`}>{value}</strong>
  </div>
)

const ProgressBar = ({ value, tone }: { value: number; tone?: string }) => (
  <span className="progress-track">
    <span
      className={`progress-fill ${tone ?? ''}`}
      style={{ '--value': `${Math.min(100, Math.max(0, value))}%` } as CSSProperties}
    />
  </span>
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
    <figure className="relative m-0 min-h-36 overflow-hidden rounded-lg border border-field-200 bg-field-50">
      {attachment.type.startsWith('image/') ? (
        <img className="aspect-[1.35] w-full object-cover" src={url} alt={attachment.name} />
      ) : (
        <div className="grid aspect-[1.35] w-full place-items-center bg-white text-ink-400">
          <ImagePlus size={20} aria-hidden="true" />
        </div>
      )}
      <figcaption className="grid gap-0.5 p-2">
        <span className="truncate text-sm font-black text-ink-950">{attachment.name}</span>
        <small className="text-xs text-ink-400">{formatBytes(attachment.size)}</small>
      </figcaption>
      <button
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-lg border border-field-200 bg-white/95 text-ink-600"
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
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [journalMode, setJournalMode] = useState<JournalMode>('entries')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview')
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
  const [gameEngineSettings, setGameEngineSettings] = useState<GameEngineSettings>(defaultGameEngineSettings)
  const [dashboardCards, setDashboardCards] = useState<DashboardCardConfig[]>(defaultDashboardCards)
  const [journalSearch, setJournalSearch] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [writeError, setWriteError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>({
    origin: window.location.origin,
    driver: localDatabaseDriver,
    databaseName: localDatabaseName,
    databasePath: '',
    apiBaseUrl: '',
    schemaVersion: 0,
    lastLoadedAt: '',
  })

  const reload = async () => {
    try {
      const nextState = await getLocalState()

      setEntries(nextState.entries)
      setTodos(nextState.todos)
      setAttachments(nextState.attachments)
      setChanges(nextState.changes)
      setWeeklySummaries(nextState.weeklySummaries)
      setDatabaseStatus({
        origin: window.location.origin,
        driver: nextState.meta.driver,
        databaseName: nextState.meta.databaseName,
        databasePath: nextState.meta.databasePath,
        apiBaseUrl: nextState.meta.apiBaseUrl,
        schemaVersion: nextState.meta.schemaVersion,
        lastLoadedAt: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      })
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '读取本地 SQLite 数据库失败。')
    }
  }

  useEffect(() => {
    setAiConfig(readAiConfig())
    setWebDavConfig(readWebDavConfig())
    setGameEngineSettings(readGameEngineSettings())
    setDashboardCards(readDashboardCards())
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

  const todayKey = getTodayKey()
  const latestEntry = entries[0]
  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.dateKey, entry])), [entries])
  const attachmentCountByEntryId = useMemo(() => {
    const counts = new Map<string, number>()

    for (const attachment of attachments) {
      counts.set(attachment.entryId, (counts.get(attachment.entryId) ?? 0) + 1)
    }

    return counts
  }, [attachments])
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
  const filteredBoardTodos = useMemo(() => {
    const keyword = journalSearch.trim().toLowerCase()
    const items = keyword
      ? todos.filter((todo) => {
          const entry = entryByDate.get(todo.dateKey)

          return [
            todo.title,
            todo.dateKey,
            entry?.title ?? '',
            entry?.body ?? '',
            entry?.moodText ?? '',
            entry?.tags.join(' ') ?? '',
            entry?.mood.quadrant ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        })
      : todos

    return [...items].sort((left, right) => {
      if (left.done !== right.done) return Number(left.done) - Number(right.done)
      if (!left.done && left.dateKey !== right.dateKey) return left.dateKey.localeCompare(right.dateKey)

      return (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt)
    })
  }, [entryByDate, journalSearch, todos])
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
  const gameEngineSnapshot = useMemo(
    () => createGameEngineSnapshot(entries, todos, attachments, gameEngineSettings),
    [attachments, entries, gameEngineSettings, todos],
  )
  const todayScore = selectedEntry?.mood.score ?? 50
  const canSave = Boolean(draft.body.trim() || draft.moodText.trim() || draft.title.trim() || pendingFiles.length > 0)
  const canGenerateSummary = Boolean(aiConfig.endpoint.trim() && aiConfig.apiKey.trim() && selectedWeekEntries.length > 0)
  const dashboardCardMetrics = [
    {
      id: 'latestMood' as const,
      label: '最近心象',
      value: `${latestEntry?.mood.score ?? todayScore}`,
      tone: latestEntry ? `score-${latestEntry.mood.level}` : undefined,
    },
    {
      id: 'streak' as const,
      label: '连续打卡',
      value: `${currentStreak} 天`,
    },
    {
      id: 'todoCompletion' as const,
      label: '事项完成',
      value: `${dayTodos.filter((todo) => todo.done).length}/${dayTodos.length}`,
    },
    {
      id: 'monthCheckin' as const,
      label: '本月打卡率',
      value: `${monthCheckinRate}%`,
    },
    {
      id: 'pendingSync' as const,
      label: '待同步',
      value: `${pendingChangeCount}`,
    },
    {
      id: 'attachments' as const,
      label: '图片',
      value: `${selectedAttachments.length + pendingFiles.length}`,
    },
  ]
  const visibleDashboardCards = dashboardCardMetrics.filter((card) =>
    dashboardCards.find((item) => item.id === card.id)?.enabled,
  )
  const boardColumns = useMemo(
    () => [
      {
        id: 'overdue',
        label: '待推进',
        note: '早于今天且尚未完成',
        items: filteredBoardTodos.filter((todo) => !todo.done && todo.dateKey < todayKey),
      },
      {
        id: 'today',
        label: '今天',
        note: '今天要收口的事项',
        items: filteredBoardTodos.filter((todo) => !todo.done && todo.dateKey === todayKey),
      },
      {
        id: 'upcoming',
        label: '稍后',
        note: '未来日期或预排事项',
        items: filteredBoardTodos.filter((todo) => !todo.done && todo.dateKey > todayKey),
      },
      {
        id: 'done',
        label: '已完成',
        note: '已经落地的推进',
        items: filteredBoardTodos.filter((todo) => todo.done),
      },
    ],
    [filteredBoardTodos, todayKey],
  )

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
    setWriteError('')

    try {
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
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '保存日记失败。')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = todoTitle.trim()
    if (!title) return

    setWriteError('')

    try {
      await addTodo(selectedDate, title)
      setTodoTitle('')
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '新增事项失败。')
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    setWriteError('')

    try {
      await setTodoDone(todo, !todo.done)
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '更新事项失败。')
    }
  }

  const handleDeleteTodo = async (todo: TodoItem) => {
    setWriteError('')

    try {
      await deleteTodo(todo)
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '删除事项失败。')
    }
  }

  const handleDeleteAttachment = async (attachment: AttachmentRecord) => {
    setWriteError('')

    try {
      await deleteAttachment(attachment)
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '删除附件失败。')
    }
  }

  const navigateTo = (view: ActiveView) => {
    setActiveView(view)
    setIsNavOpen(false)
  }

  const openSettingsSection = (section: SettingsSection) => {
    setSettingsSection(section)
    navigateTo('settings')
  }

  const openJournalMode = (mode: JournalMode) => {
    setJournalMode(mode)
    navigateTo('journal')
  }

  const focusDate = (dateKey: string, nextView: ActiveView = activeView) => {
    setSelectedDate(dateKey)
    setSelectedWeek(getWeekKey(dateKey))
    setVisibleMonth(dateKey.slice(0, 7))
    navigateTo(nextView)
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

  const persistGameEngineSettings = (next: GameEngineSettings) => {
    setGameEngineSettings(next)
    window.localStorage.setItem(gameEngineSettingsStorageKey, JSON.stringify(next))
  }

  const handleSnapshotDaysChange = (event: ChangeEvent<HTMLInputElement>) => {
    const snapshotDays = Math.min(365, Math.max(7, Number(event.target.value) || defaultGameEngineSettings.snapshotDays))

    persistGameEngineSettings({ ...gameEngineSettings, snapshotDays })
  }

  const persistDashboardCards = (next: DashboardCardConfig[]) => {
    setDashboardCards(next)
    window.localStorage.setItem(dashboardCardsStorageKey, JSON.stringify(next))
  }

  const toggleDashboardCard = (cardId: DashboardCardId) => {
    persistDashboardCards(
      dashboardCards.map((card) => (card.id === cardId ? { ...card, enabled: !card.enabled } : card)),
    )
  }

  const handleGenerateSummary = async () => {
    if (!canGenerateSummary || isGeneratingSummary) return

    setIsGeneratingSummary(true)
    setSummaryError('')

    try {
      const response = await fetch('/api/ai/weekly-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: aiConfig.endpoint.trim(),
          apiKey: aiConfig.apiKey.trim(),
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
      const payload = (await response.json()) as { content?: string; error?: string }
      const content = payload.content?.trim() ?? ''

      if (!response.ok) {
        throw new Error(payload.error || `请求失败：${response.status}`)
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

  const activeNavItem = navigationItems.find((item) => item.id === activeView)
  const activeSettingsItem = settingsSections.find((item) => item.id === settingsSection)

  return (
    <main className="shell">
      <DynamicBackground />
      <div className="page">
        <header className="topbar">
          <div className="topbar-main">
            <div className="topbar-brand">
              <button
                className="icon-button"
                type="button"
                aria-label={isNavOpen ? '关闭菜单' : '打开菜单'}
                aria-expanded={isNavOpen}
                onClick={() => setIsNavOpen((current) => !current)}
              >
                {isNavOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
              </button>
              <div>
                <p className="eyebrow">Xinxiangyi</p>
                <h1 className="app-title">心象仪</h1>
                <p className="view-summary">
                  <strong>{activeNavItem?.label ?? '今日台'}</strong>
                  <span>{activeNavItem?.note ?? '离线优先的心情记录与行动回顾。'}</span>
                </p>
              </div>
            </div>
            <div className="status-pills" aria-label="本地状态">
              <span className="pill">
                <Database size={16} aria-hidden="true" />
                SQLite
              </span>
              <span className="pill">
                <Cloud size={16} aria-hidden="true" />
                待同步 {pendingChangeCount}
              </span>
              <span className="pill border-xin-700 bg-xin-100 text-xin-800">
                <CheckCircle2 size={16} aria-hidden="true" />
                文件库
              </span>
              <button className="button-secondary min-h-9 px-3" type="button" onClick={() => void reload()}>
                <RefreshCw size={16} aria-hidden="true" />
                重新获取
              </button>
            </div>
          </div>
        </header>

        {isNavOpen && <button className="nav-backdrop" type="button" aria-label="关闭菜单" onClick={() => setIsNavOpen(false)} />}

        <aside className={`nav-drawer ${isNavOpen ? 'nav-drawer-open' : ''}`} aria-label="主菜单">
          <div className="nav-drawer-head">
            <p className="eyebrow">Navigation</p>
            <strong className="text-lg font-black text-ink-950">切换工作区</strong>
          </div>
          <nav className="nav-list">
            {navigationItems.map((item) => {
              const icon =
                item.id === 'dashboard' ? (
                  <BarChart3 size={18} aria-hidden="true" />
                ) : item.id === 'journal' ? (
                  <BookOpen size={18} aria-hidden="true" />
                ) : item.id === 'summary' ? (
                  <TrendingUp size={18} aria-hidden="true" />
                ) : (
                  <Settings2 size={18} aria-hidden="true" />
                )

              return (
                <button
                  className={`nav-link ${activeView === item.id ? 'nav-link-active' : ''}`}
                  type="button"
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                >
                  <span className="nav-link-icon">{icon}</span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-black text-ink-950">{item.label}</strong>
                    <small className="block truncate text-xs font-bold text-ink-400">{item.note}</small>
                  </span>
                </button>
              )
            })}
          </nav>
          <div className="nav-shortcuts">
            <p className="nav-shortcuts-title">常用捷径</p>
            <button className="nav-sub-link" type="button" onClick={() => openJournalMode('board')}>
              直接打开 Todo 看板
            </button>
            <button className="nav-sub-link" type="button" onClick={() => openSettingsSection('overview')}>
              查看系统总览
            </button>
            <button className="nav-sub-link" type="button" onClick={() => openSettingsSection('ai')}>
              配置周总结模型
            </button>
          </div>
        </aside>

        {activeView === 'dashboard' ? (
        <>
          <section className="toolbar" aria-label="日期选择">
            <label className="field-line">
              <CalendarDays size={18} aria-hidden="true" />
              <input
                className="min-h-10 border-0 bg-transparent p-0 font-black text-ink-950 outline-none"
                type="date"
                value={selectedDate}
                onChange={(event) => focusDate(event.target.value, 'dashboard')}
              />
            </label>
            {visibleDashboardCards.length > 0 ? (
              visibleDashboardCards.map((card) => (
                <Metric label={card.label} value={card.value} tone={card.tone} key={card.id} />
              ))
            ) : (
              <div className="metric-line md:col-span-4">
                <span className="metric-label">统计卡片</span>
                <strong className="metric-value !text-base">去设置里挑选要展示的指标</strong>
              </div>
            )}
          </section>

          {writeError && <p className="mt-4 rounded-lg border border-coral-500/30 bg-[#fff1ee] px-3 py-2 font-black text-coral-500">{writeError}</p>}

          <div className="workspace-grid">
            <section className="section" aria-labelledby="journal-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">{formatDateLabel(selectedDate)}</p>
                  <h2 className="section-title" id="journal-title">今日记录</h2>
                </div>
                <span className={`pill score-${selectedEntry?.mood.level ?? '平稳'}`}>
                  {selectedEntry?.mood.level ?? '未记录'}
                </span>
              </div>

              <form className="grid gap-3" onSubmit={handleSave}>
                <label className="input-label">
                  <span>标题</span>
                  <input className="text-input" value={draft.title} onChange={handleDraftChange('title')} placeholder="今天的主线" />
                </label>
                <label className="input-label">
                  <span>心情描述</span>
                  <textarea
                    className="text-area"
                    value={draft.moodText}
                    onChange={handleDraftChange('moodText')}
                    placeholder="比如：上午焦虑但有推进，下午散步后恢复专注"
                    rows={4}
                  />
                </label>
                <label className="input-label">
                  <span>打卡日记</span>
                  <textarea
                    className="text-area min-h-44"
                    value={draft.body}
                    onChange={handleDraftChange('body')}
                    placeholder="完成了什么，卡在哪里，下一步是什么"
                    rows={7}
                  />
                </label>
                <label className="input-label">
                  <span>标签</span>
                  <input className="text-input" value={draft.tags} onChange={handleDraftChange('tags')} placeholder="工作 健康 学习" />
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <label className="button-secondary relative overflow-hidden">
                    <ImagePlus size={18} aria-hidden="true" />
                    图片
                    <input className="absolute inset-0 cursor-pointer opacity-0" accept="image/*" multiple type="file" onChange={handleFilesChange} />
                  </label>
                  <button className="button-primary" type="submit" disabled={!canSave || isSaving}>
                    <Save size={18} aria-hidden="true" />
                    {isSaving ? '保存中' : '保存'}
                  </button>
                </div>
              </form>

              {(pendingFiles.length > 0 || selectedAttachments.length > 0) && (
                <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3" aria-label="图片附件">
                  {pendingFiles.map((file) => (
                    <div className="grid min-h-36 content-center justify-items-start gap-1 rounded-lg border border-field-200 bg-field-50 p-3 text-xin-700" key={`${file.name}-${file.size}`}>
                      <ImagePlus size={18} aria-hidden="true" />
                      <span className="max-w-full truncate text-sm font-black text-ink-950">{file.name}</span>
                      <small className="text-xs text-ink-400">{formatBytes(file.size)}</small>
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

            <div className="side-stack">
            <section className="section" aria-labelledby="todo-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Todo</p>
                  <h2 className="section-title" id="todo-title">今日事项</h2>
                </div>
                <span className="pill">{getCompletionRate(dayTodos)}%</span>
              </div>

              <form className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={handleAddTodo}>
                <input className="text-input" value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="新增一个事项" />
                <button className="icon-button-solid" type="submit" aria-label="新增事项">
                  <Plus size={20} aria-hidden="true" />
                </button>
              </form>

              <ul className="m-0 grid list-none p-0">
                {dayTodos.map((todo) => (
                  <li className="todo-row" key={todo.id}>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={todo.done ? '标记未完成' : '标记完成'}
                      onClick={() => void handleToggleTodo(todo)}
                    >
                      {todo.done ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                    </button>
                    <span className={`break-words font-bold text-ink-950 ${todo.done ? 'todo-done' : ''}`}>{todo.title}</span>
                    <button
                      className="icon-button"
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

            <section className="section" aria-labelledby="stats-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Mood Space</p>
                  <h2 className="section-title" id="stats-title">心象分</h2>
                </div>
                <span className="section-icon"><TrendingUp size={22} aria-hidden="true" /></span>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <Metric label="最近 7 次均值" value={`${average(lastSevenEntries.map((entry) => entry.mood.score)) || 0}`} />
                <Metric label="总完成率" value={`${completionRate}%`} />
                <Metric label="记录天数" value={`${entries.length}`} />
              </div>

              {latestEntry ? (
                <div className="grid gap-4">
                  <div className="score-ring" aria-label={`最近心象分 ${latestEntry.mood.score}`}>
                    <div className="text-center">
                      <strong className="block text-3xl font-black leading-none text-ink-950">{latestEntry.mood.score}</strong>
                      <span className="text-xs font-black text-ink-400">{latestEntry.mood.level}</span>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-field-200 bg-field-50 px-3">
                      <span className="text-xs font-black text-ink-400">象限</span>
                      <strong className="truncate text-sm font-black text-ink-950">{latestEntry.mood.quadrant}</strong>
                    </div>
                    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs font-black text-ink-600">
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
                  <p className="note">{latestEntry.mood.reviewHint}</p>
                </div>
              ) : (
                <p className="empty-state">保存第一条日记后生成心象分。</p>
              )}
            </section>
            </div>
          </div>

          <section className="section-flat mt-5" aria-labelledby="history-title">
            <div className="section-head">
              <div>
                <p className="eyebrow">Hierarchy</p>
                <h2 className="section-title" id="history-title">层级记录</h2>
              </div>
              <span className="pill">{monthGroups.length} 个月</span>
            </div>

            <div className="grid gap-3">
              {monthGroups.map((month, monthIndex) => (
                <details className="overflow-hidden rounded-lg border border-field-200 bg-white" key={month.monthKey} open={monthIndex === 0}>
                  <summary className="grid min-h-12 cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-field-50 px-4 font-black text-ink-950">
                    <span>{formatMonthLabel(month.monthKey)}</span>
                    <span>心象 {month.averageScore}</span>
                    <span>{month.completionRate}%</span>
                  </summary>
                  <div className="grid gap-3 p-3">
                    {month.weeks.map((week) => (
                      <div className="rounded-lg border border-field-200 bg-white p-3" key={week.weekKey}>
                        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm font-bold text-ink-600">
                          <strong>{formatDateLabel(week.weekKey)} 周</strong>
                          <span>心象 {week.averageScore}</span>
                          <span>
                            <Check size={14} aria-hidden="true" />
                            {week.completionRate}%
                          </span>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(142px,1fr))] gap-2">
                          {week.entries.map((entry) => (
                            <button
                              className="grid min-h-16 grid-cols-[auto_auto] grid-rows-[auto_auto] gap-x-2 rounded-lg border border-field-200 bg-field-50 p-2 text-left transition-colors hover:bg-white"
                              type="button"
                              key={entry.id}
                              onClick={() => focusDate(entry.dateKey, 'dashboard')}
                            >
                              <span className="font-black text-ink-950">{entry.dateKey.slice(5)}</span>
                              <strong className="justify-self-end font-black text-ink-950">{entry.mood.score}</strong>
                              <small className="col-span-2 truncate text-xs font-bold text-ink-400">{entry.title}</small>
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
        <section className="py-5" aria-labelledby="journal-browser-title">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Journal Browser</p>
              <h2 className="section-title" id="journal-browser-title">日记浏览</h2>
              <p className="mt-1 text-sm font-bold text-ink-400">在记录流与 Todo 看板之间切换，快速回到任意一天。</p>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
              <div className="segmented-control" aria-label="日记浏览模式">
                {journalModes.map((mode) => (
                  <button
                    className={`segment ${journalMode === mode.id ? 'segment-active' : ''}`}
                    type="button"
                    key={mode.id}
                    onClick={() => setJournalMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-field-200 bg-white px-3 md:w-[min(420px,100%)]">
                <Search size={18} aria-hidden="true" />
                <input
                  className="min-h-10 flex-1 border-0 bg-transparent p-0 outline-none"
                  value={journalSearch}
                  onChange={(event) => setJournalSearch(event.target.value)}
                  placeholder={journalMode === 'entries' ? '搜索标题、正文、心情、标签' : '搜索 Todo、日期、关联日记'}
                />
              </label>
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-5">
            {journalMode === 'entries' ? (
              <>
                <Metric label="日记总数" value={`${entries.length}`} />
                <Metric label="搜索结果" value={`${filteredEntries.length}`} />
                <Metric label="最近心象" value={`${latestEntry?.mood.score ?? 0}`} />
                <Metric label="连续打卡" value={`${currentStreak} 天`} />
                <Metric label="待同步" value={`${pendingChangeCount}`} />
              </>
            ) : (
              <>
                <Metric label="事项总数" value={`${todos.length}`} />
                <Metric label="看板结果" value={`${filteredBoardTodos.length}`} />
                <Metric label="待推进" value={`${boardColumns[0].items.length + boardColumns[1].items.length + boardColumns[2].items.length}`} />
                <Metric label="今日收口" value={`${boardColumns[1].items.length}`} />
                <Metric label="已完成" value={`${boardColumns[3].items.length}`} />
              </>
            )}
          </div>

          {journalMode === 'entries' ? (
            <>
              <div className="divide-y divide-field-200 rounded-lg border border-field-200 bg-white">
                {filteredEntries.map((entry) => {
                  const entryTodos = todos.filter((todo) => todo.dateKey === entry.dateKey)
                  const entryAttachments = attachments.filter((attachment) => attachment.entryId === entry.id)

                  return (
                    <button
                      className="grid w-full gap-2 px-4 py-4 text-left transition-colors hover:bg-field-50 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-start"
                      type="button"
                      key={entry.id}
                      onClick={() => focusDate(entry.dateKey, 'dashboard')}
                    >
                      <div className="flex items-center justify-between gap-3 md:block">
                        <span className="text-sm font-black text-ink-400">{entry.dateKey}</span>
                        <strong className={`block text-2xl font-black ${`score-${entry.mood.level}`}`}>{entry.mood.score}</strong>
                      </div>
                      <div className="min-w-0">
                        <h3 className="m-0 truncate text-base font-black text-ink-950">{entry.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm font-bold text-ink-600">{entry.moodText || entry.body || '没有正文'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 md:max-w-80 md:justify-end">
                        <span className="pill min-h-7 text-xs">{entry.mood.quadrant}</span>
                        <span className="pill min-h-7 text-xs">{entryTodos.filter((todo) => todo.done).length}/{entryTodos.length} 事项</span>
                        <span className="pill min-h-7 text-xs">{entryAttachments.length} 图</span>
                        {entry.tags.map((tag) => (
                          <span className="pill min-h-7 text-xs" key={tag}>#{tag}</span>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>

              {filteredEntries.length === 0 && <p className="empty-state">还没有匹配的日记。</p>}
            </>
          ) : (
            <>
              <section className="board-toolbar" aria-label="Todo 看板快捷录入">
                <label className="field-line">
                  <CalendarDays size={18} aria-hidden="true" />
                  <input
                    className="min-h-10 border-0 bg-transparent p-0 font-black text-ink-950 outline-none"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => focusDate(event.target.value, 'journal')}
                  />
                </label>
                <form className="board-capture" onSubmit={handleAddTodo}>
                  <input
                    className="text-input"
                    value={todoTitle}
                    onChange={(event) => setTodoTitle(event.target.value)}
                    placeholder="给这个日期快速记下一条 Todo"
                  />
                  <button className="button-primary" type="submit">
                    <Plus size={18} aria-hidden="true" />
                    添加
                  </button>
                </form>
              </section>

              <div className="board-grid">
                {boardColumns.map((column) => (
                  <section className="board-column" aria-labelledby={`board-${column.id}`} key={column.id}>
                    <div className="board-column-head">
                      <div>
                        <h3 className="board-column-title" id={`board-${column.id}`}>{column.label}</h3>
                        <p className="board-column-note">{column.note}</p>
                      </div>
                      <span className="pill min-h-8 text-xs">{column.items.length}</span>
                    </div>

                    <div className="board-column-body">
                      {column.items.map((todo) => {
                        const entry = entryByDate.get(todo.dateKey)
                        const attachmentCount = entry ? (attachmentCountByEntryId.get(entry.id) ?? 0) : 0

                        return (
                          <article className="board-card" key={todo.id}>
                            <div className="board-card-meta">
                              <button
                                className="board-date-link"
                                type="button"
                                onClick={() => focusDate(todo.dateKey, 'dashboard')}
                              >
                                {todo.dateKey}
                              </button>
                              <span className={`pill min-h-7 text-xs ${entry ? `score-${entry.mood.level}` : ''}`}>
                                {entry ? `心象 ${entry.mood.score}` : '未打卡'}
                              </span>
                            </div>
                            <h3 className={`m-0 text-base font-black text-ink-950 ${todo.done ? 'todo-done' : ''}`}>{todo.title}</h3>
                            <p className="m-0 text-sm font-bold text-ink-600">
                              {entry ? `${entry.title} · ${entry.mood.quadrant}` : '还没有关联到日记记录。'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <span className="pill min-h-7 text-xs">{attachmentCount} 图</span>
                              <span className="pill min-h-7 text-xs">{todo.syncState === 'pending' ? '待同步' : '已同步'}</span>
                              {entry?.tags.slice(0, 3).map((tag) => (
                                <span className="pill min-h-7 text-xs" key={`${todo.id}-${tag}`}>#{tag}</span>
                              ))}
                            </div>
                            <div className="board-card-actions">
                              <button className="button-secondary min-h-9 px-3" type="button" onClick={() => void handleToggleTodo(todo)}>
                                {todo.done ? '撤回完成' : '标记完成'}
                              </button>
                              <button className="icon-button" type="button" aria-label={`删除 ${todo.title}`} onClick={() => void handleDeleteTodo(todo)}>
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </div>
                          </article>
                        )
                      })}

                      {column.items.length === 0 && <p className="empty-state">这个列暂时没有事项。</p>}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </section>
      ) : activeView === 'summary' ? (
        <section className="py-5" aria-labelledby="summary-title">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Traceable Progress</p>
              <h2 className="section-title" id="summary-title">总结</h2>
            </div>
            <div className="flex items-center gap-2" aria-label="月份切换">
              <button className="icon-button" type="button" aria-label="上个月" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <strong className="min-w-32 text-center font-black text-ink-950">{formatMonthLabel(visibleMonth)}</strong>
              <button className="icon-button" type="button" aria-label="下个月" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-5">
            <Metric label="本月心象均值" value={`${monthScore || 0}`} />
            <Metric label="本月打卡率" value={`${monthCheckinRate}%`} />
            <Metric label="本月完成率" value={`${monthCompletionRate}%`} />
            <Metric label="连续打卡" value={`${currentStreak} 天`} />
            <Metric label="最长连续" value={`${longestStreak} 天`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <section className="section" aria-labelledby="calendar-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Calendar Heatmap</p>
                  <h2 className="section-title" id="calendar-title">心情日历</h2>
                </div>
                <span className="pill">{monthEntries.length} 次打卡</span>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-2" aria-hidden="true">
                {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
                  <span className="text-center text-xs font-black text-ink-400" key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell) => {
                  const dayNumber = Number(cell.dateKey.slice(-2))
                  const completion = getCompletionRate(cell.todos)

                  return (
                    <button
                      className={`grid min-h-16 grid-rows-[auto_1fr_auto] rounded-lg border border-field-200 p-2 text-left text-ink-950 transition-colors hover:border-field-300 ${cell.inMonth ? '' : 'opacity-35'} heat-${getHeatLevel(cell.entry)} ${cell.dateKey === selectedDate ? 'ring-2 ring-xin-700 ring-offset-2' : ''}`}
                      type="button"
                      key={cell.dateKey}
                      onClick={() => focusDate(cell.dateKey, 'dashboard')}
                      aria-label={`${cell.dateKey}，${cell.entry ? `心象分 ${cell.entry.mood.score}` : '未打卡'}，完成率 ${completion}%`}
                    >
                      <span className="text-xs font-black">{dayNumber}</span>
                      {cell.entry && <strong className="self-center text-lg font-black leading-none">{cell.entry.mood.score}</strong>}
                      {cell.todos.length > 0 && <small className="justify-self-end rounded-full bg-white/70 px-1.5 text-[11px] font-black">{cell.todos.filter((todo) => todo.done).length}/{cell.todos.length}</small>}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center justify-end gap-1.5 text-xs font-black text-ink-400" aria-label="热力图图例">
                <span>未打卡</span>
                <i className="size-5 rounded border border-field-200 heat-empty" />
                <i className="size-5 rounded border border-field-200 heat-low" />
                <i className="size-5 rounded border border-field-200 heat-stress" />
                <i className="size-5 rounded border border-field-200 heat-steady" />
                <i className="size-5 rounded border border-field-200 heat-good" />
                <i className="size-5 rounded border border-field-200 heat-bright" />
                <span>高亮</span>
              </div>
            </section>

            <section className="section" aria-labelledby="week-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Weekly Review</p>
                  <h2 className="section-title" id="week-title">一周回顾</h2>
                </div>
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-field-200 bg-field-50 px-2">
                  <CalendarDays size={16} aria-hidden="true" />
                  <input className="min-h-8 border-0 bg-transparent p-0 outline-none" type="date" value={selectedWeek} onChange={(event) => setSelectedWeek(getWeekKey(event.target.value))} />
                </label>
              </div>

              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Metric label="本周心象" value={`${selectedWeekScore || 0}`} />
                <Metric label="本周打卡" value={`${selectedWeekEntries.length}/7`} />
                <Metric label="事项完成" value={`${selectedWeekCompletionRate}%`} />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-7 lg:grid-cols-2 xl:grid-cols-7">
                {selectedWeekDays.map((dateKey) => {
                  const entry = entries.find((item) => item.dateKey === dateKey)
                  const dayItems = todos.filter((todo) => todo.dateKey === dateKey)

                  return (
                    <button className="grid min-h-22 gap-1 rounded-lg border border-field-200 bg-field-50 p-2 text-left transition-colors hover:bg-white" type="button" key={dateKey} onClick={() => focusDate(dateKey, 'dashboard')}>
                      <span className="text-xs font-black text-ink-950">{dateKey.slice(5)}</span>
                      <strong className="text-xl font-black leading-none text-ink-950">{entry?.mood.score ?? '-'}</strong>
                      <small className="truncate text-xs font-bold text-ink-400">{entry?.mood.quadrant ?? '未打卡'}</small>
                      <em className="truncate text-xs not-italic font-bold text-ink-400">{dayItems.length ? `${dayItems.filter((todo) => todo.done).length}/${dayItems.length}` : '无事项'}</em>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-field-200 bg-field-50 p-3 text-sm font-bold text-ink-600">
                <Settings2 size={17} aria-hidden="true" />
                <span className="truncate">{aiConfig.apiKey ? `${aiConfig.model} 已配置` : '在设置页配置大模型 API 后可生成周总结'}</span>
                <button className="button-secondary min-h-9 px-3" type="button" onClick={() => openSettingsSection('ai')}>
                  设置
                </button>
              </div>

              <div className="my-3 flex flex-wrap gap-3">
                <button className="button-primary" type="button" disabled={!canGenerateSummary || isGeneratingSummary} onClick={() => void handleGenerateSummary()}>
                  {isGeneratingSummary ? <RefreshCw size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                  {isGeneratingSummary ? '生成中' : '生成周总结'}
                </button>
                <button className="button-secondary" type="button" disabled={!summaryDraft.trim()} onClick={() => void handleSaveSummaryDraft()}>
                  <Save size={18} aria-hidden="true" />
                  保存总结
                </button>
              </div>

              {summaryError && <p className="mb-3 rounded-lg border border-coral-500/30 bg-[#fff1ee] px-3 py-2 font-black text-coral-500">{summaryError}</p>}

              <label className="input-label">
                <span>周总结</span>
                <textarea
                  className="text-area min-h-56"
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
        <section className="py-5" aria-labelledby="settings-title">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Preferences</p>
              <h2 className="section-title" id="settings-title">设置</h2>
              <p className="mt-1 text-sm font-bold text-ink-400">{activeSettingsItem?.note}</p>
            </div>
            <span className="pill">{activeSettingsItem?.label}</span>
          </div>

          <div className="settings-layout">
            <aside className="settings-sidebar" aria-label="设置子菜单">
              {settingsSections.map((item) => (
                <button
                  className={`settings-link ${settingsSection === item.id ? 'settings-link-active' : ''}`}
                  type="button"
                  key={item.id}
                  onClick={() => setSettingsSection(item.id)}
                >
                  <strong className="block text-sm font-black text-ink-950">{item.label}</strong>
                  <small className="block text-xs font-bold text-ink-400">{item.note}</small>
                </button>
              ))}
            </aside>

            <div className="grid gap-5">
              {settingsSection === 'overview' && (
                <>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Metric label="数据库" value={localDatabaseName} />
                    <Metric label="日记" value={`${entries.length}`} />
                    <Metric label="事项" value={`${todos.length}`} />
                    <Metric label="附件" value={`${attachments.length}`} />
                    <Metric label="周总结" value={`${weeklySummaries.length}`} />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
                    <section className="section" aria-labelledby="overview-db-title">
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">System Snapshot</p>
                          <h2 className="section-title" id="overview-db-title">本地数据库概况</h2>
                        </div>
                        <span className="section-icon"><Database size={22} aria-hidden="true" /></span>
                      </div>
                      <div className="table-grid">
                        <span className="table-key">driver</span>
                        <strong className="table-value">{databaseStatus.driver}</strong>
                        <span className="table-key">database</span>
                        <strong className="table-value">{databaseStatus.databaseName}</strong>
                        <span className="table-key">path</span>
                        <strong className="table-value">{databaseStatus.databasePath || '等待本地 API 返回'}</strong>
                        <span className="table-key">schema</span>
                        <strong className="table-value">v{databaseStatus.schemaVersion || '-'}</strong>
                        <span className="table-key">pending changes</span>
                        <strong className="table-value">{pendingChangeCount}</strong>
                      </div>
                      <p className="note mt-3">
                        主数据已经固定落在项目目录下的 SQLite 文件里。浏览器、端口和 PWA 安装状态改变时，只要本地 API 仍指向同一个文件，数据就不会跟着消失。
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="button-secondary min-h-9 px-3" type="button" onClick={() => setSettingsSection('database')}>
                          看详细结构
                        </button>
                        <button className="button-secondary min-h-9 px-3" type="button" onClick={() => void reload()}>
                          <RefreshCw size={16} aria-hidden="true" />
                          重新读取
                        </button>
                      </div>
                    </section>

                    <section className="section" aria-labelledby="overview-engine-title">
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">Game Adapter</p>
                          <h2 className="section-title" id="overview-engine-title">引擎快照</h2>
                        </div>
                        <span className="section-icon"><Settings2 size={22} aria-hidden="true" /></span>
                      </div>
                      <div className="table-grid">
                        <span className="table-key">adapter</span>
                        <strong className="table-value">{gameEngineSnapshot.adapterVersion}</strong>
                        <span className="table-key">progress score</span>
                        <strong className="table-value">{gameEngineSnapshot.progress.progressScore}</strong>
                        <span className="table-key">phase index</span>
                        <strong className="table-value">{gameEngineSnapshot.progress.phaseIndex}</strong>
                        <span className="table-key">timeline samples</span>
                        <strong className="table-value">{gameEngineSnapshot.timeline.length}</strong>
                      </div>
                      <p className="note mt-3">
                        这里暴露的是给后续游戏引擎消费的稳定快照，网页本身不渲染世界场景，只负责把情绪与行动数据整理好。
                      </p>
                      <button className="button-secondary mt-3 min-h-9 px-3" type="button" onClick={() => setSettingsSection('engine')}>
                        调整接口参数
                      </button>
                    </section>
                  </div>
                </>
              )}

              {settingsSection === 'cards' && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                  <section className="section" aria-labelledby="card-settings-title">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Cards</p>
                        <h2 className="section-title" id="card-settings-title">今日台统计卡片</h2>
                      </div>
                      <span className="pill">{dashboardCards.filter((card) => card.enabled).length} 已显示</span>
                    </div>

                    <div className="grid gap-3">
                      {dashboardCardMetrics.map((card) => {
                        const enabled = dashboardCards.find((item) => item.id === card.id)?.enabled ?? false

                        return (
                          <div className="config-row" key={card.id}>
                            <div>
                              <strong className="block text-sm font-black text-ink-950">{card.label}</strong>
                              <small className="block text-xs font-bold text-ink-400">当前值 {card.value}</small>
                            </div>
                            <button
                              className={`button-secondary min-h-9 px-3 ${enabled ? 'border-xin-700 bg-xin-100 text-xin-800' : ''}`}
                              type="button"
                              onClick={() => toggleDashboardCard(card.id)}
                            >
                              {enabled ? '显示中' : '已隐藏'}
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <p className="note mt-3">
                      这一步先把统计区改成数据驱动的卡片显隐，后面接拖拽排序、自定义公式或新的统计块时，不需要再推翻存储结构。
                    </p>
                  </section>

                  <section className="section" aria-labelledby="card-preview-title">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Preview</p>
                        <h2 className="section-title" id="card-preview-title">当前展示预览</h2>
                      </div>
                      <span className="section-icon"><BarChart3 size={22} aria-hidden="true" /></span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {visibleDashboardCards.map((card) => (
                        <Metric label={card.label} value={card.value} tone={card.tone} key={`preview-${card.id}`} />
                      ))}
                    </div>
                    {visibleDashboardCards.length === 0 && <p className="empty-state mt-3">当前还没有开启的统计卡片。</p>}
                  </section>
                </div>
              )}

              {settingsSection === 'database' && (
                <section className="section" aria-labelledby="storage-settings-title">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Local Database</p>
                      <h2 className="section-title" id="storage-settings-title">本地数据库</h2>
                    </div>
                    <span className="section-icon"><Database size={22} aria-hidden="true" /></span>
                  </div>

                  <div className="grid gap-3">
                    <div className="table-grid">
                      <span className="table-key">origin</span>
                      <strong className="table-value">{databaseStatus.origin}</strong>
                      <span className="table-key">driver</span>
                      <strong className="table-value">{databaseStatus.driver}</strong>
                      <span className="table-key">database</span>
                      <strong className="table-value">{databaseStatus.databaseName}</strong>
                      <span className="table-key">path</span>
                      <strong className="table-value">{databaseStatus.databasePath || '等待本地 API 返回'}</strong>
                      <span className="table-key">api</span>
                      <strong className="table-value">{databaseStatus.apiBaseUrl || '/api'}</strong>
                      <span className="table-key">schema</span>
                      <strong className="table-value">v{databaseStatus.schemaVersion || '-'}</strong>
                      <span className="table-key">last loaded</span>
                      <strong className="table-value">{databaseStatus.lastLoadedAt || '-'}</strong>
                      <span className="table-key">entries</span>
                      <strong className="table-value">{entries.length}</strong>
                      <span className="table-key">todos</span>
                      <strong className="table-value">{todos.length}</strong>
                      <span className="table-key">attachments</span>
                      <strong className="table-value">{attachments.length}</strong>
                      <span className="table-key">changes</span>
                      <strong className="table-value">{changes.length}</strong>
                      <span className="table-key">weeklySummaries</span>
                      <strong className="table-value">{weeklySummaries.length}</strong>
                    </div>
                    <p className="note">
                      当前主库是项目目录下的 SQLite 文件，不再依赖浏览器 profile 或端口隔离。后续 WebDAV 同步会基于这个文件中的变更日志生成可恢复备份。
                    </p>
                  </div>
                </section>
              )}

              {settingsSection === 'ai' && (
                <section className="section" aria-labelledby="ai-settings-title">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Weekly AI</p>
                      <h2 className="section-title" id="ai-settings-title">大模型 API</h2>
                    </div>
                    <span className="section-icon"><Settings2 size={22} aria-hidden="true" /></span>
                  </div>
                  <div className="grid gap-3 rounded-lg border border-field-200 bg-field-50 p-3">
                    <label className="input-label">
                      <span>Endpoint</span>
                      <input className="text-input bg-white" value={aiConfig.endpoint} onChange={handleAiConfigChange('endpoint')} placeholder="https://api.openai.com/v1/chat/completions" />
                    </label>
                    <label className="input-label">
                      <span>Model</span>
                      <input className="text-input bg-white" value={aiConfig.model} onChange={handleAiConfigChange('model')} placeholder="gpt-4o-mini" />
                    </label>
                    <label className="input-label">
                      <span>API Key</span>
                      <input className="text-input bg-white" value={aiConfig.apiKey} onChange={handleAiConfigChange('apiKey')} placeholder="只保存在本机浏览器" type="password" />
                    </label>
                  </div>
                  <p className="note mt-3">
                    周总结请求会先发送到本地 SQLite API，再由本地代理转发到这里填写的 Chat Completions 兼容接口，用来避开浏览器直接跨域访问时常见的 `failed to fetch`。如果供应商给的是基础网关地址，比如 `https://www.heiyucode.com` 或 `https://api-slb.heiyucode.com`，这里也可以直接填写，系统会自动补成 `/v1/chat/completions`。
                  </p>
                </section>
              )}

              {settingsSection === 'webdav' && (
                <section className="section" aria-labelledby="webdav-title">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">WebDAV</p>
                      <h2 className="section-title" id="webdav-title">坚果云同步准备</h2>
                    </div>
                    <span className="section-icon"><Cloud size={22} aria-hidden="true" /></span>
                  </div>
                  <div className="grid gap-3 rounded-lg border border-field-200 bg-field-50 p-3">
                    <label className="input-label">
                      <span>Server URL</span>
                      <input className="text-input bg-white" value={webDavConfig.url} onChange={handleWebDavConfigChange('url')} placeholder="https://dav.jianguoyun.com/dav/" />
                    </label>
                    <label className="input-label">
                      <span>Username</span>
                      <input className="text-input bg-white" value={webDavConfig.username} onChange={handleWebDavConfigChange('username')} placeholder="坚果云账号邮箱" />
                    </label>
                    <label className="input-label">
                      <span>Password</span>
                      <input className="text-input bg-white" value={webDavConfig.password} onChange={handleWebDavConfigChange('password')} placeholder="坚果云应用密码" type="password" />
                    </label>
                    <label className="input-label">
                      <span>Remote Path</span>
                      <input className="text-input bg-white" value={webDavConfig.remotePath} onChange={handleWebDavConfigChange('remotePath')} placeholder="/xinxiangyi" />
                    </label>
                  </div>
                  <p className="note mt-3">
                    当前版本只保存同步配置和本地变更日志。下一步会把 `changes` 打包成 JSON 增量文件，并把图片附件按 `attachments/` 上传到 WebDAV。
                  </p>
                </section>
              )}

              {settingsSection === 'engine' && (
                <section className="section" aria-labelledby="engine-settings-title">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Game Engine Adapter</p>
                      <h2 className="section-title" id="engine-settings-title">游戏引擎接口</h2>
                    </div>
                    <span className="section-icon"><Settings2 size={22} aria-hidden="true" /></span>
                  </div>

                  <div className="rounded-lg border border-field-200 bg-field-50 p-3">
                    <strong>网页端不渲染游戏场景。</strong>
                    <p className="m-0 mt-1 text-sm font-bold text-ink-600">
                      当前只维护一个稳定快照接口。后续接入 Phaser、Pixi、Three.js 或 WebAssembly/Godot 导出时，
                      引擎层读取该快照并自行决定如何呈现成长关系。
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <label className="input-label">
                      <span>Snapshot Days</span>
                      <input
                        className="text-input"
                        min={7}
                        max={365}
                        type="number"
                        value={gameEngineSettings.snapshotDays}
                        onChange={handleSnapshotDaysChange}
                      />
                    </label>
                  </div>

                  <div className="mt-3">
                    <div className="table-grid">
                      <span className="table-key">adapterVersion</span>
                      <strong className="table-value">{gameEngineSnapshot.adapterVersion}</strong>
                      <span className="table-key">renderMode</span>
                      <strong className="table-value">{gameEngineSnapshot.renderMode}</strong>
                      <span className="table-key">mountPointId</span>
                      <strong className="table-value">{gameEngineSnapshot.contract.mountPointId}</strong>
                      <span className="table-key">entries</span>
                      <strong className="table-value">{gameEngineSnapshot.metrics.entries}</strong>
                      <span className="table-key">averageMoodScore</span>
                      <strong className="table-value">{gameEngineSnapshot.metrics.averageMoodScore}</strong>
                      <span className="table-key">progressScore</span>
                      <strong className="table-value">{gameEngineSnapshot.progress.progressScore}</strong>
                      <span className="table-key">phaseProgress</span>
                      <strong className="table-value">{gameEngineSnapshot.progress.phaseProgress}%</strong>
                      <span className="table-key">timeline</span>
                      <strong className="table-value">{gameEngineSnapshot.timeline.length}</strong>
                      <span className="table-key">assets</span>
                      <strong className="table-value">{gameEngineSnapshot.assets.length}</strong>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </section>
      )}
      </div>
    </main>
  )
}

export default App
