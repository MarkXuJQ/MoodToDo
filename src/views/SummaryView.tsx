import type { FormEvent } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Plus, RefreshCw, Save, Settings2, Sparkles, Trash2 } from 'lucide-react'

import { DatePickerButton } from '../components/ui/date-picker-button'
import { Metric } from '../components/ui/stat-primitives'
import type { JournalEntry, TodoItem } from '../lib/db'
import type { CalendarCell } from '../types/app'

type SummaryViewProps = {
  visibleMonthLabel: string
  monthScore: number
  monthCheckinRate: number
  monthCompletionRate: number
  currentStreak: number
  longestStreak: number
  monthEntriesCount: number
  calendarCells: CalendarCell[]
  selectedDate: string
  selectedWeek: string
  selectedWeekScore: number
  selectedWeekEntryCount: number
  selectedWeekCompletionRate: number
  selectedWeekDays: string[]
  entries: JournalEntry[]
  todos: TodoItem[]
  aiConfigured: boolean
  aiModel: string
  canGenerateSummary: boolean
  isGeneratingSummary: boolean
  summaryDraft: string
  summaryError: string
  todoTitle: string
  onPreviousMonth: () => void
  onNextMonth: () => void
  onFocusDate: (dateKey: string) => void
  onSelectedWeekChange: (dateKey: string) => void
  onOpenAiSettings: () => void
  onGenerateSummary: () => void
  onSummaryDraftChange: (value: string) => void
  onSaveSummary: () => void
  onTodoTitleChange: (value: string) => void
  onAddTodo: (event: FormEvent<HTMLFormElement>) => void
  onToggleTodo: (todo: TodoItem) => void
  onDeleteTodo: (todo: TodoItem) => void
  getCompletionRate: (items: TodoItem[]) => number
  getHeatLevel: (entry?: JournalEntry) => string
}

export function SummaryView({
  visibleMonthLabel,
  monthScore,
  monthCheckinRate,
  monthCompletionRate,
  currentStreak,
  longestStreak,
  monthEntriesCount,
  calendarCells,
  selectedDate,
  selectedWeek,
  selectedWeekScore,
  selectedWeekEntryCount,
  selectedWeekCompletionRate,
  selectedWeekDays,
  entries,
  todos,
  aiConfigured,
  aiModel,
  canGenerateSummary,
  isGeneratingSummary,
  summaryDraft,
  summaryError,
  todoTitle,
  onPreviousMonth,
  onNextMonth,
  onFocusDate,
  onSelectedWeekChange,
  onOpenAiSettings,
  onGenerateSummary,
  onSummaryDraftChange,
  onSaveSummary,
  onTodoTitleChange,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  getCompletionRate,
  getHeatLevel,
}: SummaryViewProps) {
  const selectedDateTodos = [...todos]
    .filter((todo) => todo.dateKey === selectedDate)
    .sort((left, right) => Number(left.done) - Number(right.done) || right.createdAt.localeCompare(left.createdAt))
  const selectedDateEntry = entries.find((entry) => entry.dateKey === selectedDate)

  return (
    <section className="py-3 sm:py-5" aria-labelledby="summary-title">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Traceable Progress</p>
          <h2 className="section-title" id="summary-title">
            总结
          </h2>
        </div>

        <div className="month-switcher" aria-label="月份切换">
          <button className="icon-button" type="button" aria-label="上个月" onClick={onPreviousMonth}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <strong>{visibleMonthLabel}</strong>
          <button className="icon-button" type="button" aria-label="下个月" onClick={onNextMonth}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="summary-overview-metrics" aria-label="本月概况">
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
              <h2 className="section-title" id="calendar-title">
                心情日历
              </h2>
            </div>
            <span className="pill">{monthEntriesCount} 次打卡</span>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-2" aria-hidden="true">
            {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
              <span className="text-center text-xs font-black text-ink-400" key={weekday}>
                {weekday}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarCells.map((cell) => {
              const dayNumber = Number(cell.dateKey.slice(-2))
              const completion = getCompletionRate(cell.todos)

              return (
                <button
                  className={`calendar-heat-cell heat-${getHeatLevel(cell.entry)} ${cell.inMonth ? '' : 'calendar-heat-cell-muted'} ${cell.dateKey === selectedDate ? 'calendar-heat-cell-selected' : ''}`}
                  type="button"
                  key={cell.dateKey}
                  onClick={() => onFocusDate(cell.dateKey)}
                  aria-label={`${cell.dateKey}，${cell.entry ? `心象分 ${cell.entry.mood.score}` : '未打卡'}，完成率 ${completion}%`}
                >
                  <span className="text-xs font-black">{dayNumber}</span>
                  {cell.entry && <strong className="self-center text-lg font-black leading-none">{cell.entry.mood.score}</strong>}
                  {cell.todos.length > 0 && (
                    <small className="calendar-todo-chip">
                      {cell.todos.filter((todo) => todo.done).length}/{cell.todos.length}
                    </small>
                  )}
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
            <span>高</span>
          </div>

          <div className="calendar-day-todos" aria-labelledby="calendar-day-todos-title">
            <div className="section-head mb-3">
              <div>
                <p className="eyebrow">{selectedDate}</p>
                <h3 className="section-title text-lg" id="calendar-day-todos-title">
                  当日 Todo
                </h3>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <span className={`pill min-h-8 text-xs ${selectedDateEntry ? `score-${selectedDateEntry.mood.level}` : ''}`}>
                  {selectedDateEntry ? `心象 ${selectedDateEntry.mood.score}` : '未打卡'}
                </span>
                <span className="pill min-h-8 text-xs">{getCompletionRate(selectedDateTodos)}%</span>
              </div>
            </div>

            <form className="todo-capture-form" onSubmit={onAddTodo}>
              <input
                className="text-input"
                value={todoTitle}
                onChange={(event) => onTodoTitleChange(event.target.value)}
                placeholder="给这一天添加一个 Todo"
              />
              <button className="icon-button-solid" type="submit" aria-label="新增当日 Todo">
                <Plus size={20} aria-hidden="true" />
              </button>
            </form>

            <ul className="calendar-day-todo-list" aria-label={`${selectedDate} Todo 列表`}>
              {selectedDateTodos.map((todo) => (
                <li className="todo-row" key={todo.id}>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={todo.done ? '标记未完成' : '标记完成'}
                    onClick={() => onToggleTodo(todo)}
                  >
                    {todo.done ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                  </button>
                  <span className="todo-copy">
                    <strong className={`break-words ${todo.done ? 'todo-done' : ''}`}>{todo.title}</strong>
                    <small>{todo.dateKey}</small>
                  </span>
                  <button className="icon-button" type="button" aria-label={`删除 ${todo.title}`} onClick={() => onDeleteTodo(todo)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {selectedDateTodos.length === 0 && <p className="empty-state">这一天还没有 Todo，可以直接在这里补一条。</p>}
          </div>
        </section>

        <section className="section" aria-labelledby="week-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Weekly Review</p>
              <h2 className="section-title" id="week-title">
                一周回顾
              </h2>
            </div>

            <DatePickerButton
              className="summary-week-picker"
              label="周起点"
              value={selectedWeek}
              valueLabel={selectedWeek.replaceAll('-', '/')}
              onChange={onSelectedWeekChange}
              compact
            />
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Metric label="本周心象" value={`${selectedWeekScore || 0}`} />
            <Metric label="本周打卡" value={`${selectedWeekEntryCount}/7`} />
            <Metric label="事项完成" value={`${selectedWeekCompletionRate}%`} />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-7 lg:grid-cols-2 xl:grid-cols-7">
            {selectedWeekDays.map((dateKey) => {
              const entry = entries.find((item) => item.dateKey === dateKey)
              const dayItems = todos.filter((todo) => todo.dateKey === dateKey)

              return (
                <button
                  className="week-day-card"
                  type="button"
                  key={dateKey}
                  onClick={() => onFocusDate(dateKey)}
                >
                  <span className="text-xs font-black text-ink-950">{dateKey.slice(5)}</span>
                  <strong className="text-xl font-black leading-none text-ink-950">{entry?.mood.score ?? '-'}</strong>
                  <small className="truncate text-xs font-bold text-ink-400">{entry?.mood.quadrant ?? '未打卡'}</small>
                  <em className="truncate text-xs not-italic font-bold text-ink-400">
                    {dayItems.length ? `${dayItems.filter((todo) => todo.done).length}/${dayItems.length}` : '无事项'}
                  </em>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-field-200 bg-field-50 p-3 text-sm font-bold text-ink-600">
            <Settings2 size={17} aria-hidden="true" />
            <span className="truncate">{aiConfigured ? `${aiModel} 已配置` : '在设置页配置大模型 API 后可生成周总结'}</span>
            <button className="button-secondary min-h-9 px-3" type="button" onClick={onOpenAiSettings}>
              设置
            </button>
          </div>

          <div className="my-3 flex flex-wrap gap-3">
            <button className="button-primary" type="button" disabled={!canGenerateSummary || isGeneratingSummary} onClick={onGenerateSummary}>
              {isGeneratingSummary ? <RefreshCw size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
              {isGeneratingSummary ? '生成中' : '生成周总结'}
            </button>
            <button className="button-secondary" type="button" disabled={!summaryDraft.trim()} onClick={onSaveSummary}>
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
              onChange={(event) => onSummaryDraftChange(event.target.value)}
              placeholder={selectedWeekEntryCount ? '生成后可继续手动修改。' : '本周还没有打卡记录。'}
              rows={10}
            />
          </label>
        </section>
      </div>
    </section>
  )
}
