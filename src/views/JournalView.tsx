import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

import { Metric } from '../components/ui/stat-primitives'
import type { JournalEntry, TodoItem } from '../lib/db'
import type { ActiveView, JournalMode, JournalModeOption } from '../types/app'

type BoardColumn = {
  id: string
  label: string
  note: string
  items: TodoItem[]
}

type YearHeatmapCell = {
  dateKey: string
  inYear: boolean
  entry?: JournalEntry
  todos: TodoItem[]
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const getMondayIndex = (date: Date) => (date.getDay() + 6) % 7

const buildYearHeatmapCells = (year: string, entries: JournalEntry[], todos: TodoItem[]): YearHeatmapCell[] => {
  const entryMap = new Map(entries.map((entry) => [entry.dateKey, entry]))
  const todoMap = new Map<string, TodoItem[]>()

  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }

  const start = new Date(Number(year), 0, 1)
  const end = new Date(Number(year), 11, 31)
  let cursor = addDays(start, -getMondayIndex(start))
  const endPadding = 6 - getMondayIndex(end)
  const finalDay = addDays(end, endPadding)
  const cells: YearHeatmapCell[] = []

  while (cursor <= finalDay) {
    const dateKey = toDateKey(cursor)
    cells.push({
      dateKey,
      inYear: dateKey.startsWith(year),
      entry: entryMap.get(dateKey),
      todos: todoMap.get(dateKey) ?? [],
    })
    cursor = addDays(cursor, 1)
  }

  return cells
}

const getHeatLevel = (entry?: JournalEntry) => {
  if (!entry) return 'empty'
  if (entry.mood.score < 35) return 'low'
  if (entry.mood.score < 50) return 'stress'
  if (entry.mood.score < 66) return 'steady'
  if (entry.mood.score < 82) return 'good'

  return 'bright'
}

const average = (values: number[]) => {
  if (values.length === 0) return 0

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

type JournalViewProps = {
  journalMode: JournalMode
  journalModes: JournalModeOption[]
  entries: JournalEntry[]
  todos: TodoItem[]
  filteredBoardTodos: TodoItem[]
  currentStreak: number
  pendingChangeCount: number
  boardColumns: BoardColumn[]
  entryByDate: Map<string, JournalEntry>
  attachmentCountByEntryId: Map<string, number>
  selectedDate: string
  todoTitle: string
  onJournalModeChange: (mode: JournalMode) => void
  onFocusDate: (dateKey: string, nextView: ActiveView) => void
  onDeleteEntry: (entry: JournalEntry) => void
  onTodoTitleChange: (value: string) => void
  onAddTodo: (event: FormEvent<HTMLFormElement>) => void
  onToggleTodo: (todo: TodoItem) => void
  onDeleteTodo: (todo: TodoItem) => void
}

export function JournalView({
  journalMode,
  journalModes,
  entries,
  todos,
  filteredBoardTodos,
  currentStreak,
  pendingChangeCount,
  boardColumns,
  entryByDate,
  attachmentCountByEntryId,
  selectedDate,
  todoTitle,
  onJournalModeChange,
  onFocusDate,
  onDeleteEntry,
  onTodoTitleChange,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}: JournalViewProps) {
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false)
  const [dialogTodoDate, setDialogTodoDate] = useState(selectedDate)
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString())
  const yearOptions = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.dateKey.slice(0, 4)))]
        .sort((left, right) => right.localeCompare(left)),
    [entries],
  )
  const activeYear = yearOptions.includes(selectedYear) ? selectedYear : (yearOptions[0] ?? selectedYear)
  const yearEntries = useMemo(
    () => entries.filter((entry) => entry.dateKey.startsWith(activeYear)),
    [activeYear, entries],
  )
  const yearTodos = useMemo(
    () => todos.filter((todo) => todo.dateKey.startsWith(activeYear)),
    [activeYear, todos],
  )
  const yearHeatmapCells = useMemo(
    () => buildYearHeatmapCells(activeYear, entries, todos),
    [activeYear, entries, todos],
  )
  const yearAverageMood = average(yearEntries.map((entry) => entry.mood.score))
  const yearCompletionRate =
    yearTodos.length === 0 ? 0 : Math.round((yearTodos.filter((todo) => todo.done).length / yearTodos.length) * 100)

  const openTodoDialog = () => {
    setDialogTodoDate(selectedDate)
    setIsTodoDialogOpen(true)
  }

  const closeTodoDialog = () => {
    setIsTodoDialogOpen(false)
  }

  const handleDialogDateChange = (dateKey: string) => {
    setDialogTodoDate(dateKey)
    onFocusDate(dateKey, 'journal')
  }

  const handleDialogTodoSubmit = (event: FormEvent<HTMLFormElement>) => {
    onAddTodo(event)
    if (todoTitle.trim()) {
      closeTodoDialog()
    }
  }

  return (
    <section className="py-3 sm:py-5" aria-labelledby="journal-browser-title">
      <div className="mb-3 flex flex-col gap-3 md:mb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Journal Browser</p>
          <h2 className="section-title" id="journal-browser-title">
            日记浏览
          </h2>
          <p className="mt-1 hidden text-sm font-bold text-ink-400 md:block">用年度热力图回看长期节奏，并回到任意一天继续编辑。</p>
        </div>

        <div className="journal-control-bar">
          <div className="segmented-control" aria-label="日记浏览模式">
            {journalModes.map((mode) => (
              <button
                className={`segment ${journalMode === mode.id ? 'segment-active' : ''}`}
                type="button"
                key={mode.id}
                onClick={() => onJournalModeChange(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="secondary-metrics mb-5 md:grid-cols-5">
        {journalMode === 'entries' ? (
          <>
            <Metric label="日记总数" value={`${entries.length}`} />
            <Metric label={`${activeYear} 记录`} value={`${yearEntries.length}`} />
            <Metric label="年度均分" value={`${yearAverageMood || 0}`} />
            <Metric label="连续打卡" value={`${currentStreak} 天`} />
            <Metric label="未同步内容" value={`${pendingChangeCount}`} />
          </>
        ) : (
          <>
            <Metric label="事项总数" value={`${todos.length}`} />
            <Metric label="看板结果" value={`${filteredBoardTodos.length}`} />
            <Metric
              label="待推进"
              value={`${boardColumns[0].items.length + boardColumns[1].items.length + boardColumns[2].items.length}`}
            />
            <Metric label="今日收口" value={`${boardColumns[1].items.length}`} />
            <Metric label="已完成" value={`${boardColumns[3].items.length}`} />
          </>
        )}
      </div>

      {journalMode === 'entries' ? (
        <>
          <section className="section" aria-labelledby="year-heatmap-title">
            <div className="section-head">
              <div>
                <p className="eyebrow">Year Heatmap</p>
                <h3 className="section-title" id="year-heatmap-title">
                  年度心象
                </h3>
              </div>
              <label className="year-select">
                <span>年份</span>
                <select value={activeYear} onChange={(event) => setSelectedYear(event.target.value)}>
                  {yearOptions.length > 0 ? (
                    yearOptions.map((year) => (
                      <option value={year} key={year}>
                        {year}
                      </option>
                    ))
                  ) : (
                    <option value={activeYear}>{activeYear}</option>
                  )}
                </select>
              </label>
            </div>

            <div className="year-heatmap-shell">
              <div className="year-heatmap-weekdays" aria-hidden="true">
                {['一', '', '三', '', '五', '', '日'].map((weekday, index) => (
                  <span key={`${weekday}-${index}`}>{weekday}</span>
                ))}
              </div>
              <div className="year-heatmap-grid">
                {yearHeatmapCells.map((cell) => {
                  const doneCount = cell.todos.filter((todo) => todo.done).length
                  const label = cell.entry
                    ? `${cell.dateKey}，心象 ${cell.entry.mood.score}，Todo ${doneCount}/${cell.todos.length}`
                    : `${cell.dateKey}，未打卡`

                  return (
                    <button
                      className={`year-heatmap-cell heat-${getHeatLevel(cell.entry)} ${cell.inYear ? '' : 'year-heatmap-cell-muted'}`}
                      type="button"
                      key={cell.dateKey}
                      aria-label={label}
                      title={label}
                      onClick={() => onFocusDate(cell.dateKey, 'dashboard')}
                    />
                  )
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="pill min-h-8 text-xs">{yearEntries.length} 次打卡</span>
                <span className="pill min-h-8 text-xs">均分 {yearAverageMood || 0}</span>
                <span className="pill min-h-8 text-xs">事项完成 {yearCompletionRate}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-black text-ink-400" aria-label="年度热力图图例">
                <span>低</span>
                <i className="size-4 rounded border border-field-200 heat-empty" />
                <i className="size-4 rounded border border-field-200 heat-low" />
                <i className="size-4 rounded border border-field-200 heat-steady" />
                <i className="size-4 rounded border border-field-200 heat-good" />
                <i className="size-4 rounded border border-field-200 heat-bright" />
                <span>高</span>
              </div>
            </div>
          </section>

          <div className="journal-entry-list">
            {yearEntries.map((entry) => {
              const entryTodos = todos.filter((todo) => todo.dateKey === entry.dateKey)
              const entryAttachments = attachmentCountByEntryId.get(entry.id) ?? 0

              return (
                <article className="journal-entry-row" key={entry.id}>
                  <button className="journal-entry-main" type="button" onClick={() => onFocusDate(entry.dateKey, 'dashboard')}>
                    <div className="journal-entry-date">
                      <span>{entry.dateKey}</span>
                      <strong className={`score-${entry.mood.level}`}>{entry.mood.score}</strong>
                    </div>

                    <div className="min-w-0">
                      <h3 className="m-0 truncate text-base font-black text-ink-950">{entry.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm font-bold text-ink-600">{entry.moodText || entry.body || '没有正文'}</p>
                      <p className="mt-2 truncate text-xs font-bold text-ink-400">
                        {[entry.locationText, entry.weatherText].filter(Boolean).join(' · ') || '未记录位置与天气'}
                      </p>
                    </div>
                  </button>

                  <div className="journal-entry-meta">
                    <span className="pill min-h-7 text-xs">{entry.mood.quadrant}</span>
                    <span className="pill min-h-7 text-xs">
                      {entryTodos.filter((todo) => todo.done).length}/{entryTodos.length} 事项
                    </span>
                    <span className="pill min-h-7 text-xs">{entryAttachments} 图</span>
                    {entry.tags.slice(0, 4).map((tag) => (
                      <span className="pill min-h-7 text-xs" key={`${entry.id}-${tag}`}>
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="journal-entry-actions">
                    <button className="button-secondary min-h-9 px-3" type="button" onClick={() => onFocusDate(entry.dateKey, 'dashboard')}>
                      打开
                    </button>
                    <button className="icon-button" type="button" aria-label={`删除 ${entry.title}`} onClick={() => onDeleteEntry(entry)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {yearEntries.length === 0 && <p className="empty-state">这一年还没有日记记录。</p>}
        </>
      ) : (
        <>
          <section className="board-toolbar" aria-label="Todo 看板操作">
            <button className="button-primary w-fit" type="button" onClick={openTodoDialog}>
              <Plus size={18} aria-hidden="true" />
              添加
            </button>
          </section>

          <div className="board-grid">
            {boardColumns.map((column) => (
              <section className="board-column" aria-labelledby={`board-${column.id}`} key={column.id}>
                <div className="board-column-head">
                  <div>
                    <h3 className="board-column-title" id={`board-${column.id}`}>
                      {column.label}
                    </h3>
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
                          <button className="board-date-link" type="button" onClick={() => onFocusDate(todo.dateKey, 'dashboard')}>
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
                          <span className="pill min-h-7 text-xs">归属 {todo.dateKey}</span>
                          <span className="pill min-h-7 text-xs">{attachmentCount} 图</span>
                          <span className="pill min-h-7 text-xs">{todo.syncState === 'pending' ? '待同步' : '已同步'}</span>
                          {entry?.tags.slice(0, 3).map((tag) => (
                            <span className="pill min-h-7 text-xs" key={`${todo.id}-${tag}`}>
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="board-card-actions">
                          <button className="button-secondary min-h-9 px-3" type="button" onClick={() => onToggleTodo(todo)}>
                            {todo.done ? '撤回完成' : '标记完成'}
                          </button>
                          <button className="icon-button" type="button" aria-label={`删除 ${todo.title}`} onClick={() => onDeleteTodo(todo)}>
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

          {isTodoDialogOpen && (
            <div className="dialog-backdrop" role="presentation">
              <form className="todo-dialog" aria-labelledby="todo-dialog-title" onSubmit={handleDialogTodoSubmit}>
                <div className="section-head mb-3">
                  <div>
                    <p className="eyebrow">Todo</p>
                    <h3 className="section-title text-lg" id="todo-dialog-title">
                      添加事项
                    </h3>
                  </div>
                  <button className="icon-button" type="button" aria-label="关闭添加 Todo" onClick={closeTodoDialog}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                <div className="grid gap-3">
                  <label className="input-label">
                    <span>日期</span>
                    <input className="text-input" type="date" value={dialogTodoDate} onChange={(event) => handleDialogDateChange(event.target.value)} />
                  </label>
                  <label className="input-label">
                    <span>事项</span>
                    <input
                      className="text-input"
                      value={todoTitle}
                      onChange={(event) => onTodoTitleChange(event.target.value)}
                      placeholder="写下要推进的一件事"
                      autoFocus
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button className="button-secondary" type="button" onClick={closeTodoDialog}>
                    取消
                  </button>
                  <button className="button-primary" type="submit">
                    <Plus size={18} aria-hidden="true" />
                    添加
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  )
}
