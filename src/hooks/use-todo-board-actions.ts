import { useEffect, useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react'

import {
  addBoardLane,
  addTodo,
  deleteBoardLane,
  deleteTodo,
  setTodoDone,
  updateTodoDetails,
  type BoardLaneRecord,
  type TodoDetailUpdate,
  type TodoItem,
} from '../lib/db'
import { completedTodoRetentionMs, getTodoCompletedAt, sortTodosByDateThenCreatedAt } from '../utils/todo'
import { getErrorMessage } from '../utils/errors'
import type { ToastState } from './use-toast'

type UseTodoBoardActionsOptions = {
  hasLoadedLocalState: boolean
  refreshCore: () => Promise<unknown>
  selectedDate: string
  setBoardLanes: Dispatch<SetStateAction<BoardLaneRecord[]>>
  setTodoTitle: (value: string) => void
  setTodos: Dispatch<SetStateAction<TodoItem[]>>
  showToast: (message: string, tone?: ToastState['tone'], options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) => void
  todoTitle: string
  todos: TodoItem[]
}

export const useTodoBoardActions = ({
  hasLoadedLocalState,
  refreshCore,
  selectedDate,
  setBoardLanes,
  setTodoTitle,
  setTodos,
  showToast,
  todoTitle,
  todos,
}: UseTodoBoardActionsOptions) => {
  const pendingTodoDeleteTimersRef = useRef<Map<string, number>>(new Map())
  const completedTodoArchiveRef = useRef<Set<string>>(new Set())

  useEffect(
    () => () => {
      for (const timer of pendingTodoDeleteTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
    },
    [],
  )

  useEffect(() => {
    if (!hasLoadedLocalState) return

    const cutoff = Date.now() - completedTodoRetentionMs
    const staleTodos = todos.filter((todo) => {
      if (
        !todo.done ||
        todo.archivedAt ||
        pendingTodoDeleteTimersRef.current.has(todo.id) ||
        completedTodoArchiveRef.current.has(todo.id)
      ) {
        return false
      }

      const completedAt = getTodoCompletedAt(todo)

      return completedAt != null && completedAt < cutoff
    })

    if (staleTodos.length === 0) return

    for (const todo of staleTodos) {
      completedTodoArchiveRef.current.add(todo.id)
    }

    void (async () => {
      try {
        const archivedTodos = await Promise.all(
          staleTodos.map((todo) => updateTodoDetails(todo, { archived: true })),
        )
        const archivedById = new Map(archivedTodos.map((todo) => [todo.id, todo]))
        setTodos((current) => current.map((todo) => archivedById.get(todo.id) ?? todo))
        await refreshCore()
        showToast(`已归档 ${staleTodos.length} 个 14 天前完成的事项`, 'info')
      } catch (error) {
        for (const todo of staleTodos) {
          completedTodoArchiveRef.current.delete(todo.id)
        }

        const message = getErrorMessage(error, '自动归档已完成事项失败。')
        showToast(message, 'error')
      }
    })()
  }, [hasLoadedLocalState, refreshCore, setTodos, showToast, todos])

  const handleAddTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = todoTitle.trim()
    if (!title) return

    try {
      const todo = await addTodo(selectedDate, title)
      setTodoTitle('')
      setTodos((current) => [todo, ...current])
      await refreshCore()
      showToast('事项已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增事项失败。')
      showToast(message, 'error')
    }
  }

  const handleAddTodoWithDetails = async (dateKey: string, title: string, details: TodoDetailUpdate) => {
    const nextTitle = title.trim()
    if (!nextTitle) return

    try {
      const todo = await addTodo(dateKey, nextTitle, details)
      setTodoTitle('')
      setTodos((current) => [todo, ...current])
      await refreshCore()
      showToast('事项已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增事项失败。')
      showToast(message, 'error')
    }
  }

  const handleUpdateTodoDetails = async (todo: TodoItem, details: TodoDetailUpdate) => {
    try {
      const next = await updateTodoDetails(todo, details)
      setTodos((current) => current.map((item) => (item.id === next.id ? next : item)))
      await refreshCore()
    } catch (error) {
      const message = getErrorMessage(error, '更新事项详情失败。')
      showToast(message, 'error')
    }
  }

  const handleArchiveTodo = async (todo: TodoItem, archived: boolean) => {
    try {
      const next = await updateTodoDetails(todo, { archived })
      setTodos((current) => current.map((item) => (item.id === next.id ? next : item)))
      await refreshCore()
      showToast(archived ? '事项已归档' : '事项已恢复', 'success')
    } catch (error) {
      const message = getErrorMessage(error, archived ? '归档事项失败。' : '恢复事项失败。')
      showToast(message, 'error')
    }
  }

  const handleAddBoardLane = async (label: string, colorId: string) => {
    try {
      const lane = await addBoardLane(label, colorId)
      setBoardLanes((current) => [...current, lane])
      await refreshCore()
      showToast('栏目已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增栏目失败。')
      showToast(message, 'error')
    }
  }

  const handleDeleteBoardLane = async (lane: BoardLaneRecord) => {
    const confirmed = window.confirm(`确认删除栏目「${lane.label}」吗？该栏目下的待做事项会回到「待做」。`)
    if (!confirmed) return

    try {
      const movedTodos = await deleteBoardLane(lane)
      const movedById = new Map(movedTodos.map((todo) => [todo.id, todo]))
      setBoardLanes((current) => current.filter((item) => item.id !== lane.id))
      setTodos((current) => current.map((todo) => movedById.get(todo.id) ?? todo))
      await refreshCore()
      showToast('栏目已删除，相关事项已回到待做', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除栏目失败。')
      showToast(message, 'error')
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    try {
      const result = await setTodoDone(todo, !todo.done)
      setTodos((current) => {
        const next = current.map((item) => (item.id === result.todo.id ? result.todo : item))
        const knownIds = new Set(next.map((item) => item.id))

        return [...result.createdTodos.filter((item) => !knownIds.has(item.id)), ...next]
      })
      await refreshCore()
      showToast(todo.done ? '事项已标记未完成' : '事项已完成', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '更新事项失败。')
      showToast(message, 'error')
    }
  }

  const handleDeleteTodo = async (todo: TodoItem) => {
    if (pendingTodoDeleteTimersRef.current.has(todo.id)) return

    setTodos((current) => current.filter((item) => item.id !== todo.id))

    const undoDelete = () => {
      const timer = pendingTodoDeleteTimersRef.current.get(todo.id)
      if (timer) window.clearTimeout(timer)
      pendingTodoDeleteTimersRef.current.delete(todo.id)
      setTodos((current) =>
        current.some((item) => item.id === todo.id)
          ? current
          : [...current, todo].sort(sortTodosByDateThenCreatedAt),
      )
      showToast('已撤回删除', 'info')
    }

    const timer = window.setTimeout(() => {
      pendingTodoDeleteTimersRef.current.delete(todo.id)
      void (async () => {
        try {
          await deleteTodo(todo)
          await refreshCore()
          showToast('事项已删除', 'success')
        } catch (error) {
          const message = getErrorMessage(error, '删除事项失败。')
          setTodos((current) => (current.some((item) => item.id === todo.id) ? current : [...current, todo]))
          showToast(message, 'error')
        }
      })()
    }, 5200)

    pendingTodoDeleteTimersRef.current.set(todo.id, timer)
    showToast('事项已移除', 'info', {
      actionLabel: '撤回',
      onAction: undoDelete,
      durationMs: 5200,
    })
  }

  return {
    handleAddBoardLane,
    handleAddTodo,
    handleAddTodoWithDetails,
    handleArchiveTodo,
    handleDeleteBoardLane,
    handleDeleteTodo,
    handleToggleTodo,
    handleUpdateTodoDetails,
  }
}
