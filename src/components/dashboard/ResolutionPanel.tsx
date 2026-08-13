import { FileText, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardCase, ResolutionDefaults } from '../../modules/types'
import { Panel } from './Panel'

interface ScenePhoto { id: string; name: string; url: string }

export function ResolutionPanel({ selectedCase, defaults }: { selectedCase: DashboardCase; defaults: ResolutionDefaults }) {
  const { t, text } = useI18n()
  const [photos, setPhotos] = useState<ScenePhoto[]>([])
  const photoRef = useRef(photos)
  photoRef.current = photos
  useEffect(() => () => photoRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), [])

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return
    const next = [...files].filter((file) => file.type.startsWith('image/')).map((file) => ({ id: `${file.name}-${file.lastModified}-${file.size}`, name: file.name, url: URL.createObjectURL(file) }))
    setPhotos((current) => [...current, ...next])
    event.target.value = ''
  }

  function removePhoto(id: string) {
    setPhotos((current) => { const target = current.find((photo) => photo.id === id); if (target) URL.revokeObjectURL(target.url); return current.filter((photo) => photo.id !== id) })
  }

  return <Panel title={t('panels.resolution')} icon={<FileText size={15} />} className="resolution-panel">
    <div className="resolution-case"><span className="eyebrow">{selectedCase.id} · <span className="danger-text">{t(selectedCase.typeKey)}</span></span><span className="resolution-meta">{t('resolution.point')}：{selectedCase.spot}　{t('resolution.occurredAt')}：{selectedCase.time}</span></div>
    <label htmlFor="resolution-conclusion">{t('resolution.conclusion')}<select id="resolution-conclusion" name="conclusion" defaultValue={defaults.defaultConclusion}>{defaults.conclusions.map((key) => <option key={key} value={key}>{t(key)}</option>)}</select></label>
    <label htmlFor="resolution-notes">{t('resolution.notes')}<textarea id="resolution-notes" name="notes" defaultValue={text(defaults.notes)} /></label>
    <div className="form-row"><label htmlFor="resolution-operator">{t('resolution.operator')}<input id="resolution-operator" name="operator" defaultValue={defaults.operator} /></label><label htmlFor="resolution-time">{t('resolution.time')}<input id="resolution-time" name="resolvedAt" defaultValue={defaults.resolvedAt} /></label></div>
    <div className="scene-photos"><span>{t('resolution.photos')}</span><div className="photo-grid">{photos.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.name} /><figcaption>{photo.name}</figcaption><button type="button" className="photo-remove" aria-label={`${t('actions.remove')} ${photo.name}`} onClick={() => removePhoto(photo.id)}><X size={12} /></button></figure>)}<label className="photo-upload" htmlFor="scene-photos"><ImagePlus size={16} /><span>{t('actions.uploadPhoto')}</span><input id="scene-photos" name="scenePhotos" type="file" accept="image/*" multiple onChange={addPhotos} /></label></div></div>
    <div className="drawer-actions"><button type="button">{t('actions.cancel')}</button><button type="button" className="primary">{t('actions.confirmResolution')}</button></div>
  </Panel>
}
