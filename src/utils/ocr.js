// ============================================================
// OCR 模块（设计方案 3.1.2 的提速实现）
// 优化点：
//  1) Worker 只创建一次、跨图复用（免重复初始化，节省每次 3~8 秒）
//  2) 图像预处理：灰度化 + 对比度拉伸 + 小图放大，提升试卷截图识别率
//  3) 批量队列顺序识别，带进度回调
//  4) 行级置信度 → 按题号块聚合出每题置信度，低置信度高亮提示复核（依据设计方案 3.1.2）
// 离线说明：首次使用需联网下载 chi_sim 语言包（之后浏览器自动缓存）；
//          可在「设置」里配置本地语言包目录（langPath，指向包含 chi_sim.traineddata 的目录）
// ============================================================
import { getSetting } from '../db'
import { splitBlock } from '../parse'

let workerPromise = null
let workerLangPath = null

// tesseract.js 体积大且仅 OCR 时需要：首次识别图片时才动态加载该 chunk
let createWorkerPromise = null
async function loadCreateWorker() {
  if (!createWorkerPromise) {
    createWorkerPromise = import('tesseract.js').then(m => m.createWorker)
  }
  return createWorkerPromise
}

export function isWorkerReady() { return !!workerPromise }

export async function getWorker() {
  const langPath = (await getSetting('ocrLangPath')) || undefined
  if (!workerPromise || workerLangPath !== langPath) {
    workerLangPath = langPath
    const createWorker = await loadCreateWorker()
    workerPromise = createWorker('chi_sim+eng', 1, langPath ? { langPath } : {})
  }
  return workerPromise
}

export async function destroyWorker() {
  if (workerPromise) {
    const w = await workerPromise
    try { await w.terminate() } catch (e) { /* ignore */ }
    workerPromise = null
  }
}

// 图像预处理：灰度 + 对比度拉伸 + 目标宽度约 1800px
export async function preprocessImage(file) {
  const bitmap = await createImageBitmap(file)
  const targetW = Math.min(Math.max(bitmap.width, 1200), 2400)
  const scale = targetW / bitmap.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  // 灰度直方图
  const hist = new Array(256).fill(0)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
    d[i] = d[i + 1] = d[i + 2] = g
    hist[Math.round(g)]++
  }
  // 2%~98% 分位对比度拉伸
  const total = d.length / 4
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break } }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, (d[i] - lo) * 255 / range))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  bitmap.close?.()
  return canvas
}

// 识别单张图：返回 { text, confidence, lineConfs }
// lineConfs: 每行在 text 中的字符区间 [start,end) 与该行平均置信度，用于按题聚合置信度
export async function recognizeImage(file, onProgress) {
  const worker = await getWorker()
  const canvas = await preprocessImage(file)
  const { data } = await worker.recognize(canvas)
  const text = data.text || ''
  // 展开行（tesseract.js v6: data.blocks[].paragraphs[].lines[]）
  const lines = []
  const blocks = data.blocks || []
  for (const b of blocks) {
    for (const p of (b.paragraphs || [])) {
      for (const l of (p.lines || [])) {
        const words = l.words || []
        const conf = words.length ? words.reduce((s, w) => s + (w.confidence ?? 0), 0) / words.length : (l.confidence ?? 0)
        lines.push({ text: l.text || '', conf })
      }
    }
  }
  // 行文本在 data.text 中的字符区间
  const lineConfs = []
  let cursor = 0
  const textLines = text.split('\n')
  for (let i = 0; i < textLines.length; i++) {
    const start = cursor, end = cursor + textLines[i].length
    cursor = end + 1
    const matched = lines[i] // 识别行序与输出行序基本一致
    lineConfs.push({ start, end, conf: matched ? matched.conf : null })
  }
  return { text, confidence: data.confidence ?? 0, lineConfs }
}

// 将行级置信度聚合到题块（依据设计方案 3.1.2：低置信度高亮提示复核）
export function attachConfidence(parsedBlocks, lineConfs) {
  for (const b of parsedBlocks) {
    const hit = (lineConfs || []).filter(l => l.conf !== null && l.start < b._end && l.end > b._start)
    const cs = hit.map(h => h.conf).filter(c => c > 0)
    b.confidence = cs.length ? Math.round(cs.reduce((s, c) => s + c, 0) / cs.length) : null
  }
  return parsedBlocks
}

// OCR 解析整页 → 题目块（复用文本解析引擎），并在块上挂起止偏移供置信度聚合
export function parseOcrText(text, lineConfs) {
  const markerRe = /(?:^|\n)\s*(\d{1,3})\s*[.、．]/g
  const marks = []
  let m
  while ((m = markerRe.exec(text))) marks.push({ qno: +m[1], contentStart: m.index + m[0].length, blockStart: m.index })
  if (!marks.length) return []
  const blocks = []
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].blockStart : text.length
    const raw = text.slice(marks[i].contentStart, end)
    blocks.push({ qno: marks[i].qno, _start: marks[i].blockStart, _end: end, ...splitBlock(raw) })
  }
  return attachConfidence(blocks, lineConfs || [])
}
