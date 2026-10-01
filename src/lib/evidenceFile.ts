import { t } from './i18n'

export interface PreparedFile {
  fileName: string
  mimeType: string
  /** The file as a data: URL, small enough to store in one database document. */
  dataUrl: string
}

// Evidence is kept in the database itself, so a file has to fit in one document.
const MAX_BYTES = 700_000
const MAX_SIDE = 1600

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(t('We could not read that file. Try another one.')))
    reader.readAsDataURL(blob)
  })

/** Shrinks a photo until it fits: phone photos of an MC are several megabytes as taken. */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  let side = MAX_SIDE
  let quality = 0.8
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length * 0.75 <= MAX_BYTES) return dataUrl
    side = Math.round(side * 0.8)
    quality = Math.max(0.5, quality - 0.08)
  }
  throw new Error(t('That photo is too large even after shrinking. Try a clearer, closer photo.'))
}

/** Gets a photo or PDF ready to be saved as evidence. */
export async function prepareEvidence(file: File): Promise<PreparedFile> {
  if (file.type.startsWith('image/')) {
    return { fileName: file.name.replace(/\.\w+$/, '') + '.jpg', mimeType: 'image/jpeg', dataUrl: await shrinkImage(file) }
  }
  if (file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) {
      throw new Error(t('That PDF is too large (limit about 700 KB). Take a photo of the certificate instead.'))
    }
    return { fileName: file.name, mimeType: file.type, dataUrl: await readAsDataUrl(file) }
  }
  throw new Error(t('Evidence must be a photo or a PDF.'))
}

/** Opens saved evidence in a new tab. */
export function openEvidence(dataUrl: string) {
  // Browsers block navigating straight to a data: URL, so hand over a blob instead.
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
