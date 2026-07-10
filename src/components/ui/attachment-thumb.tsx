import { useCallback, useEffect, useRef, useState } from 'react'
import { Expand, ImagePlus, Trash2 } from 'lucide-react'

import { formatBytes } from '../../utils/format'

type AttachmentThumbProps = {
  name: string
  size: number
  type: string
  source?: Blob
  loadSource?: () => Promise<Blob>
  badge?: string
  onPreview?: (source: Blob) => void
  onDelete?: () => void
}

export function AttachmentThumb({
  name,
  size,
  type,
  source,
  loadSource,
  badge,
  onPreview,
  onDelete,
}: AttachmentThumbProps) {
  const [url, setUrl] = useState('')
  const [resolvedSource, setResolvedSource] = useState<Blob | undefined>(source)
  const [loadError, setLoadError] = useState(false)
  const loadPromiseRef = useRef<Promise<Blob> | null>(null)
  const isImage = type.startsWith('image/')

  useEffect(() => {
    if (source) {
      setResolvedSource(source)
      setLoadError(false)
    }
  }, [source])

  const ensureSource = useCallback(async () => {
    if (resolvedSource) return resolvedSource
    if (!loadSource) throw new Error('附件内容不可用。')

    if (!loadPromiseRef.current) {
      loadPromiseRef.current = loadSource()
        .then((blob) => {
          setResolvedSource(blob)
          setLoadError(false)
          return blob
        })
        .catch((error) => {
          setLoadError(true)
          throw error
        })
        .finally(() => {
          loadPromiseRef.current = null
        })
    }

    return loadPromiseRef.current
  }, [loadSource, resolvedSource])

  useEffect(() => {
    if (!isImage || resolvedSource || !loadSource) return

    void ensureSource().catch(() => undefined)
  }, [ensureSource, isImage, loadSource, resolvedSource])

  useEffect(() => {
    if (!resolvedSource) {
      setUrl('')
      return
    }

    const objectUrl = URL.createObjectURL(resolvedSource)
    setUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [resolvedSource])

  const handlePreview = async () => {
    if (!onPreview) return

    try {
      onPreview(await ensureSource())
    } catch {
      // 缩略图会显示读取失败状态，调用方无需再弹出一个重复错误。
    }
  }

  return (
    <figure className="attachment-thumb">
      <button
        className="attachment-media"
        type="button"
        onClick={() => void handlePreview()}
        disabled={!onPreview || (!source && !loadSource)}
        aria-label={onPreview ? `预览 ${name}` : undefined}
        aria-busy={isImage && !url && !loadError}
      >
        {isImage && url ? (
          <img className="attachment-image" src={url} alt={name} />
        ) : (
          <div className="attachment-fallback">
            <ImagePlus size={20} aria-hidden="true" />
            {loadError && <small>读取失败</small>}
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
          <button
            className="attachment-action"
            type="button"
            aria-label={`预览 ${name}`}
            onClick={() => void handlePreview()}
            disabled={!source && !loadSource}
          >
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
