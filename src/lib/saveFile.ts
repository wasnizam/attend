/**
 * Saving a file Dobry made (a report, a list, payslips, a certificate). In a browser it downloads
 * as usual. Inside the iPhone or Android app a download goes nowhere, so the phone's own share
 * sheet opens instead: save to Files, AirDrop, WhatsApp, email, print.
 */
import { inNativeApp } from './native'

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'dobry-file'

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export async function saveFile(name: string, blob: Blob): Promise<void> {
  const file = safeName(name)
  if (!inNativeApp()) return download(file, blob)
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const { uri } = await Filesystem.writeFile({ path: file, data: await toBase64(blob), directory: Directory.Cache })
  try {
    await Share.share({ title: file, files: [uri] })
  } catch (e) {
    // Closing the share sheet without choosing is not an error.
    if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e
  }
}

/** A jsPDF document, saved the same way. */
export const savePdf = (doc: { output(type: 'blob'): Blob }, name: string) => saveFile(name, doc.output('blob'))
