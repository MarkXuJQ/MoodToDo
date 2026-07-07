import { X } from 'lucide-react'

type ImagePreviewDialogProps = {
  name: string
  sourceUrl: string
  onClose: () => void
}

export function ImagePreviewDialog({ name, sourceUrl, onClose }: ImagePreviewDialogProps) {
  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true" aria-label={name}>
      <button className="preview-dismiss" type="button" aria-label="关闭预览" onClick={onClose} />
      <div className="preview-panel">
        <div className="preview-head">
          <strong className="truncate">{name}</strong>
          <button className="icon-button" type="button" aria-label="关闭预览" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="preview-body">
          <img className="preview-image" src={sourceUrl} alt={name} />
        </div>
      </div>
    </div>
  )
}
