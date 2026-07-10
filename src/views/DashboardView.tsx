import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Bell, CheckCircle2, Circle, Clock3, ImagePlus, LocateFixed, Plus, Repeat2, Save, Trash2 } from 'lucide-react'

import { AttachmentThumb } from '../components/ui/attachment-thumb'
import { DatePickerButton } from '../components/ui/date-picker-button'
import { ImagePreviewDialog } from '../components/ui/image-preview-dialog'
import { ProgressRing, TrendChart, type TrendPoint } from '../components/ui/data-viz'
import { Metric } from '../components/ui/stat-primitives'
import { addDays } from '../lib/calendar'
import type { AttachmentRecord, JournalEntry, TodoItem } from '../lib/db'
import { analyzeMood } from '../lib/mood'
import type { DashboardMetricCard, DraftState, MoodBreakdownItem } from '../types/app'
import { formatCountdownDays, getCountdownDaysRemaining, getCountdownTone } from '../utils/countdown'
import { getTodoRepeatLabel } from '../utils/todo'

const getNearbyDateKeys = (dateKey: string) => [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((offset) => addDays(dateKey, offset))

const getDayLabel = (dateKey: string) => `${Number(dateKey.slice(8, 10))}号`

const getWeekdayLabel = (dateKey: string) => {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `周${weekdays[new Date(`${dateKey}T00:00:00`).getDay()]}`
}

const getMoodBreakdownColor = (id: string) => {
  const colors: Record<string, string> = {
    clarity: '#38bdf8',
    load: '#f01818',
    energy: '#ffe119',
    recovery: '#7cff5b',
    reflection: '#1746a2',
  }

  return colors[id] ?? '#176f66'
}

type DashboardViewProps = {
  selectedDate: string
  selectedDateLabel: string
  isToday: boolean
  visibleDashboardCards: DashboardMetricCard[]
  selectedEntry?: JournalEntry
  draft: DraftState
  pendingFiles: File[]
  selectedAttachments: AttachmentRecord[]
  canSave: boolean
  isSaving: boolean
  dayTodos: TodoItem[]
  todoTitle: string
  lastSevenAverage: number
  lastSevenEntryCount: number
  moodBreakdownItems: MoodBreakdownItem[]
  moodTrendPoints: TrendPoint[]
  selectedMoodTrendIndex?: number
  moodWindowAverage: number
  onDateChange: (dateKey: string) => void
  onGoToday: () => void
  onDraftChange: (key: keyof DraftState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onFilesChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onTodoTitleChange: (value: string) => void
  onAddTodo: (event: FormEvent<HTMLFormElement>) => void
  onToggleTodo: (todo: TodoItem) => void
  onDeleteTodo: (todo: TodoItem) => void
  onDeleteAttachment: (attachment: AttachmentRecord) => void
  onLoadAttachmentContent: (attachment: AttachmentRecord) => Promise<Blob>
  onRemovePendingFile: (index: number) => void
  getCompletionRate: (items: TodoItem[]) => number
}

export function DashboardView({
  selectedDate,
  selectedDateLabel,
  isToday,
  visibleDashboardCards,
  selectedEntry,
  draft,
  pendingFiles,
  selectedAttachments,
  canSave,
  isSaving,
  dayTodos,
  todoTitle,
  lastSevenAverage,
  lastSevenEntryCount,
  moodBreakdownItems,
  moodTrendPoints,
  selectedMoodTrendIndex,
  moodWindowAverage,
  onDateChange,
  onGoToday,
  onDraftChange,
  onFilesChange,
  onSave,
  onTodoTitleChange,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onDeleteAttachment,
  onLoadAttachmentContent,
  onRemovePendingFile,
  getCompletionRate,
}: DashboardViewProps) {
  const [previewImage, setPreviewImage] = useState<{ name: string; sourceUrl: string } | null>(null)
  const activeDateRef = useRef<HTMLButtonElement | null>(null)
  const journalMoodPreview = useMemo(
    () => (draft.journal.trim() ? analyzeMood(draft.journal) : null),
    [draft.journal],
  )
  const heroMoodScore = selectedEntry?.mood.score ?? lastSevenAverage
  const heroMoodColor =
    heroMoodScore >= 82
      ? '#ffe119'
      : heroMoodScore >= 66
        ? '#25e64f'
        : heroMoodScore >= 50
          ? '#17d4c2'
          : heroMoodScore >= 35
            ? '#ff8a00'
            : '#f01818'
  const hasMoodData = Boolean(selectedEntry) || lastSevenEntryCount > 0

  useEffect(
    () => () => {
      if (previewImage?.sourceUrl) {
        URL.revokeObjectURL(previewImage.sourceUrl)
      }
    },
    [previewImage],
  )

  const openImagePreview = (name: string, source: Blob) => {
    setPreviewImage((current) => {
      if (current?.sourceUrl) {
        URL.revokeObjectURL(current.sourceUrl)
      }

      return {
        name,
        sourceUrl: URL.createObjectURL(source),
      }
    })
  }

  const closeImagePreview = () => {
    setPreviewImage((current) => {
      if (current?.sourceUrl) {
        URL.revokeObjectURL(current.sourceUrl)
      }

      return null
    })
  }
  const nearbyDateKeys = getNearbyDateKeys(selectedDate)

  useEffect(() => {
    activeDateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selectedDate])

  return (
    <section className="py-3 sm:py-5" aria-labelledby="dashboard-title">
      <h1 className="sr-only" id="dashboard-title">
        今日台
      </h1>

      <section className="toolbar dashboard-desktop-summary" aria-label="日期选择">
        <DatePickerButton
          className="dashboard-date-picker"
          label="记录日期"
          value={selectedDate}
          valueLabel={selectedDate.replaceAll('-', '/')}
          onChange={onDateChange}
        />
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

      <div className="dashboard-layout-grid">
        <section className="section dashboard-mood-panel" aria-labelledby="stats-title">
          <div className="section-head">
            <div>
              <h2 className="section-title" id="stats-title">
                心象分
              </h2>
            </div>
            <button className="dashboard-inline-today-button" type="button" onClick={onGoToday} disabled={isToday}>
              <LocateFixed size={15} aria-hidden="true" />
              {isToday ? '今天' : '回到今天'}
            </button>
          </div>

          {hasMoodData ? (
            <div className="dashboard-mood-hero">
              <div className="mood-ring-stack">
                <ProgressRing
                  value={heroMoodScore}
                  max={100}
                  color={heroMoodColor}
                  valueText={`${heroMoodScore || 0}`}
                  size={156}
                />
                <div className="mood-ring-caption">
                  <span>{selectedEntry ? '当日心象' : '最近均分'}</span>
                  <strong>{selectedEntry?.mood.level ?? '最近趋势'}</strong>
                  <small>{selectedEntry ? selectedDateLabel : `来自最近 ${lastSevenEntryCount} 条心情记录`}</small>
                </div>
              </div>

              <div className="dashboard-date-wheel" aria-label="附近日期">
                <div className="dashboard-date-track">
                  {nearbyDateKeys.map((dateKey, index) => {
                    const isSelected = dateKey === selectedDate
                    const offset = index - 4

                    return (
                      <button
                        className={`dashboard-date-chip ${isSelected ? 'dashboard-date-chip-active' : ''}`}
                        type="button"
                        key={dateKey}
                        aria-current={isSelected ? 'date' : undefined}
                        data-offset={Math.max(-4, Math.min(4, offset))}
                        ref={isSelected ? activeDateRef : undefined}
                        onClick={() => onDateChange(dateKey)}
                      >
                        <span>{getWeekdayLabel(dateKey)}</span>
                        <strong>{getDayLabel(dateKey)}</strong>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <p className="empty-state">保存第一条日记后生成心象分。</p>
          )}
        </section>

        <section className="section dashboard-mood-details" aria-labelledby="mood-details-title">
          {lastSevenEntryCount > 0 ? (
            <>
              <div className="section-head dashboard-details-head">
                <div>
                  <h2 className="section-title" id="mood-details-title">
                    最近心象
                  </h2>
                </div>
                <span className="pill">均分 {lastSevenAverage || 0}</span>
              </div>

              <div className="dashboard-mood-overview">
                <div className="mood-breakdown-list" aria-label="心象维度拆解">
                  {moodBreakdownItems.map((item) => (
                    <div className="mood-breakdown-row" key={item.id}>
                      <span className="mood-breakdown-swatch" style={{ backgroundColor: getMoodBreakdownColor(item.id) }} aria-hidden="true" />
                      <div className="mood-breakdown-copy">
                        <span>{item.label}</span>
                      </div>
                      <div className="mood-breakdown-meter" aria-label={`${item.label} ${item.value}`}>
                        <i
                          style={{
                            width: `${Math.max(0, Math.min(100, item.value))}%`,
                            backgroundColor: getMoodBreakdownColor(item.id),
                          }}
                        />
                      </div>
                      <strong style={{ color: getMoodBreakdownColor(item.id) }}>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dashboard-mood-trend" aria-labelledby="mood-trend-title">
                <div className="mood-trend-head">
                  <div>
                    <h3 className="section-title text-lg" id="mood-trend-title">
                      心情折线
                    </h3>
                  </div>
                </div>

                <TrendChart
                  points={moodTrendPoints}
                  stroke="#176f66"
                  fill="#176f66"
                  min={0}
                  max={100}
                  emphasisIndex={selectedMoodTrendIndex}
                  valueSuffix=""
                />

                <div className="mini-metrics mt-4">
                  <Metric label="窗口均值" value={`${moodWindowAverage || 0}`} />
                  <Metric label="已记录天数" value={`${moodTrendPoints.filter((point) => point.value != null).length}/${moodTrendPoints.length}`} />
                  <Metric label="当前日期" value={`${selectedEntry?.mood.score ?? '-'}`} tone={selectedEntry ? `score-${selectedEntry.mood.level}` : ''} />
                </div>
              </div>
            </>
          ) : (
            <p className="empty-state">暂无心象分析。</p>
          )}
        </section>

        <div className="dashboard-right-column">
          <section className="section dashboard-todo-panel" aria-labelledby="todo-title">
            <div className="section-head">
              <div>
                <h2 className="section-title" id="todo-title">
                  今日事项
                </h2>
              </div>
              <span className="pill">{getCompletionRate(dayTodos)}%</span>
            </div>

            <form className="todo-capture-form" onSubmit={onAddTodo}>
              <input className="text-input" value={todoTitle} onChange={(event) => onTodoTitleChange(event.target.value)} placeholder="新增一个事项" />
              <button className="icon-button-solid" type="submit" aria-label="新增事项">
                <Plus size={20} aria-hidden="true" />
              </button>
            </form>

            <ul className="m-0 grid list-none p-0">
              {dayTodos.map((todo) => {
                const countdownDays = todo.countdownEnabled ? getCountdownDaysRemaining(todo.dateKey) : null

                return (
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
                      <small>
                        {todo.dateKey}
                        {todo.repeatFrequency !== 'none' && (
                          <span className="todo-inline-meta">
                            <Repeat2 size={12} aria-hidden="true" />
                            {getTodoRepeatLabel(todo.repeatFrequency)}
                          </span>
                        )}
                        {todo.reminderEnabled && (
                          <span className="todo-inline-meta">
                            <Bell size={12} aria-hidden="true" />
                            {todo.reminderTime}
                          </span>
                        )}
                        {countdownDays != null && (
                          <span className={`todo-inline-countdown ${getCountdownTone(countdownDays)}`}>
                            <Clock3 size={12} aria-hidden="true" />
                            {todo.done ? '已完成' : formatCountdownDays(countdownDays)}
                          </span>
                        )}
                      </small>
                    </span>
                    <button className="icon-button" type="button" aria-label={`删除 ${todo.title}`} onClick={() => onDeleteTodo(todo)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>

            {dayTodos.length === 0 && <p className="empty-state">今天还没有事项。</p>}
          </section>

          <section className="section dashboard-journal-panel" aria-labelledby="journal-title">
            <div className="section-head">
              <div>
                <h2 className="section-title" id="journal-title">
                  今日记录
                </h2>
                <div className="mobile-date-actions">
                  <DatePickerButton
                    className="mobile-date-picker"
                    label="日期"
                    value={selectedDate}
                    valueLabel={selectedDateLabel}
                    onChange={onDateChange}
                    compact
                  />
                </div>
              </div>
              <span className={`pill score-${selectedEntry?.mood.level ?? '平稳'}`}>{selectedEntry?.mood.level ?? '未记录'}</span>
            </div>

            <form className="grid gap-3" onSubmit={onSave}>
              <label className="input-label">
                <span>标题</span>
                <input className="text-input" value={draft.title} onChange={onDraftChange('title')} placeholder="今天的主线" />
              </label>
              <label className="input-label">
                <span>日记</span>
                <textarea
                  className="text-area min-h-64"
                  value={draft.journal}
                  onChange={onDraftChange('journal')}
                  placeholder="今天发生了什么？"
                  rows={11}
                />
                {journalMoodPreview ? (
                  <span className="journal-mood-preview" aria-live="polite">
                    <span>预计心象</span>
                    <strong className={`score-${journalMoodPreview.level}`}>{journalMoodPreview.score}</strong>
                    <span>{journalMoodPreview.level}</span>
                    <span>{journalMoodPreview.quadrant}</span>
                    <small>线索可信度 {journalMoodPreview.confidence}%</small>
                  </span>
                ) : null}
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <label className="button-secondary relative overflow-hidden">
                  <ImagePlus size={18} aria-hidden="true" />
                  添加图片
                  <input className="absolute inset-0 cursor-pointer opacity-0" accept="image/*" multiple type="file" onChange={onFilesChange} />
                </label>
                <button className="button-primary" type="submit" disabled={!canSave || isSaving}>
                  <Save size={18} aria-hidden="true" />
                  {isSaving ? '保存中' : '保存'}
                </button>
              </div>
            </form>

            {(pendingFiles.length > 0 || selectedAttachments.length > 0) && (
              <div className="mt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="m-0 text-sm font-black text-ink-600">图片附件</p>
                  <small className="text-xs font-bold text-ink-400">
                    待保存 {pendingFiles.length} · 已入库 {selectedAttachments.length}
                  </small>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3" aria-label="图片附件">
                  {pendingFiles.map((file, index) => (
                    <AttachmentThumb
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      name={file.name}
                      size={file.size}
                      type={file.type}
                      source={file}
                      badge="待保存"
                      onPreview={file.type.startsWith('image/') ? (source) => openImagePreview(file.name, source) : undefined}
                      onDelete={() => onRemovePendingFile(index)}
                    />
                  ))}
                  {selectedAttachments.map((attachment) => (
                    <AttachmentThumb
                      key={attachment.id}
                      name={attachment.name}
                      size={attachment.size}
                      type={attachment.type}
                      source={attachment.blob}
                      loadSource={() => onLoadAttachmentContent(attachment)}
                      badge="已保存"
                      onPreview={
                        attachment.type.startsWith('image/')
                          ? (source) => openImagePreview(attachment.name, source)
                          : undefined
                      }
                      onDelete={() => onDeleteAttachment(attachment)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {previewImage && (
        <ImagePreviewDialog name={previewImage.name} sourceUrl={previewImage.sourceUrl} onClose={closeImagePreview} />
      )}
    </section>
  )
}
