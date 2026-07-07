import { useRef } from 'react'
import { CalendarDays } from 'lucide-react'

type DatePickerButtonProps = {
  label: string
  value: string
  valueLabel?: string
  onChange: (value: string) => void
  className?: string
  compact?: boolean
}

export function DatePickerButton({
  label,
  value,
  valueLabel,
  onChange,
  className,
  compact = false,
}: DatePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const openPicker = () => {
    const input = inputRef.current

    if (!input) return

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // Some mobile browsers expose showPicker but reject it; fall back to focus/click.
      }
    }

    input.focus()
    input.click()
  }

  return (
    <div className={`date-picker-button ${compact ? 'date-picker-button-compact' : ''} ${className ?? ''}`}>
      <button className="date-picker-trigger" type="button" onClick={openPicker} aria-label={`${label}：${valueLabel ?? value}`}>
        <CalendarDays size={compact ? 16 : 18} aria-hidden="true" />
        <span className="date-picker-copy">
          <small>{label}</small>
          <strong>{valueLabel ?? value}</strong>
        </span>
      </button>
      <input
        ref={inputRef}
        className="date-picker-input"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        tabIndex={-1}
      />
    </div>
  )
}
