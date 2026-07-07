import { useEffect, useState } from 'react'
import { Expand, ImagePlus, Trash2 } from 'lucide-react'

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

type AttachmentThumbProps = {
  name: string
  size: number
  type: string
  source: Blob
  badge?: string
  onPreview?: () => void
  onDelete?: () => void
}

export function AttachmentThumb({
  name,
  size,
  type,
  source,
  badge,
  onPreview,
  onDelete,
}: AttachmentThumbProps) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(source)
    setUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [source])

  const isImage = type.startsWith('image/')

  return (
    <figure className="attachment-thumb">
      <button
        className="attachment-media"
        type="button"
        onClick={onPreview}
        disabled={!onPreview}
        aria-label={onPreview ? `预览 ${name}` : undefined}
      >
        {isImage && url ? (
          <img className="attachment-image" src={url} alt={name} />
        ) : (
          <div className="attachment-fallback">
            <ImagePlus size={20} aria-hidden="true" />
          </div>
        )}
      </button>

      <figcaption className="attachment-copy">
        <div className="flex items-start justify-between gap-2">
          <span className="attachment-name">{name}</span>
          {badge && <span className="attachment-badge">{badge}</span>}
        </div>
        <small className="attachment-meta">{formatBytes(size)}</small>
      </figcaption>

      <div className="attachment-actions">
        {onPreview && (
          <button className="attachment-action" type="button" aria-label={`预览 ${name}`} onClick={onPreview}>
            <Expand size={16} aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button className="attachment-action" type="button" aria-label={`删除 ${name}`} onClick={onDelete}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </figure>
  )
}
