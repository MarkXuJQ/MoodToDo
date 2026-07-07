import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { CalendarDays, CheckCircle2, Circle, ImagePlus, Plus, Save, Trash2, TrendingUp } from 'lucide-react'

import { AttachmentThumb } from '../components/ui/attachment-thumb'
import { ImagePreviewDialog } from '../components/ui/image-preview-dialog'
import { ProgressRing, TrendChart, type TrendPoint } from '../components/ui/data-viz'
import { Metric, ProgressBar } from '../components/ui/stat-primitives'
import type { AttachmentRecord, JournalEntry, MetricDefinition, MetricRecord, TodoItem } from '../lib/db'
import type { DraftState, MetricDraftState } from '../types/app'

type DashboardMetricCard = {
  id: string
  label: string
  value: string
  tone?: string
}

type DashboardMetricRow = {
  metricDefinition: MetricDefinition
  latestRecord?: MetricRecord
  selectedDateRecord?: MetricRecord
  scaleMax: number
  points: TrendPoint[]
}

type DashboardViewProps = {
  selectedDate: string
  selectedDateLabel: string
  todayKey: string
  visibleDashboardCards: DashboardMetricCard[]
  writeError: string
  selectedEntry?: JournalEntry
  selectedEntryContextText: string
  draft: DraftState
  pendingFiles: File[]
  selectedAttachments: AttachmentRecord[]
  canSave: boolean
  isSaving: boolean
  dayTodos: TodoItem[]
  todoTitle: string
  ringEntry?: JournalEntry
  lastSevenAverage: number
  completionRate: number
  entryCount: number
  moodTrendPoints: TrendPoint[]
  selectedMoodTrendIndex?: number
  trendStartLabel: string
  trendEndLabel: string
  moodWindowAverage: number
  metricDraft: MetricDraftState
  metricRows: DashboardMetricRow[]
  metricValueDrafts: Record<string, string>
  selectedMetricId: string
  selectedMetricDefinition?: MetricDefinition
  selectedMetricCurrentRecord?: MetricRecord
  selectedMetricLatestRecord?: MetricRecord
  selectedMetricScaleMax: number
  onDateChange: (dateKey: string) => void
  onDraftChange: (key: keyof DraftState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onFilesChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onTodoTitleChange: (value: string) => void
  onAddTodo: (event: FormEvent<HTMLFormElement>) => void
  onToggleTodo: (todo: TodoItem) => void
  onDeleteTodo: (todo: TodoItem) => void
  onDeleteAttachment: (attachment: AttachmentRecord) => void
  onRemovePendingFile: (index: number) => void
  getCompletionRate: (items: TodoItem[]) => number
  getSignalValue: (signals: JournalEntry['mood']['signals'], key: keyof JournalEntry['mood']['signals']) => number
  onMetricDraftChange: (key: keyof MetricDraftState) => (event: ChangeEvent<HTMLInputElement>) => void
  onSaveMetricDefinition: (event: FormEvent<HTMLFormElement>) => void
  onResetMetricDraft: () => void
  onEditMetricDefinition: (metricDefinition: MetricDefinition) => void
  onDeleteMetricDefinition: (metricDefinition: MetricDefinition) => void
  onMetricValueDraftChange: (metricId: string) => (event: ChangeEvent<HTMLInputElement>) => void
  onSaveMetricRecord: (metricDefinition: MetricDefinition) => void
  onSelectMetricId: (metricId: string) => void
  formatMetricValue: (value: number | null | undefined, unit: string) => string
}

export function DashboardView({
  selectedDate,
  selectedDateLabel,
  todayKey,
  visibleDashboardCards,
  writeError,
  selectedEntry,
  selectedEntryContextText,
  draft,
  pendingFiles,
  selectedAttachments,
  canSave,
  isSaving,
  dayTodos,
  todoTitle,
  ringEntry,
  lastSevenAverage,
  completionRate,
  entryCount,
  moodTrendPoints,
  selectedMoodTrendIndex,
  trendStartLabel,
  trendEndLabel,
  moodWindowAverage,
  metricDraft,
  metricRows,
  metricValueDrafts,
  selectedMetricId,
  selectedMetricDefinition,
  selectedMetricCurrentRecord,
  selectedMetricLatestRecord,
  selectedMetricScaleMax,
  onDateChange,
  onDraftChange,
  onFilesChange,
  onSave,
  onTodoTitleChange,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onDeleteAttachment,
  onRemovePendingFile,
  getCompletionRate,
  getSignalValue,
  onMetricDraftChange,
  onSaveMetricDefinition,
  onResetMetricDraft,
  onEditMetricDefinition,
  onDeleteMetricDefinition,
  onMetricValueDraftChange,
  onSaveMetricRecord,
  onSelectMetricId,
  formatMetricValue,
}: DashboardViewProps) {
  const [previewImage, setPreviewImage] = useState<{ name: string; sourceUrl: string } | null>(null)

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

  return (
    <section className="py-3 sm:py-5" aria-labelledby="dashboard-title">
      <h1 className="sr-only" id="dashboard-title">
        今日台
      </h1>

      <section className="toolbar dashboard-desktop-summary" aria-label="日期选择">
        <label className="field-line">
          <CalendarDays size={18} aria-hidden="true" />
          <input
            className="min-h-10 border-0 bg-transparent p-0 font-black text-ink-950 outline-none"
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
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
              <p className="eyebrow">{selectedDateLabel}</p>
              <h2 className="section-title" id="journal-title">
                今日记录
              </h2>
              <label className="mobile-date-control">
                <span>日期</span>
                <input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
              </label>
            </div>
            <span className={`pill score-${selectedEntry?.mood.level ?? '平稳'}`}>{selectedEntry?.mood.level ?? '未记录'}</span>
          </div>

          <div className="context-strip">
            <span className="context-label">环境</span>
            <strong>{selectedEntryContextText}</strong>
          </div>

          <section className="mobile-todo-panel" aria-labelledby="mobile-todo-title">
            <div className="mobile-panel-head">
              <div>
                <p className="eyebrow">Todo</p>
                <h3 className="mobile-panel-title" id="mobile-todo-title">
                  今日事项
                </h3>
              </div>
              <span className="pill min-h-8 text-xs">{getCompletionRate(dayTodos)}%</span>
            </div>

            <form className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={onAddTodo}>
              <input className="text-input" value={todoTitle} onChange={(event) => onTodoTitleChange(event.target.value)} placeholder="新增一个事项" />
              <button className="icon-button-solid" type="submit" aria-label="新增事项">
                <Plus size={20} aria-hidden="true" />
              </button>
            </form>

            <ul className="mobile-todo-list" aria-label="今日事项列表">
              {dayTodos.map((todo) => (
                <li className="todo-row" key={todo.id}>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={todo.done ? '标记未完成' : '标记完成'}
                    onClick={() => onToggleTodo(todo)}
                  >
                    {todo.done ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                  </button>
                  <span className={`break-words font-bold text-ink-950 ${todo.done ? 'todo-done' : ''}`}>{todo.title}</span>
                  <button className="icon-button" type="button" aria-label={`删除 ${todo.title}`} onClick={() => onDeleteTodo(todo)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {dayTodos.length === 0 && <p className="empty-state">今天还没有事项。</p>}
          </section>

          <form className="grid gap-3" onSubmit={onSave}>
            <label className="input-label">
              <span>标题</span>
              <input className="text-input" value={draft.title} onChange={onDraftChange('title')} placeholder="今天的主线" />
            </label>
            <label className="input-label">
              <span>心情描述</span>
              <textarea
                className="text-area"
                value={draft.moodText}
                onChange={onDraftChange('moodText')}
                placeholder="比如：上午焦虑但有推进，下午散步后恢复专注"
                rows={4}
              />
            </label>
            <label className="input-label">
              <span>打卡日记</span>
              <textarea
                className="text-area min-h-44"
                value={draft.body}
                onChange={onDraftChange('body')}
                placeholder="完成了什么，卡在哪里，下一步是什么"
                rows={7}
              />
            </label>
            <label className="input-label">
              <span>标签</span>
              <input className="text-input" value={draft.tags} onChange={onDraftChange('tags')} placeholder="工作 健康 学习" />
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
                    onPreview={file.type.startsWith('image/') ? () => openImagePreview(file.name, file) : undefined}
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
                  badge="已保存"
                  onPreview={
                    attachment.type.startsWith('image/')
                      ? () => openImagePreview(attachment.name, attachment.blob)
                      : undefined
                  }
                  onDelete={() => onDeleteAttachment(attachment)}
                />
              ))}
            </div>
            </div>
          )}
        </section>

        <div className="side-stack">
          <section className="section dashboard-todo-panel" aria-labelledby="todo-title">
            <div className="section-head">
              <div>
                <p className="eyebrow">Todo</p>
                <h2 className="section-title" id="todo-title">
                  今日事项
                </h2>
              </div>
              <span className="pill">{getCompletionRate(dayTodos)}%</span>
            </div>

            <form className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={onAddTodo}>
              <input className="text-input" value={todoTitle} onChange={(event) => onTodoTitleChange(event.target.value)} placeholder="新增一个事项" />
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
                    onClick={() => onToggleTodo(todo)}
                  >
                    {todo.done ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                  </button>
                  <span className={`break-words font-bold text-ink-950 ${todo.done ? 'todo-done' : ''}`}>{todo.title}</span>
                  <button className="icon-button" type="button" aria-label={`删除 ${todo.title}`} onClick={() => onDeleteTodo(todo)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {dayTodos.length === 0 && <p className="empty-state">今天还没有事项。</p>}
          </section>

          <section className="section dashboard-side-insight" aria-labelledby="stats-title">
            <div className="section-head">
              <div>
                <p className="eyebrow">Mood Space</p>
                <h2 className="section-title" id="stats-title">
                  心象分
                </h2>
              </div>
              <span className="section-icon">
                <TrendingUp size={22} aria-hidden="true" />
              </span>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <Metric label="最近 7 次均值" value={`${lastSevenAverage || 0}`} />
              <Metric label="总完成率" value={`${completionRate}%`} />
              <Metric label="记录天数" value={`${entryCount}`} />
            </div>

            {ringEntry ? (
              <div className="grid gap-4">
                <ProgressRing
                  value={ringEntry.mood.score}
                  max={100}
                  color={
                    ringEntry.mood.score >= 82
                      ? '#7357ad'
                      : ringEntry.mood.score >= 66
                        ? '#176f66'
                        : ringEntry.mood.score >= 50
                          ? '#3b68ae'
                          : ringEntry.mood.score >= 35
                            ? '#c68b20'
                            : '#bd4f3d'
                  }
                  label={ringEntry.mood.level}
                  valueText={`${ringEntry.mood.score}`}
                  caption={ringEntry.dateKey === selectedDate ? '当前日期' : ringEntry.dateKey}
                />
                <div className="grid gap-3">
                  <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-field-200 bg-field-50 px-3">
                    <span className="text-xs font-black text-ink-400">象限</span>
                    <strong className="truncate text-sm font-black text-ink-950">{ringEntry.mood.quadrant}</strong>
                  </div>
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs font-black text-ink-600">
                    <span>晴朗度</span>
                    <ProgressBar value={getSignalValue(ringEntry.mood.signals, 'clarity')} tone="clarity" />
                    <span>负荷度</span>
                    <ProgressBar value={getSignalValue(ringEntry.mood.signals, 'load')} tone="load" />
                    <span>能量感</span>
                    <ProgressBar value={getSignalValue(ringEntry.mood.signals, 'energy')} tone="energy" />
                    <span>修复感</span>
                    <ProgressBar value={getSignalValue(ringEntry.mood.signals, 'recovery')} tone="recovery" />
                    <span>反思度</span>
                    <ProgressBar value={getSignalValue(ringEntry.mood.signals, 'reflection')} tone="reflection" />
                  </div>
                </div>
                <p className="note">{ringEntry.mood.reviewHint}</p>
              </div>
            ) : (
              <p className="empty-state">保存第一条日记后生成心象分。</p>
            )}
          </section>
        </div>
      </div>

      <div className="dashboard-visual-grid">
        <section className="section" aria-labelledby="mood-trend-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Mood Trend</p>
              <h2 className="section-title" id="mood-trend-title">
                心情折线
              </h2>
            </div>
            <span className="pill">
              {trendStartLabel} - {trendEndLabel}
            </span>
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
        </section>

        <section className="section" aria-labelledby="metric-trend-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Custom Metrics</p>
              <h2 className="section-title" id="metric-trend-title">
                量化事项
              </h2>
            </div>
            <span className="pill">{selectedDateLabel}</span>
          </div>

          <form className="metric-form-grid" onSubmit={onSaveMetricDefinition}>
            <label className="input-label">
              <span>名称</span>
              <input className="text-input" value={metricDraft.name} onChange={onMetricDraftChange('name')} placeholder="比如：跑步、深度工作、饮水" />
            </label>
            <label className="input-label">
              <span>单位</span>
              <input className="text-input" value={metricDraft.unit} onChange={onMetricDraftChange('unit')} placeholder="km、h、杯" />
            </label>
            <label className="input-label">
              <span>目标值</span>
              <input className="text-input" type="number" inputMode="decimal" value={metricDraft.targetValue} onChange={onMetricDraftChange('targetValue')} placeholder="可选" />
            </label>
            <label className="input-label">
              <span>颜色</span>
              <input className="color-input" type="color" value={metricDraft.color} onChange={onMetricDraftChange('color')} />
            </label>
            <div className="metric-form-actions">
              <button className="button-primary" type="submit">
                <Save size={18} aria-hidden="true" />
                {metricDraft.id ? '更新指标' : '新增指标'}
              </button>
              {metricDraft.id && (
                <button className="button-secondary" type="button" onClick={onResetMetricDraft}>
                  取消编辑
                </button>
              )}
            </div>
          </form>

          <div className="metric-list">
            {metricRows.map(({ metricDefinition, latestRecord, selectedDateRecord, scaleMax, points }) => (
              <article className={`metric-row ${selectedMetricId === metricDefinition.id ? 'metric-row-active' : ''}`} key={metricDefinition.id}>
                <div className="metric-row-main">
                  <button className="metric-row-name" type="button" onClick={() => onSelectMetricId(metricDefinition.id)}>
                    <span className="metric-color-dot" style={{ backgroundColor: metricDefinition.color }} />
                    <span>
                      <strong>{metricDefinition.name}</strong>
                      <small>
                        {metricDefinition.unit || '未设单位'}
                        {metricDefinition.targetValue != null ? ` · 目标 ${formatMetricValue(metricDefinition.targetValue, metricDefinition.unit)}` : ''}
                      </small>
                    </span>
                  </button>
                  <div className="metric-row-values">
                    <span className="metric-value-inline">{formatMetricValue(latestRecord?.value, metricDefinition.unit)}</span>
                    <small>{selectedDateRecord ? `当日 ${formatMetricValue(selectedDateRecord.value, metricDefinition.unit)}` : '当日未填写'}</small>
                  </div>
                </div>

                <div className="metric-row-chart">
                  <TrendChart
                    points={points}
                    stroke={metricDefinition.color}
                    fill={metricDefinition.color}
                    min={0}
                    max={scaleMax}
                    compact
                    showArea={false}
                    emphasisIndex={points.length - 1}
                    valueSuffix={metricDefinition.unit ? ` ${metricDefinition.unit}` : ''}
                  />
                </div>

                <div className="metric-row-controls">
                  <label className="input-label">
                    <span>{selectedDate.slice(5)} 数值</span>
                    <input
                      className="text-input"
                      type="number"
                      inputMode="decimal"
                      value={metricValueDrafts[metricDefinition.id] ?? ''}
                      onChange={onMetricValueDraftChange(metricDefinition.id)}
                      placeholder="0"
                    />
                  </label>
                  <div className="metric-row-actions">
                    <button className="button-secondary min-h-9 px-3" type="button" onClick={() => onSaveMetricRecord(metricDefinition)}>
                      保存数值
                    </button>
                    <button className="button-secondary min-h-9 px-3" type="button" onClick={() => onEditMetricDefinition(metricDefinition)}>
                      编辑
                    </button>
                    <button className="icon-button" type="button" aria-label={`删除 ${metricDefinition.name}`} onClick={() => onDeleteMetricDefinition(metricDefinition)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {metricRows.length === 0 && <p className="empty-state mt-4">先添加一个想长期观察的量化事项，折线和数值就会跟着长出来。</p>}

          {selectedMetricDefinition && (
            <div className="metric-focus">
              <ProgressRing
                value={selectedMetricCurrentRecord?.value ?? selectedMetricLatestRecord?.value ?? 0}
                max={selectedMetricScaleMax}
                color={selectedMetricDefinition.color}
                label={selectedMetricDefinition.name}
                valueText={formatMetricValue(
                  selectedMetricCurrentRecord?.value ?? selectedMetricLatestRecord?.value ?? 0,
                  selectedMetricDefinition.unit,
                )}
                caption={
                  selectedMetricDefinition.targetValue != null
                    ? `目标 ${formatMetricValue(selectedMetricDefinition.targetValue, selectedMetricDefinition.unit)}`
                    : '按历史最高值自动缩放'
                }
                size={118}
              />
              <div className="metric-focus-copy">
                <strong>{selectedMetricDefinition.name}</strong>
                <p>
                  {selectedMetricCurrentRecord
                    ? `当前日期已记录 ${formatMetricValue(selectedMetricCurrentRecord.value, selectedMetricDefinition.unit)}。`
                    : selectedDate === todayKey
                      ? '今天还没有填写这个指标。'
                      : '这一天还没有填写这个指标。'}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {previewImage && (
        <ImagePreviewDialog name={previewImage.name} sourceUrl={previewImage.sourceUrl} onClose={closeImagePreview} />
      )}
    </section>
  )
}
