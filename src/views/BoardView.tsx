import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'

import { DatePickerButton } from '../components/ui/date-picker-button'
import type { JournalEntry, TodoItem } from '../lib/db'
import type { ActiveView } from '../types/app'

type BoardLane = {
  id: string
  label: string
  items: TodoItem[]
  custom?: boolean
  done?: boolean
}

type CustomBoardLane = {
  id: string
  label: string
}

type BoardAssignmentMap = Record<string, string>

type BoardViewProps = {
  todos: TodoItem[]
  filteredBoardTodos: TodoItem[]
  entryByDate: Map<string, JournalEntry>
  selectedDate: string
  todayKey: string
  todoTitle: string
  onFocusDate: (dateKey: string, nextView: ActiveView) => void
  onTodoTitleChange: (value: string) => void
  onAddTodo: (event: FormEvent<HTMLFormElement>) => void
  onToggleTodo: (todo: TodoItem) => void
  onDeleteTodo: (todo: TodoItem) => void
}

const boardLaneStorageKey = 'xinxiangyi-board-lanes-v1'
const boardAssignmentStorageKey = 'xinxiangyi-board-assignments-v1'

const readStoredLanes = (): CustomBoardLane[] => {
  try {
    const raw = window.localStorage.getItem(boardLaneStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<CustomBoardLane>[]

    return parsed
      .filter((lane): lane is CustomBoardLane => Boolean(lane.id && lane.label))
      .map((lane) => ({ id: lane.id, label: lane.label }))
  } catch {
    return []
  }
}

const readStoredAssignments = (): BoardAssignmentMap => {
  try {
    const raw = window.localStorage.getItem(boardAssignmentStorageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as BoardAssignmentMap

    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const createLaneId = () => `lane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const sortByDate = (items: TodoItem[]) =>
  [...items].sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.createdAt.localeCompare(right.createdAt))

const getTodoTone = (todo: TodoItem, todayKey: string) => {
  if (todo.done) return 'done'
  if (todo.dateKey < todayKey) return 'past'
  if (todo.dateKey === todayKey) return 'today'

  return 'future'
}

export function BoardView({
  todos,
  filteredBoardTodos,
  entryByDate,
  selectedDate,
  todayKey,
  todoTitle,
  onFocusDate,
  onTodoTitleChange,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}: BoardViewProps) {
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false)
  const [dialogTodoDate, setDialogTodoDate] = useState(selectedDate)
  const [customLanes, setCustomLanes] = useState<CustomBoardLane[]>(readStoredLanes)
  const [assignmentByTodoId, setAssignmentByTodoId] = useState<BoardAssignmentMap>(readStoredAssignments)
  const [newLaneTitle, setNewLaneTitle] = useState('')
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null)
  const activeTodoCount = filteredBoardTodos.filter((todo) => !todo.done).length

  useEffect(() => {
    window.localStorage.setItem(boardLaneStorageKey, JSON.stringify(customLanes))
  }, [customLanes])

  useEffect(() => {
    window.localStorage.setItem(boardAssignmentStorageKey, JSON.stringify(assignmentByTodoId))
  }, [assignmentByTodoId])

  const boardLanes = useMemo<BoardLane[]>(() => {
    const activeTodos = sortByDate(filteredBoardTodos.filter((todo) => !todo.done))
    const doneTodos = sortByDate(filteredBoardTodos.filter((todo) => todo.done))
    const customLaneIds = new Set(customLanes.map((lane) => lane.id))
    const inboxItems = activeTodos.filter((todo) => !customLaneIds.has(assignmentByTodoId[todo.id]))
    const customLaneItems = customLanes.map((lane) => ({
      ...lane,
      custom: true,
      items: activeTodos.filter((todo) => assignmentByTodoId[todo.id] === lane.id),
    }))

    return [
      { id: 'inbox', label: '待做', items: inboxItems },
      ...customLaneItems,
      { id: 'done', label: '已完成', items: doneTodos, done: true },
    ]
  }, [assignmentByTodoId, customLanes, filteredBoardTodos])

  const assignTodoToLane = (todo: TodoItem, laneId: string) => {
    if (todo.done || laneId === 'done') return

    setAssignmentByTodoId((current) => {
      const next = { ...current }
      if (laneId === 'inbox') {
        delete next[todo.id]
      } else {
        next[todo.id] = laneId
      }

      return next
    })
  }

  const handleAddLane = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = newLaneTitle.trim()
    if (!title) return

    setCustomLanes((current) => [...current, { id: createLaneId(), label: title }])
    setNewLaneTitle('')
  }

  const handleDeleteLane = (lane: CustomBoardLane) => {
    setCustomLanes((current) => current.filter((item) => item.id !== lane.id))
    setAssignmentByTodoId((current) => {
      const next = { ...current }
      for (const [todoId, laneId] of Object.entries(next)) {
        if (laneId === lane.id) delete next[todoId]
      }

      return next
    })
  }

  const handleDropOnLane = (lane: BoardLane) => {
    if (!draggingTodoId) return

    const todo = filteredBoardTodos.find((item) => item.id === draggingTodoId)
    setDraggingTodoId(null)
    if (!todo) return

    if (lane.done) {
      if (!todo.done) onToggleTodo(todo)
      return
    }

    assignTodoToLane(todo, lane.id)
  }

  const openTodoDialog = () => {
    setDialogTodoDate(selectedDate)
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
    onAddTodo(event)
    if (todoTitle.trim()) {
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

      <form className="board-lane-form" onSubmit={handleAddLane}>
        <input
          className="text-input"
          value={newLaneTitle}
          onChange={(event) => setNewLaneTitle(event.target.value)}
          placeholder="新建一个主题栏"
        />
        <button className="button-secondary min-h-10 px-3" type="submit">
          <Plus size={16} aria-hidden="true" />
          新栏目
        </button>
      </form>

      <div className="board-grid">
        {boardLanes.map((lane) => (
          <section
            className={`board-column board-lane-${lane.id} ${draggingTodoId ? 'board-column-dropping' : ''}`}
            aria-labelledby={`board-${lane.id}`}
            key={lane.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDropOnLane(lane)}
          >
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
                const assignedLaneId = assignmentByTodoId[todo.id] ?? 'inbox'
                const tone = getTodoTone(todo, todayKey)

                return (
                  <article
                    className={`board-card board-card-${tone}`}
                    key={todo.id}
                    draggable={!todo.done}
                    onDragStart={() => setDraggingTodoId(todo.id)}
                    onDragEnd={() => setDraggingTodoId(null)}
                  >
                    <div className="board-card-meta">
                      <button className="board-date-link" type="button" onClick={() => onFocusDate(todo.dateKey, 'dashboard')}>
                        {todo.dateKey}
                      </button>
                      <button
                        className={`board-check ${todo.done ? 'board-check-done' : ''}`}
                        type="button"
                        aria-label={todo.done ? '标记为待做' : '标记完成'}
                        aria-pressed={todo.done}
                        onClick={() => onToggleTodo(todo)}
                      >
                        {todo.done && <Check size={14} aria-hidden="true" />}
                      </button>
                    </div>

                    <h3 className={`m-0 text-base font-black text-ink-950 ${todo.done ? 'todo-done' : ''}`}>{todo.title}</h3>
                    {entry && (
                      <p className="m-0 text-sm font-bold text-ink-600">
                        {entry.title}
                      </p>
                    )}

                    <div className="board-card-actions">
                      {!todo.done && (
                        <select
                          className="board-move-select"
                          value={assignedLaneId}
                          aria-label={`移动 ${todo.title} 到栏目`}
                          onChange={(event) => assignTodoToLane(todo, event.target.value)}
                        >
                          <option value="inbox">待做</option>
                          {customLanes.map((customLane) => (
                            <option value={customLane.id} key={customLane.id}>
                              {customLane.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="icon-button" type="button" aria-label={`删除 ${todo.title}`} onClick={() => onDeleteTodo(todo)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                )
              })}

              {lane.items.length === 0 && <p className="board-drop-empty">{lane.done ? '完成后会落到这里。' : '把事项拖到这里。'}</p>}
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
