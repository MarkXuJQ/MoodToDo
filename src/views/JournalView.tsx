import { useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'

import { Metric } from '../components/ui/stat-primitives'
import type { JournalEntry, TodoItem } from '../lib/db'
import type { ActiveView } from '../types/app'
import { getJournalText } from '../utils/journal'

type YearHeatmapCell = {
  dateKey: string
  inYear: boolean
  entry?: JournalEntry
  todos: TodoItem[]
}

type JournalMonthGroup = {
  key: string
  label: string
  entries: JournalEntry[]
  averageMood: number
  attachmentCount: number
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

const getMonthLabel = (monthKey: string) => `${Number(monthKey.slice(5, 7))} 月`

const groupEntriesByMonth = (
  entries: JournalEntry[],
  attachmentCountByEntryId: Map<string, number>,
): JournalMonthGroup[] => {
  const groups = new Map<string, JournalEntry[]>()

  for (const entry of [...entries].sort((left, right) => right.dateKey.localeCompare(left.dateKey))) {
    const monthKey = entry.dateKey.slice(0, 7)
    groups.set(monthKey, [...(groups.get(monthKey) ?? []), entry])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([monthKey, monthEntries]) => ({
      key: monthKey,
      label: getMonthLabel(monthKey),
      entries: monthEntries,
      averageMood: average(monthEntries.map((entry) => entry.mood.score)),
      attachmentCount: monthEntries.reduce(
        (count, entry) => count + (attachmentCountByEntryId.get(entry.id) ?? 0),
        0,
      ),
    }))
}

type JournalViewProps = {
  entries: JournalEntry[]
  entriesTotal: number
  hasMoreEntries: boolean
  isLoadingMoreEntries: boolean
  todos: TodoItem[]
  currentStreak: number
  pendingChangeCount: number
  attachmentCountByEntryId: Map<string, number>
  onLoadMoreEntries: () => void
  onFocusDate: (dateKey: string, nextView: ActiveView) => void
  onDeleteEntry: (entry: JournalEntry) => void
}

export function JournalView({
  entries,
  entriesTotal,
  hasMoreEntries,
  isLoadingMoreEntries,
  todos,
  currentStreak,
  pendingChangeCount,
  attachmentCountByEntryId,
  onLoadMoreEntries,
  onFocusDate,
  onDeleteEntry,
}: JournalViewProps) {
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString())
  const [previewEntry, setPreviewEntry] = useState<JournalEntry | null>(null)
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
  const yearHeatmapCells = useMemo(
    () => buildYearHeatmapCells(activeYear, entries, todos),
    [activeYear, entries, todos],
  )
  const yearAverageMood = average(yearEntries.map((entry) => entry.mood.score))
  const journalMonthGroups = useMemo(
    () => groupEntriesByMonth(yearEntries, attachmentCountByEntryId),
    [attachmentCountByEntryId, yearEntries],
  )

  return (
    <section className="py-3 sm:py-5" aria-labelledby="journal-browser-title">
      <div className="mb-3 flex flex-col gap-3 md:mb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="section-title" id="journal-browser-title">
            日记浏览
          </h2>
        </div>
      </div>

      <div className="secondary-metrics mb-5 md:grid-cols-5">
        <Metric label="日记总数" value={`${entriesTotal}`} />
        <Metric label={`${activeYear} 记录`} value={`${yearEntries.length}`} />
        <Metric label="年度均分" value={`${yearAverageMood || 0}`} />
        <Metric label="连续打卡" value={`${currentStreak} 天`} />
        <Metric label="未同步内容" value={`${pendingChangeCount}`} />
      </div>

      <section className="section" aria-labelledby="year-heatmap-title">
        <div className="section-head">
          <div>
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
              const label = cell.entry ? `${cell.dateKey}，心象 ${cell.entry.mood.score}` : `${cell.dateKey}，未打卡`

              return (
                <button
                  className={`year-heatmap-cell heat-${getHeatLevel(cell.entry)} ${cell.inYear ? '' : 'year-heatmap-cell-muted'}`}
                  type="button"
                  key={cell.dateKey}
                  aria-label={label}
                  title={label}
                  onClick={() => (cell.entry ? setPreviewEntry(cell.entry) : onFocusDate(cell.dateKey, 'dashboard'))}
                />
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="pill min-h-8 text-xs">{yearEntries.length} 次打卡</span>
            <span className="pill min-h-8 text-xs">均分 {yearAverageMood || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-black text-ink-400" aria-label="年度热力图图例">
            <span>未打卡</span>
            <i className="size-4 rounded border border-field-200 heat-empty" />
            <i className="size-4 rounded border border-field-200 heat-low" />
            <i className="size-4 rounded border border-field-200 heat-stress" />
            <i className="size-4 rounded border border-field-200 heat-steady" />
            <i className="size-4 rounded border border-field-200 heat-good" />
            <i className="size-4 rounded border border-field-200 heat-bright" />
            <span>高</span>
          </div>
        </div>
      </section>

      <div className="journal-month-list">
        {journalMonthGroups.map((group) => (
          <section className="journal-month-section" aria-labelledby={`journal-month-${group.key}`} key={group.key}>
            <div className="journal-month-head">
              <div>
                <h3 id={`journal-month-${group.key}`}>{group.label}</h3>
                <p>
                  {group.entries.length} 篇 · 均分 {group.averageMood || 0}
                  {group.attachmentCount > 0 ? ` · ${group.attachmentCount} 图` : ''}
                </p>
              </div>
            </div>

            <div className="journal-month-grid">
              {group.entries.map((entry) => {
                const entryAttachments = attachmentCountByEntryId.get(entry.id) ?? 0

                return (
                  <article className="journal-entry-row" key={entry.id}>
                    <button className="journal-entry-main" type="button" onClick={() => setPreviewEntry(entry)}>
                      <div className="journal-entry-title-row">
                        <h4 className="m-0 min-w-0 truncate text-base font-black text-ink-950">{entry.title}</h4>
                        <strong className={`journal-entry-score score-${entry.mood.level}`}>{entry.mood.score}</strong>
                      </div>
                      <p className="m-0 line-clamp-2 text-sm font-bold text-ink-600">{getJournalText(entry) || '没有正文'}</p>
                    </button>

                    <div className="journal-entry-footer">
                      <span className="journal-entry-date">{entry.dateKey.slice(5).replace('-', '/')}</span>
                      <div className="journal-entry-meta">
                        {entryAttachments > 0 && <span className="pill min-h-7 text-xs">{entryAttachments} 图</span>}
                      </div>

                      <div className="journal-entry-actions">
                        <button className="icon-button" type="button" aria-label={`删除 ${entry.title}`} onClick={() => onDeleteEntry(entry)}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {yearEntries.length === 0 && <p className="empty-state">这一年还没有日记记录。</p>}

      {hasMoreEntries && (
        <div className="mt-4 flex justify-center">
          <button
            className="button-secondary min-h-10 px-4"
            type="button"
            disabled={isLoadingMoreEntries}
            onClick={onLoadMoreEntries}
          >
            {isLoadingMoreEntries ? '加载中…' : `加载更早日记（已加载 ${entries.length}/${entriesTotal}）`}
          </button>
        </div>
      )}

      {previewEntry && (
        <div className="dialog-backdrop" role="presentation">
          <section className="journal-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-dialog-title">
            <div className="section-head mb-3">
              <div>
                <p className="eyebrow">{previewEntry.dateKey}</p>
                <h3 className="section-title text-lg" id="journal-dialog-title">
                  {previewEntry.title}
                </h3>
              </div>
              <button className="icon-button" type="button" aria-label="关闭日记详情" onClick={() => setPreviewEntry(null)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="journal-dialog-score">
              <strong className={`score-${previewEntry.mood.level}`}>{previewEntry.mood.score}</strong>
              <span>心象分</span>
              {attachmentCountByEntryId.get(previewEntry.id) ? <small>{attachmentCountByEntryId.get(previewEntry.id)} 图</small> : null}
            </div>

            {getJournalText(previewEntry) && (
              <section className="journal-dialog-section">
                <h4>日记</h4>
                <p>{getJournalText(previewEntry)}</p>
              </section>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
