import type { FormEvent } from 'react'
import { CalendarDays, Check, Plus, Search, Square, Trash2 } from 'lucide-react'

import { Metric } from '../components/ui/stat-primitives'
import type { JournalEntry, TodoItem } from '../lib/db'
import type { ActiveView, JournalMode, JournalModeOption } from '../types/app'

type BoardColumn = {
  id: string
  label: string
  note: string
  items: TodoItem[]
}

type JournalViewProps = {
  journalMode: JournalMode
  journalModes: JournalModeOption[]
  journalSearch: string
  journalFilterMonth: string
  journalFilterMood: string
  journalFilterTag: string
  journalMonthOptions: string[]
  journalMoodOptions: string[]
  journalTagOptions: string[]
  selectedEntryIds: string[]
  entries: JournalEntry[]
  filteredEntries: JournalEntry[]
  todos: TodoItem[]
  filteredBoardTodos: TodoItem[]
  latestEntry?: JournalEntry
  currentStreak: number
  pendingChangeCount: number
  boardColumns: BoardColumn[]
  entryByDate: Map<string, JournalEntry>
  attachmentCountByEntryId: Map<string, number>
  selectedDate: string
  todoTitle: string
  onJournalModeChange: (mode: JournalMode) => void
  onJournalSearchChange: (value: string) => void
  onJournalFilterMonthChange: (value: string) => void
  onJournalFilterMoodChange: (value: string) => void
  onJournalFilterTagChange: (value: string) => void
  onFocusDate: (dateKey: string, nextView: ActiveView) => void
  onToggleEntrySelection: (entryId: string) => void
  onSelectAllFilteredEntries: () => void
  onClearSelectedEntries: () => void
  onDeleteEntry: (entry: JournalEntry) => void
  onDeleteSelectedEntries: () => void
  onTodoTitleChange: (value: string) => void
  onAddTodo: (event: FormEvent<HTMLFormElement>) => void
  onToggleTodo: (todo: TodoItem) => void
  onDeleteTodo: (todo: TodoItem) => void
}

export function JournalView({
  journalMode,
  journalModes,
  journalSearch,
  journalFilterMonth,
  journalFilterMood,
  journalFilterTag,
  journalMonthOptions,
  journalMoodOptions,
  journalTagOptions,
  selectedEntryIds,
  entries,
  filteredEntries,
  todos,
  filteredBoardTodos,
  latestEntry,
  currentStreak,
  pendingChangeCount,
  boardColumns,
  entryByDate,
  attachmentCountByEntryId,
  selectedDate,
  todoTitle,
  onJournalModeChange,
  onJournalSearchChange,
  onJournalFilterMonthChange,
  onJournalFilterMoodChange,
  onJournalFilterTagChange,
  onFocusDate,
  onToggleEntrySelection,
  onSelectAllFilteredEntries,
  onClearSelectedEntries,
  onDeleteEntry,
  onDeleteSelectedEntries,
  onTodoTitleChange,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}: JournalViewProps) {
  return (
    <section className="py-3 sm:py-5" aria-labelledby="journal-browser-title">
      <div className="mb-3 flex flex-col gap-3 md:mb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Journal Browser</p>
          <h2 className="section-title" id="journal-browser-title">
            日记浏览
          </h2>
          <p className="mt-1 hidden text-sm font-bold text-ink-400 md:block">支持筛选、批量管理和回到任意一天继续编辑。</p>
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

          <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-field-200 bg-white px-3 md:w-[min(440px,100%)]">
            <Search size={18} aria-hidden="true" />
            <input
              className="min-h-10 flex-1 border-0 bg-transparent p-0 outline-none"
              value={journalSearch}
              onChange={(event) => onJournalSearchChange(event.target.value)}
              placeholder={journalMode === 'entries' ? '搜索标题、正文、心情、天气、标签' : '搜索 Todo、日期、关联日记'}
            />
          </label>
        </div>
      </div>

      <div className="secondary-metrics mb-5 md:grid-cols-5">
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
          <div className="journal-filter-bar">
            <select className="select-input" value={journalFilterMonth} onChange={(event) => onJournalFilterMonthChange(event.target.value)}>
              <option value="all">全部月份</option>
              {journalMonthOptions.map((monthKey) => (
                <option value={monthKey} key={monthKey}>
                  {monthKey}
                </option>
              ))}
            </select>
            <select className="select-input" value={journalFilterMood} onChange={(event) => onJournalFilterMoodChange(event.target.value)}>
              <option value="all">全部心象等级</option>
              {journalMoodOptions.map((level) => (
                <option value={level} key={level}>
                  {level}
                </option>
              ))}
            </select>
            <select className="select-input" value={journalFilterTag} onChange={(event) => onJournalFilterTagChange(event.target.value)}>
              <option value="all">全部标签</option>
              {journalTagOptions.map((tag) => (
                <option value={tag} key={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </div>

          <div className="journal-batchbar">
            <div className="journal-batch-copy">
              <strong>{selectedEntryIds.length} 条已选</strong>
              <span>{filteredEntries.length} 条当前结果</span>
            </div>
            <div className="journal-batch-actions">
              <button className="button-secondary min-h-9 px-3" type="button" onClick={onSelectAllFilteredEntries}>
                全选当前结果
              </button>
              <button className="button-secondary min-h-9 px-3" type="button" onClick={onClearSelectedEntries} disabled={selectedEntryIds.length === 0}>
                清空选择
              </button>
              <button className="button-secondary min-h-9 px-3 text-coral-500" type="button" onClick={onDeleteSelectedEntries} disabled={selectedEntryIds.length === 0}>
                <Trash2 size={16} aria-hidden="true" />
                删除已选
              </button>
            </div>
          </div>

          <div className="journal-entry-list">
            {filteredEntries.map((entry) => {
              const entryTodos = todos.filter((todo) => todo.dateKey === entry.dateKey)
              const entryAttachments = attachmentCountByEntryId.get(entry.id) ?? 0
              const isSelected = selectedEntryIds.includes(entry.id)

              return (
                <article className={`journal-entry-row ${isSelected ? 'journal-entry-row-active' : ''}`} key={entry.id}>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={isSelected ? `取消选择 ${entry.title}` : `选择 ${entry.title}`}
                    onClick={() => onToggleEntrySelection(entry.id)}
                  >
                    {isSelected ? <Check size={18} aria-hidden="true" /> : <Square size={18} aria-hidden="true" />}
                  </button>

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

          {filteredEntries.length === 0 && <p className="empty-state">当前筛选条件下还没有匹配的日记。</p>}
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
                onChange={(event) => onFocusDate(event.target.value, 'journal')}
              />
            </label>

            <form className="board-capture" onSubmit={onAddTodo}>
              <input
                className="text-input"
                value={todoTitle}
                onChange={(event) => onTodoTitleChange(event.target.value)}
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
        </>
      )}
    </section>
  )
}
