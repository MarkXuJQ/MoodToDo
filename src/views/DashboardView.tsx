import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  TrendingUp,
} from 'lucide-react'

import { AttachmentThumb } from '../components/ui/attachment-thumb'
import { ImagePreviewDialog } from '../components/ui/image-preview-dialog'
import { ProgressRing, TrendChart, type TrendPoint } from '../components/ui/data-viz'
import { Metric } from '../components/ui/stat-primitives'
import type { AttachmentRecord, JournalEntry, TodoItem } from '../lib/db'
import type { DraftState } from '../types/app'

type DashboardMetricCard = {
  id: string
  label: string
  value: string
  tone?: string
}

type DashboardViewProps = {
  selectedDate: string
  selectedDateLabel: string
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
  lastSevenAverage: number
  lastSevenEntryCount: number
  moodTrendPoints: TrendPoint[]
  selectedMoodTrendIndex?: number
  trendStartLabel: string
  trendEndLabel: string
  moodWindowAverage: number
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
}

export function DashboardView({
  selectedDate,
  selectedDateLabel,
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
  lastSevenAverage,
  lastSevenEntryCount,
  moodTrendPoints,
  selectedMoodTrendIndex,
  trendStartLabel,
  trendEndLabel,
  moodWindowAverage,
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
}: DashboardViewProps) {
  const [previewImage, setPreviewImage] = useState<{ name: string; sourceUrl: string } | null>(null)
  const moodAverageColor =
    lastSevenAverage >= 82
      ? '#7357ad'
      : lastSevenAverage >= 66
        ? '#176f66'
        : lastSevenAverage >= 50
          ? '#3b68ae'
          : lastSevenAverage >= 35
            ? '#c68b20'
            : '#bd4f3d'

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

            <form className="todo-capture-form" onSubmit={onAddTodo}>
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

            <form className="todo-capture-form" onSubmit={onAddTodo}>
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

            {lastSevenEntryCount > 0 ? (
              <div className="mood-score-compact">
                <ProgressRing
                  value={lastSevenAverage}
                  max={100}
                  color={moodAverageColor}
                  valueText={`${lastSevenAverage}`}
                  size={116}
                />
                <div className="mood-score-summary">
                  <span>最近均分</span>
                  <strong>{lastSevenAverage}</strong>
                  <small>来自最近 {lastSevenEntryCount} 条心情记录</small>
                </div>
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

      </div>

      {previewImage && (
        <ImagePreviewDialog name={previewImage.name} sourceUrl={previewImage.sourceUrl} onClose={closeImagePreview} />
      )}
    </section>
  )
}
