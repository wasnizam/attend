import { studentKey } from './format'

export interface RosterEntry {
  studentKey: string
  studentId: string
  studentName: string
  /** Workplace: the department or branch the person belongs to. */
  department?: string
}

/** A file or pasted text, reduced to a grid of text cells for the lecturer to confirm. */
export interface ImportGrid {
  rows: string[][]
  idCol: number
  nameCol: number
  /** Column holding the department, or -1. */
  deptCol?: number
}

const ID_CELL = /^[A-Za-z0-9._/-]{3,40}$/
const HAS_DIGIT = /\d/
const NAME_TOKEN = /^[\p{L}\p{M}'’.@/()-]+$/u
const ID_HEADER = /matri[ck]|student\s*(id|no)|\bid\b|no\.?\s*(pelajar|matrik)|number/i
const NAME_HEADER = /\bname\b|\bnama\b/i

const looksLikeId = (cell: string) => ID_CELL.test(cell) && HAS_DIGIT.test(cell)
const looksLikeName = (cell: string) => cell.length >= 3 && !HAS_DIGIT.test(cell) && /\p{L}{2,}/u.test(cell)

function tidy(rows: unknown[][]): string[][] {
  return rows
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).replace(/\s+/g, ' ').trim())))
    .filter((row) => row.some(Boolean))
}

/** Guesses which column holds student IDs and which holds names. The lecturer can override. */
export function detectColumns(rows: string[][]): { idCol: number; nameCol: number } {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const score = (col: number, test: (cell: string) => boolean, header: RegExp) =>
    rows.filter((r) => test(r[col] ?? '')).length +
    (rows.slice(0, 8).some((r) => header.test(r[col] ?? '') && (r[col] ?? '').length < 30) ? rows.length : 0)
  const best = (scores: number[], skip = -1) =>
    scores.reduce((top, s, i) => (i !== skip && (top === -1 || s > scores[top]) ? i : top), -1)

  const cols = Array.from({ length: width }, (_, i) => i)
  const idCol = Math.max(0, best(cols.map((c) => score(c, looksLikeId, ID_HEADER))))
  const nameCol = Math.max(0, best(cols.map((c) => score(c, looksLikeName, NAME_HEADER)), idCol))
  return { idCol, nameCol }
}

const DEPT_HEADER = /\bdep(t|artment)?\b|jabatan|bahagian|division|\bunit\b|cawangan|branch|team/i

/** Finds a department column by its heading. -1 when the sheet has none. */
export function detectDepartment(rows: string[][], idCol: number, nameCol: number): number {
  for (const row of rows.slice(0, 8)) {
    const col = row.findIndex((cell, i) => i !== idCol && i !== nameCol && cell.length < 30 && DEPT_HEADER.test(cell))
    if (col >= 0) return col
  }
  return -1
}

/** Turns the confirmed grid into a clean, de-duplicated student list. Header and junk rows drop out. */
export function toRoster(rows: string[][], idCol: number, nameCol: number, deptCol = -1): RosterEntry[] {
  const seen = new Map<string, RosterEntry>()
  for (const row of rows) {
    const id = (row[idCol] ?? '').trim()
    const name = (row[nameCol] ?? '').trim()
    if (!looksLikeId(id) || !looksLikeName(name)) continue
    const key = studentKey(id)
    const department = deptCol >= 0 ? (row[deptCol] ?? '').trim().slice(0, 60) : ''
    if (!seen.has(key)) seen.set(key, { studentKey: key, studentId: id.toUpperCase(), studentName: name.slice(0, 80), ...(department ? { department } : {}) })
  }
  return [...seen.values()]
}

/**
 * Pulls [id, name] out of one line of loose text, as found in PDFs and pasted lists.
 * "12.  A21CS0042   AHMAD BIN ALI   SECJH 3" -> ["A21CS0042", "AHMAD BIN ALI"]
 */
function splitLine(line: string): string[] | null {
  // Wide gaps (or tabs) mark column boundaries; when present they are the most reliable cue.
  const cells = line.trim().split(/\t+| {2,}/).map((c) => c.trim()).filter(Boolean)
  if (cells.length >= 2) {
    const at = cells.findIndex(looksLikeId)
    if (at !== -1) {
      const name = [cells[at + 1], cells[at - 1]].find((c) => c !== undefined && looksLikeName(c))
      if (name) return [cells[at], name]
    }
  }
  // Otherwise go word by word: the ID, then every following word that reads as part of a name.
  const tokens = line.trim().split(/\s+/)
  if (/^\d{1,3}[.)]?$/.test(tokens[0] ?? '')) tokens.shift()
  const at = tokens.findIndex(looksLikeId)
  if (at === -1) return null
  const after: string[] = []
  for (const t of tokens.slice(at + 1)) {
    if (!NAME_TOKEN.test(t)) break
    after.push(t)
  }
  const before = tokens.slice(0, at).filter((t) => NAME_TOKEN.test(t))
  const name = (after.length ? after : before).join(' ')
  return looksLikeName(name) ? [tokens[at], name] : null
}

function fromLines(lines: string[]): string[][] {
  const rows = lines.map(splitLine).filter((r): r is string[] => r !== null)
  // Student IDs in one class share a length. Lines whose "ID" does not (a course code in a
  // title, a date in a footer) are dropped when there is a clear majority.
  const lengths = new Map<number, number>()
  for (const [id] of rows) lengths.set(id.length, (lengths.get(id.length) ?? 0) + 1)
  const [usual, count] = [...lengths.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  return rows.length >= 4 && count / rows.length >= 0.6 ? rows.filter(([id]) => id.length === usual) : rows
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  row.push(cell)
  rows.push(row)
  return rows
}

export function parseText(text: string): ImportGrid {
  const clean = text.replace(/^﻿/, '')
  const delimiter = ['\t', ';', ','].find((d) => clean.split('\n').filter((l) => l.includes(d)).length >= clean.split('\n').filter((l) => l.trim()).length / 2)
  const rows = delimiter ? tidy(parseDelimited(clean, delimiter)) : fromLines(clean.split(/\r?\n/))
  return { rows, ...(delimiter ? detectColumns(rows) : { idCol: 0, nameCol: 1 }) }
}

async function pdfLines(file: File): Promise<string[]> {
  // The "legacy" build carries the polyfills that Safari on iPhone needs.
  await import('./streamPolyfill')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Our own worker file wraps the library's, so the same fix applies inside the worker.
  const { default: PdfWorker } = await import('./pdfWorker?worker')
  pdfjs.GlobalWorkerOptions.workerPort ??= new PdfWorker()
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    // Read the page's text with a plain reader. The library's own getTextContent() loops
    // over the stream with `for await`, which Safari does not support and fails with
    // "undefined is not a function".
    const reader = (await pdf.getPage(p)).streamTextContent().getReader()
    const content: { items: unknown[] } = { items: [] }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      content.items.push(...value.items)
    }
    // Text comes back as loose fragments; rebuild lines from fragments that share a baseline.
    const byLine = new Map<number, { x: number; end: number; size: number; text: string }[]>()
    for (const raw of content.items) {
      const item = raw as { str?: string; transform: number[]; width: number; height: number }
      if (typeof item.str !== 'string' || !item.str.trim()) continue
      const y = Math.round(item.transform[5] / 3)
      const x = item.transform[4]
      const size = Math.abs(item.transform[0]) || item.height || 10
      byLine.set(y, [...(byLine.get(y) ?? []), { x, end: x + item.width, size, text: item.str }])
    }
    for (const y of [...byLine.keys()].sort((a, b) => b - a)) {
      const fragments = byLine.get(y)!.sort((a, b) => a.x - b.x)
      // A gap wider than about one character height is a column boundary, not a word space.
      lines.push(
        fragments.reduce((line, f, i) => {
          if (i === 0) return f.text
          return line + (f.x - fragments[i - 1].end > f.size ? '\t' : ' ') + f.text
        }, ''),
      )
    }
  }
  return lines
}

/** Reads an Excel (.xlsx), CSV / text, or PDF class list. */
export async function parseFile(file: File): Promise<ImportGrid> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    const rows = tidy((await readSheet(file)) as unknown[][])
    return { rows, ...detectColumns(rows) }
  }
  if (name.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported. In Excel, use Save As and choose .xlsx or CSV.')
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return { rows: fromLines(await pdfLines(file)), idCol: 0, nameCol: 1 }
  }
  return parseText(await file.text())
}
