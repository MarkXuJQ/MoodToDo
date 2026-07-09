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
  reload: () => Promise<unknown>
  selectedDate: string
  setTodoTitle: (value: string) => void
  setTodos: Dispatch<SetStateAction<TodoItem[]>>
  showToast: (message: string, tone?: ToastState['tone'], options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) => void
  todoTitle: string
  todos: TodoItem[]
}

export const useTodoBoardActions = ({
  hasLoadedLocalState,
  reload,
  selectedDate,
  setTodoTitle,
  setTodos,
  showToast,
  todoTitle,
  todos,
}: UseTodoBoardActionsOptions) => {
  const pendingTodoDeleteTimersRef = useRef<Map<string, number>>(new Map())
  const completedTodoCleanupRef = useRef<Set<string>>(new Set())

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
      if (!todo.done || pendingTodoDeleteTimersRef.current.has(todo.id) || completedTodoCleanupRef.current.has(todo.id)) {
        return false
      }

      const completedAt = getTodoCompletedAt(todo)

      return completedAt != null && completedAt < cutoff
    })

    if (staleTodos.length === 0) return

    for (const todo of staleTodos) {
      completedTodoCleanupRef.current.add(todo.id)
    }

    void (async () => {
      try {
        await Promise.all(staleTodos.map((todo) => deleteTodo(todo)))
        await reload()
        showToast(`已自动清理 ${staleTodos.length} 个 14 天前完成的事项`, 'info')
      } catch (error) {
        for (const todo of staleTodos) {
          completedTodoCleanupRef.current.delete(todo.id)
        }

        const message = getErrorMessage(error, '自动清理已完成事项失败。')
        showToast(message, 'error')
      }
    })()
  }, [hasLoadedLocalState, reload, showToast, todos])

  const handleAddTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = todoTitle.trim()
    if (!title) return

    try {
      await addTodo(selectedDate, title)
      setTodoTitle('')
      await reload()
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
      await addTodo(dateKey, nextTitle, details)
      setTodoTitle('')
      await reload()
      showToast('事项已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增事项失败。')
      showToast(message, 'error')
    }
  }

  const handleUpdateTodoDetails = async (todo: TodoItem, details: TodoDetailUpdate) => {
    try {
      await updateTodoDetails(todo, details)
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '更新事项详情失败。')
      showToast(message, 'error')
    }
  }

  const handleAddBoardLane = async (label: string, colorId: string) => {
    try {
      await addBoardLane(label, colorId)
      await reload()
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
      await deleteBoardLane(lane)
      await reload()
      showToast('栏目已删除，相关事项已回到待做', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除栏目失败。')
      showToast(message, 'error')
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    try {
      await setTodoDone(todo, !todo.done)
      await reload()
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
          await reload()
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
    handleDeleteBoardLane,
    handleDeleteTodo,
    handleToggleTodo,
    handleUpdateTodoDetails,
  }
}
