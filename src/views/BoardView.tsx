import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Check, Plus, Search, Trash2, X } from 'lucide-react'

import { DatePickerButton } from '../components/ui/date-picker-button'
import type { BoardLaneRecord, JournalEntry, TodoDetailUpdate, TodoItem, TodoPriority } from '../lib/db'
import type { ActiveView } from '../types/app'
import { getCountdownDaysRemaining, getCountdownTone } from '../utils/countdown'

type LaneColor = {
  id: string
  label: string
  color: string
  soft: string
  darkSoft: string
  ring: string
  labelText: string
}

type BoardLane = {
  id: string
  label: string
  color: LaneColor
  items: TodoItem[]
  custom?: boolean
  done?: boolean
  record?: BoardLaneRecord
}

type BoardViewProps = {
  todos: TodoItem[]
  filteredBoardTodos: TodoItem[]
  boardLanes: BoardLaneRecord[]
  entryByDate: Map<string, JournalEntry>
  selectedDate: string
  todoTitle: string
  onFocusDate: (dateKey: string, nextView: ActiveView) => void
  onTodoTitleChange: (value: string) => void
  onAddTodoWithDetails: (dateKey: string, title: string, details: TodoDetailUpdate) => void
  onUpdateTodoDetails: (todo: TodoItem, details: TodoDetailUpdate) => void
  onAddBoardLane: (label: string, colorId: string) => void
  onDeleteBoardLane: (lane: BoardLaneRecord) => void
  onToggleTodo: (todo: TodoItem) => void
  onDeleteTodo: (todo: TodoItem) => void
}

const laneColors: LaneColor[] = [
  { id: 'blue', label: '海蓝', color: '#376fe0', soft: '#edf4ff', darkSoft: 'rgba(22, 47, 82, 0.92)', ring: 'rgba(55, 111, 224, 0.18)', labelText: '#ffffff' },
  { id: 'slate', label: '石墨', color: '#6f7785', soft: '#f3f5f7', darkSoft: 'rgba(48, 55, 64, 0.94)', ring: 'rgba(111, 119, 133, 0.2)', labelText: '#ffffff' },
  { id: 'clay', label: '陶土', color: '#b47b49', soft: '#fff4e8', darkSoft: 'rgba(74, 52, 34, 0.94)', ring: 'rgba(180, 123, 73, 0.2)', labelText: '#ffffff' },
  { id: 'amber', label: '琥珀', color: '#d27a10', soft: '#fff5dc', darkSoft: 'rgba(82, 53, 16, 0.94)', ring: 'rgba(210, 122, 16, 0.2)', labelText: '#111827' },
  { id: 'moss', label: '苔绿', color: '#87951a', soft: '#f8fadf', darkSoft: 'rgba(55, 62, 19, 0.94)', ring: 'rgba(135, 149, 26, 0.2)', labelText: '#111827' },
  { id: 'teal', label: '湖青', color: '#1595a1', soft: '#e8f9fb', darkSoft: 'rgba(16, 67, 73, 0.94)', ring: 'rgba(21, 149, 161, 0.2)', labelText: '#ffffff' },
  { id: 'periwinkle', label: '鸢尾', color: '#7467d8', soft: '#f0efff', darkSoft: 'rgba(50, 45, 91, 0.94)', ring: 'rgba(116, 103, 216, 0.2)', labelText: '#ffffff' },
  { id: 'orchid', label: '兰紫', color: '#a653d7', soft: '#f9edff', darkSoft: 'rgba(70, 37, 91, 0.94)', ring: 'rgba(166, 83, 215, 0.2)', labelText: '#ffffff' },
  { id: 'rose', label: '玫红', color: '#d54f96', soft: '#ffedf6', darkSoft: 'rgba(82, 35, 62, 0.94)', ring: 'rgba(213, 79, 150, 0.2)', labelText: '#ffffff' },
]

const defaultInboxColor = laneColors[0]
const defaultDoneColor: LaneColor = {
  id: 'green',
  label: '绿色',
  color: '#21806f',
  soft: '#edf8f4',
  darkSoft: 'rgba(21, 63, 55, 0.9)',
  ring: 'rgba(33, 128, 111, 0.18)',
  labelText: '#ffffff',
}

const priorityOptions: Array<{ id: TodoPriority; label: string; shortLabel: string }> = [
  { id: 'normal', label: '普通', shortLabel: '⭐️' },
  { id: 'important', label: '重要', shortLabel: '⭐️⭐️' },
  { id: 'urgent', label: '紧急', shortLabel: '⭐️⭐️⭐️' },
]

const getLaneColor = (colorId?: string) => laneColors.find((color) => color.id === colorId) ?? defaultInboxColor

const getLaneStyle = (color: LaneColor) =>
  ({
    '--lane-color': color.color,
    '--lane-soft': color.soft,
    '--lane-dark-soft': color.darkSoft,
    '--lane-ring': color.ring,
    '--lane-label-text': color.labelText,
  }) as CSSProperties

const sortByDate = (items: TodoItem[]) =>
  [...items].sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.createdAt.localeCompare(right.createdAt))

const getVisibleLaneLimit = () => {
  if (window.innerWidth >= 1320) return 3
  if (window.innerWidth >= 960) return 2

  return 1
}

const formatTodoDateLabel = (dateKey: string) => `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`

export function BoardView({
  todos,
  filteredBoardTodos,
  boardLanes: customLanes,
  entryByDate,
  selectedDate,
  todoTitle,
  onFocusDate,
  onTodoTitleChange,
  onAddTodoWithDetails,
  onUpdateTodoDetails,
  onAddBoardLane,
  onDeleteBoardLane,
  onToggleTodo,
  onDeleteTodo,
}: BoardViewProps) {
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false)
  const [isLaneDialogOpen, setIsLaneDialogOpen] = useState(false)
  const [dialogTodoDate, setDialogTodoDate] = useState(selectedDate)
  const [todoDraftPriority, setTodoDraftPriority] = useState<TodoPriority>('normal')
  const [todoDraftDescription, setTodoDraftDescription] = useState('')
  const [todoDraftCountdownEnabled, setTodoDraftCountdownEnabled] = useState(false)
  const [laneDraftTitle, setLaneDraftTitle] = useState('')
  const [laneDraftColorId, setLaneDraftColorId] = useState(laneColors[0].id)
  const [focusedLaneId, setFocusedLaneId] = useState('inbox')
  const [visibleLaneLimit, setVisibleLaneLimit] = useState(getVisibleLaneLimit)
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null)
  const [isTrashActive, setIsTrashActive] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null)
  const [detailDescription, setDetailDescription] = useState('')
  const [detailPriority, setDetailPriority] = useState<TodoPriority>('normal')
  const [detailLaneId, setDetailLaneId] = useState('inbox')
  const [detailCountdownEnabled, setDetailCountdownEnabled] = useState(false)
  const activeTodoCount = filteredBoardTodos.filter((todo) => !todo.done).length

  useEffect(() => {
    const handleResize = () => setVisibleLaneLimit(getVisibleLaneLimit())
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const laneLabelById = useMemo(() => {
    const labels = new Map<string, string>([['inbox', '待做']])
    for (const lane of customLanes) {
      labels.set(lane.id, lane.label)
    }
    labels.set('done', '已完成')

    return labels
  }, [customLanes])

  const visibleBoardTodos = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return filteredBoardTodos

    return filteredBoardTodos.filter((todo) => {
      const entry = entryByDate.get(todo.dateKey)
      const assignedLaneId = todo.laneId || 'inbox'
      const haystack = [
        todo.title,
        todo.dateKey,
        todo.description,
        entry?.title ?? '',
        entry?.body ?? '',
        entry?.moodText ?? '',
        laneLabelById.get(assignedLaneId) ?? '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }, [entryByDate, filteredBoardTodos, laneLabelById, searchKeyword])

  const boardLanes = useMemo<BoardLane[]>(() => {
    const activeTodos = sortByDate(visibleBoardTodos.filter((todo) => !todo.done))
    const doneTodos = sortByDate(visibleBoardTodos.filter((todo) => todo.done))
    const customLaneIds = new Set(customLanes.map((lane) => lane.id))
    const inboxItems = activeTodos.filter((todo) => !customLaneIds.has(todo.laneId))
    const customLaneItems = customLanes.map((lane) => ({
      id: lane.id,
      label: lane.label,
      color: getLaneColor(lane.colorId),
      custom: true,
      record: lane,
      items: activeTodos.filter((todo) => todo.laneId === lane.id),
    }))

    return [
      { id: 'inbox', label: '待做', color: defaultInboxColor, items: inboxItems },
      ...customLaneItems,
      { id: 'done', label: '已完成', color: defaultDoneColor, items: doneTodos, done: true },
    ]
  }, [customLanes, visibleBoardTodos])

  const expandedLaneIds = useMemo(() => {
    const laneIds = boardLanes.map((lane) => lane.id)
    const focusedId = laneIds.includes(focusedLaneId) ? focusedLaneId : 'inbox'
    const expandedIds = new Set<string>([focusedId])

    for (const lane of boardLanes) {
      if (expandedIds.size >= visibleLaneLimit) break
      expandedIds.add(lane.id)
    }

    return expandedIds
  }, [boardLanes, focusedLaneId, visibleLaneLimit])

  const assignTodoToLane = (todo: TodoItem, laneId: string) => {
    if (todo.done || laneId === 'done') return
    onUpdateTodoDetails(todo, { laneId })
    setFocusedLaneId(laneId)
  }

  const closeLaneDialog = () => {
    setIsLaneDialogOpen(false)
    setLaneDraftTitle('')
    setLaneDraftColorId(laneColors[0].id)
  }

  const handleAddLane = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = laneDraftTitle.trim()
    if (!title) return
    onAddBoardLane(title, laneDraftColorId)
    closeLaneDialog()
  }

  const handleDeleteLane = (lane: BoardLane) => {
    if (!lane.custom) return

    if (lane.record) onDeleteBoardLane(lane.record)
    setFocusedLaneId('inbox')
  }

  const openTodoDetail = (todo: TodoItem) => {
    setEditingTodo(todo)
    setDetailDescription(todo.description)
    setDetailPriority(todo.priority)
    setDetailLaneId(todo.laneId || 'inbox')
    setDetailCountdownEnabled(todo.countdownEnabled)
  }

  const closeTodoDetail = () => {
    setEditingTodo(null)
  }

  const handleSaveTodoDetail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTodo) return

    onUpdateTodoDetails(editingTodo, {
      description: detailDescription.trim(),
      priority: detailPriority,
      laneId: detailLaneId,
      countdownEnabled: detailCountdownEnabled,
    })
    closeTodoDetail()
  }

  const handleDropOnLane = (lane: BoardLane) => {
    if (!draggingTodoId) return

    const todo = filteredBoardTodos.find((item) => item.id === draggingTodoId)
    setDraggingTodoId(null)
    setFocusedLaneId(lane.id)
    if (!todo) return

    if (lane.done) {
      if (!todo.done) onToggleTodo(todo)
      return
    }

    assignTodoToLane(todo, lane.id)
  }

  const handleDropOnTrash = () => {
    if (!draggingTodoId) return

    const todo = filteredBoardTodos.find((item) => item.id === draggingTodoId)
    setDraggingTodoId(null)
    setIsTrashActive(false)
    if (!todo) return

    onDeleteTodo(todo)
  }

  const openTodoDialog = () => {
    setDialogTodoDate(selectedDate)
    setTodoDraftPriority('normal')
    setTodoDraftDescription('')
    setTodoDraftCountdownEnabled(false)
    setIsTodoDialogOpen(true)
  }

  const closeTodoDialog = () => {
    setIsTodoDialogOpen(false)
  }

  const handleDialogDateChange = (dateKey: string) => {
    setDialogTodoDate(dateKey)
    onFocusDate(dateKey, 'board')
  }

  const handleDialogTodoSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = todoTitle.trim()
    if (title) {
      onAddTodoWithDetails(dialogTodoDate, title, {
        description: todoDraftDescription.trim(),
        priority: todoDraftPriority,
        laneId: 'inbox',
        countdownEnabled: todoDraftCountdownEnabled,
      })
    }
    if (title) {
      closeTodoDialog()
    }
  }

  return (
    <section className="py-3 sm:py-5" aria-labelledby="todo-board-title">
      <div className="mb-3 flex flex-col gap-3 md:mb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Todo Board</p>
          <h2 className="section-title" id="todo-board-title">
            Todo 看板
          </h2>
          <p className="mt-1 hidden text-sm font-bold text-ink-400 md:block">
            {activeTodoCount} 个待做 · 共 {todos.length} 个事项 · 按日期从过去到未来排列
          </p>
        </div>

        <button className="button-primary w-fit" type="button" onClick={openTodoDialog}>
          <Plus size={18} aria-hidden="true" />
          添加
        </button>
      </div>

      <div className="board-search-row">
        <label className="board-search">
          <Search size={17} aria-hidden="true" />
          <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="搜索 Todo、描述或日记" />
        </label>
        <div
          className={`board-trash-drop ${draggingTodoId ? 'board-trash-drop-ready' : ''} ${isTrashActive ? 'board-trash-drop-active' : ''}`}
          aria-label="拖拽 Todo 到这里删除"
          onDragEnter={(event) => {
            event.preventDefault()
            setIsTrashActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsTrashActive(true)
          }}
          onDragLeave={() => setIsTrashActive(false)}
          onDrop={(event) => {
            event.preventDefault()
            handleDropOnTrash()
          }}
        >
          <Trash2 size={18} aria-hidden="true" />
          <span>{draggingTodoId ? '松开删除' : '拖入删除'}</span>
        </div>
      </div>

      <div className="board-grid">
        {boardLanes.map((lane) => (
          <section
            className={`board-column ${expandedLaneIds.has(lane.id) ? 'board-column-expanded' : 'board-column-collapsed'} ${draggingTodoId ? 'board-column-dropping' : ''}`}
            style={getLaneStyle(lane.color)}
            aria-labelledby={`board-${lane.id}`}
            key={lane.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDropOnLane(lane)}
          >
            <button
              className="board-column-rail"
              type="button"
              aria-expanded={expandedLaneIds.has(lane.id)}
              onClick={() => setFocusedLaneId(lane.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleDropOnLane(lane)
              }}
            >
              <span>{lane.items.length}</span>
              <strong>{lane.label}</strong>
            </button>

            <div className="board-column-inner">
              <div className="board-column-head">
                <div className="board-column-title-row">
                  <h3 className="board-column-title" id={`board-${lane.id}`}>
                    {lane.label}
                  </h3>
                  <span>{lane.items.length}</span>
                </div>
                {lane.custom && (
                  <button className="icon-button board-lane-delete" type="button" aria-label={`删除栏目 ${lane.label}`} onClick={() => handleDeleteLane(lane)}>
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="board-column-body">
                {lane.items.map((todo) => {
                  const entry = entryByDate.get(todo.dateKey)
                  const priority = todo.priority
                  const priorityOption = priorityOptions.find((option) => option.id === priority) ?? priorityOptions[0]
                  const description = todo.description
                  const countdownDays = todo.countdownEnabled ? getCountdownDaysRemaining(todo.dateKey) : null

                  return (
                    <article
                      className={`board-card ${countdownDays != null && !todo.done ? 'board-card-countdown' : ''}`}
                      key={todo.id}
                      role="button"
                      tabIndex={0}
                      draggable
                      onClick={() => openTodoDetail(todo)}
                      onDragStart={() => setDraggingTodoId(todo.id)}
                      onDragEnd={() => {
                        setDraggingTodoId(null)
                        setIsTrashActive(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openTodoDetail(todo)
                        }
                      }}
                    >
                      <div className="board-card-meta">
                        <button className="board-date-link" type="button" onClick={(event) => {
                          event.stopPropagation()
                          onFocusDate(todo.dateKey, 'dashboard')
                        }}>
                          {formatTodoDateLabel(todo.dateKey)}
                        </button>
                        <button
                          className={`board-check ${todo.done ? 'board-check-done' : ''}`}
                          type="button"
                          aria-label={todo.done ? '标记为待做' : '标记完成'}
                          aria-pressed={todo.done}
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleTodo(todo)
                          }}
                        >
                          {todo.done && <Check size={14} aria-hidden="true" />}
                        </button>
                      </div>

                      <h3 className={`m-0 text-base font-black text-ink-950 ${todo.done ? 'todo-done' : ''}`}>{todo.title}</h3>
                      {description && <p className="board-card-description">{description}</p>}
                      {entry && <p className="m-0 text-sm font-bold text-ink-600">{entry.title}</p>}
                      {countdownDays != null && !todo.done && (
                        <div className={`board-countdown-figure ${getCountdownTone(countdownDays)}`} aria-label={`倒计时 ${countdownDays} 天`}>
                          <strong>{countdownDays}</strong>
                          <span>天</span>
                        </div>
                      )}

                      <div className="board-card-actions">
                        <span className={`board-priority board-priority-${priority}`}>{priorityOption.shortLabel}</span>
                      </div>
                    </article>
                  )
                })}

                {lane.items.length === 0 && <p className="board-drop-empty">{lane.done ? '完成后会落到这里。' : '把事项拖到这里。'}</p>}
              </div>
            </div>
          </section>
        ))}

        <button className="board-add-column" type="button" aria-label="新增栏目" onClick={() => setIsLaneDialogOpen(true)}>
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>

      {isLaneDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="board-column-dialog" aria-labelledby="board-column-dialog-title" onSubmit={handleAddLane}>
            <div className="section-head mb-3">
              <div>
                <p className="eyebrow">Column</p>
                <h3 className="section-title text-lg" id="board-column-dialog-title">
                  新建栏目
                </h3>
              </div>
              <button className="icon-button" type="button" aria-label="关闭新增栏目" onClick={closeLaneDialog}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <input
              className="board-column-name-input"
              value={laneDraftTitle}
              onChange={(event) => setLaneDraftTitle(event.target.value)}
              placeholder="命名栏目"
              autoFocus
            />

            <div className="board-color-grid" aria-label="选择栏目主题色">
              {laneColors.map((color) => {
                const isSelected = color.id === laneDraftColorId

                return (
                  <button
                    className={`board-color-choice ${isSelected ? 'board-color-choice-active' : ''}`}
                    style={{ backgroundColor: color.color }}
                    type="button"
                    aria-label={`选择${color.label}`}
                    aria-pressed={isSelected}
                    key={color.id}
                    onClick={() => setLaneDraftColorId(color.id)}
                  >
                    {isSelected && <Check size={30} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>

            <button className="button-primary board-column-submit" type="submit" disabled={!laneDraftTitle.trim()}>
              添加栏目
            </button>
          </form>
        </div>
      )}

      {editingTodo && (
        <div className="dialog-backdrop" role="presentation">
          <form className="todo-dialog todo-detail-dialog" aria-labelledby="todo-detail-title" onSubmit={handleSaveTodoDetail}>
            <div className="section-head mb-3">
              <div>
                <p className="eyebrow">{editingTodo.dateKey}</p>
                <h3 className="section-title text-lg" id="todo-detail-title">
                  {editingTodo.title}
                </h3>
              </div>
              <button className="icon-button" type="button" aria-label="关闭 Todo 详情" onClick={closeTodoDetail}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-3">
              <label className="input-label">
                <span>描述</span>
                <textarea
                  className="text-area min-h-28"
                  value={detailDescription}
                  onChange={(event) => setDetailDescription(event.target.value)}
                  placeholder="补充背景、下一步、验收标准"
                  rows={4}
                />
              </label>
              <label className="input-label">
                <span>分类</span>
                <select className="board-detail-select" value={detailLaneId} onChange={(event) => setDetailLaneId(event.target.value)} disabled={editingTodo.done}>
                  <option value="inbox">待做</option>
                  {customLanes.map((customLane) => (
                    <option value={customLane.id} key={customLane.id}>
                      {customLane.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="countdown-toggle">
                <input
                  type="checkbox"
                  checked={detailCountdownEnabled}
                  onChange={(event) => setDetailCountdownEnabled(event.target.checked)}
                />
                <span>
                  <strong>开启倒计时</strong>
                  <small>按 Todo 日期计算剩余天数</small>
                </span>
              </label>
              <fieldset className="todo-priority-field">
                <legend>重要级</legend>
                <div className="todo-priority-options">
                  {priorityOptions.map((option) => (
                    <button
                      className={`todo-priority-option todo-priority-option-${option.id} ${detailPriority === option.id ? 'todo-priority-option-active' : ''}`}
                      type="button"
                      aria-pressed={detailPriority === option.id}
                      key={option.id}
                      onClick={() => setDetailPriority(option.id)}
                    >
                      <span aria-hidden="true">{option.shortLabel}</span>
                      <small>{option.label}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <button
                className="button-secondary todo-detail-delete-button"
                type="button"
                onClick={() => {
                  onDeleteTodo(editingTodo)
                  closeTodoDetail()
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                删除
              </button>
              <div className="flex gap-2">
              <button className="button-secondary" type="button" onClick={closeTodoDetail}>
                取消
              </button>
              <button className="button-primary" type="submit">
                保存
              </button>
              </div>
            </div>
          </form>
        </div>
      )}

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
              <div className="input-label">
                <span>日期</span>
                <DatePickerButton
                  label="Todo 日期"
                  value={dialogTodoDate}
                  valueLabel={dialogTodoDate.replaceAll('-', '/')}
                  onChange={handleDialogDateChange}
                  compact
                />
              </div>
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
              <label className="input-label">
                <span>描述</span>
                <textarea
                  className="text-area min-h-24"
                  value={todoDraftDescription}
                  onChange={(event) => setTodoDraftDescription(event.target.value)}
                  placeholder="可选：补充背景、下一步或验收标准"
                  rows={3}
                />
              </label>
              <label className="countdown-toggle">
                <input
                  type="checkbox"
                  checked={todoDraftCountdownEnabled}
                  onChange={(event) => setTodoDraftCountdownEnabled(event.target.checked)}
                />
                <span>
                  <strong>开启倒计时</strong>
                  <small>按上方 Todo 日期计算剩余天数</small>
                </span>
              </label>
              <fieldset className="todo-priority-field">
                <legend>重要级</legend>
                <div className="todo-priority-options">
                  {priorityOptions.map((option) => (
                    <button
                      className={`todo-priority-option todo-priority-option-${option.id} ${todoDraftPriority === option.id ? 'todo-priority-option-active' : ''}`}
                      type="button"
                      aria-pressed={todoDraftPriority === option.id}
                      key={option.id}
                      onClick={() => setTodoDraftPriority(option.id)}
                    >
                      <span aria-hidden="true">{option.shortLabel}</span>
                      <small>{option.label}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
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
    </section>
  )
}
