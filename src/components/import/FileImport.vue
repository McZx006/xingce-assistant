<template>
  <div>
    <div class="mb8"><PaperMeta :meta="meta" /></div>

    <div class="grid cols-2">
      <div class="card">
        <h3>上传题目文件（PDF / Word / 图片，支持多选排队）</h3>
        <div class="dropzone" :class="{ over: over }"
          @click="fileInput.click()"
          @dragover.prevent="over = true"
          @dragleave="over = false"
          @drop.prevent="onDrop">
          拖拽文件到此处，或点击选择<br />
          <span class="muted">.pdf（文字层直读，扫描件自动转 OCR）· .docx · 图片</span>
          <input ref="fileInput" type="file" accept=".pdf,.docx,image/*" multiple hidden @change="onPick" />
        </div>
        <div class="row mt8">
          <button class="btn primary" :disabled="!queue.length || running" @click="runAll">
            {{ running ? '处理中…' : '处理全部队列' }}
          </button>
          <button class="btn" :disabled="running" @click="clearQueue">清空队列</button>
        </div>
        <div class="mt14">
          <div v-for="item in queue" :key="item.id" class="row mb8" style="font-size:12px">
            <span style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.name }}</span>
            <span class="tag" :class="statusTag(item).cls">{{ statusTag(item).text }}</span>
            <span v-if="item.status === 'done'" class="muted">
              {{ item.via }} · 整体置信度 {{ item.confidence === null ? '—' : item.confidence + '%' }} · 识别 {{ item.blocks.length }} 题
            </span>
            <span class="grow"></span>
            <button class="btn small" :disabled="running" @click="process(item)">重新处理</button>
          </div>
        </div>
        <div class="basis">
          <b>处理方式（按文件类型自动路由，全部离线完成）：</b><br />
          ① PDF：先用 PDF.js 直接抽取文字层（秒级、零识别误差）；检测到扫描页（无文字层）自动渲染成图走 OCR；<br />
          ② Word（.docx）：mammoth 抽取纯文本；.doc 旧格式请先另存为 .docx 或直接复制粘贴到「逐题录入」；<br />
          ③ 图片：灰度+对比度预处理后走 Tesseract OCR，Worker 全局复用，低置信度题目高亮提示核对。
        </div>
      </div>

      <div class="card">
        <h3>识别结果（逐项可编辑）</h3>
        <div v-if="!allBlocks.length" class="empty-tip">处理后在此核对修正</div>
        <div v-else style="max-height:430px;overflow:auto">
          <div v-for="b in allBlocks" :key="b.uid" class="mb14"
            :style="{ border: '1px solid ' + (b.confidence !== null && b.confidence < 75 ? 'var(--amber)' : 'var(--line)'), borderRadius: '8px', padding: '10px' }">
            <div class="row mb8">
              <label class="row" style="gap:4px"><input v-model="b.include" type="checkbox" /> 加入</label>
              <label class="row" style="gap:4px">题号 <input v-model.number="b.qno" type="number" style="width:60px" /></label>
              <select v-model="b.typeId" style="width:90px">
                <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
              <input v-model="b.kpName" list="file-kp-list" placeholder="知识点" style="width:140px" />
              <span v-if="b.confidence !== null"
                class="tag" :class="b.confidence < 75 ? 'amber' : 'green'">
                {{ b.confidence < 75 ? '置信度' + b.confidence + '% 建议核对' : '置信度 ' + b.confidence + '%' }}
              </span>
            </div>
            <label class="field"><span>题干</span><textarea v-model="b.stem" rows="2"></textarea></label>
            <div class="row">
              <label class="field grow"><span>A</span><input v-model="b.options.A" /></label>
              <label class="field grow"><span>B</span><input v-model="b.options.B" /></label>
            </div>
            <div class="row">
              <label class="field grow"><span>C</span><input v-model="b.options.C" /></label>
              <label class="field grow"><span>D</span><input v-model="b.options.D" /></label>
            </div>
            <div class="row">
              <label class="field" style="width:100px"><span>答案</span><input v-model="b.answer" /></label>
              <label class="field" style="width:100px"><span>你的作答</span><input v-model="b.userAnswer" /></label>
            </div>
          </div>
          <datalist id="file-kp-list">
            <option v-for="k in store.kps" :key="k.id" :value="k.name" />
          </datalist>
        </div>
        <div class="row mt8">
          <select v-model="targetPaperId" style="max-width:220px">
            <option value="">→ 保存为新试卷</option>
            <option v-for="p in store.papers" :key="p.id" :value="p.id">追加到：{{ p.name }}</option>
          </select>
          <button class="btn primary" :disabled="!includedCount" @click="saveAll">
            {{ targetPaperId ? '追加到所选试卷' : '全部加入新试卷' }}（{{ includedCount }}题）
          </button>
        </div>
        <div class="basis">识别失败或未识别出题号结构时，可手动补填（降级模式，依据设计方案 3.1.2 边界情况）；PDF/Word 文字直读的内容置信度标记为「—」（无识别误差）。</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PaperMeta from './PaperMeta.vue'
import { recognizeImage, parseOcrText } from '../../utils/ocr'
import { saveImportedPaper, appendQuestions } from '../../importHelpers'
import { MODULES } from '../../db'
import { store, toast } from '../../store'

// 重型解析库按需加载：仅当真正处理 PDF / Word 时才下载对应 chunk（各约 300KB+）
let pdfjsPromise = null
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist')
      const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjsLib
    })()
  }
  return pdfjsPromise
}

const router = useRouter()
const modules = MODULES
const meta = reactive({ name: '', source: '文件导入', examDate: new Date().toISOString().slice(0, 10) })
const fileInput = ref(null)
const over = ref(false)
const queue = ref([])
const running = ref(false)
const targetPaperId = ref('')
let uidSeq = 1

const allBlocks = computed(() => queue.value.flatMap(item => item.blocks))
const includedCount = computed(() => allBlocks.value.filter(b => b.include).length)

function statusTag(item) {
  if (item.status === 'done') return { text: '完成', cls: 'green' }
  if (item.status === 'running') return { text: '处理中…', cls: 'blue' }
  if (item.status === 'error') return { text: '失败', cls: 'red' }
  return { text: '排队中', cls: '' }
}

function onPick(e) { addFiles([...e.target.files]); e.target.value = '' }
function onDrop(e) { over.value = false; addFiles([...e.dataTransfer.files]) }
function addFiles(files) {
  for (const f of files) {
    const name = f.name.toLowerCase()
    const kind = name.endsWith('.pdf') ? 'pdf' : name.endsWith('.docx') ? 'docx' : f.type.startsWith('image/') ? 'image' : null
    if (!kind) { toast(`不支持的文件：${f.name}（仅支持 .pdf / .docx / 图片）`, 'error'); continue }
    queue.value.push({ id: uidSeq++, file: f, name: f.name, kind, status: 'pending', confidence: null, via: '', blocks: [] })
  }
}
function clearQueue() { if (!running.value) queue.value = [] }

async function runAll() {
  running.value = true
  try {
    for (const item of queue.value.filter(i => i.status !== 'done')) {
      await process(item)
    }
  } finally { running.value = false }
}

// ---------- 按类型提取文本 ----------
async function extractPdf(item) {
  const pdfjsLib = await loadPdfjs()
  const buf = await item.file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  let text = ''
  const lineConfs = []
  let ocrPages = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    let pageText = ''
    for (const it of tc.items) {
      pageText += it.str
      if (it.hasEOL) pageText += '\n'
    }
    const offset = text.length
    if (pageText.trim().length < 30) {
      // 扫描页：无文字层，渲染成图走 OCR（依据：PDF.js 文字层为空即判定为扫描件）
      ocrPages++
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      const r = await recognizeImage(canvas)
      pageText = r.text
      lineConfs.push(...r.lineConfs.map(l => ({ start: l.start + offset, end: l.end + offset, conf: l.conf })))
    } else {
      pageText += '\n'
    }
    text += pageText
  }
  return { text, confidence: ocrPages ? 70 : null, lineConfs, via: ocrPages === 0 ? 'PDF文字层' : `文字层+OCR×${ocrPages}页` }
}

async function extractDocx(item) {
  const mammoth = (await import('mammoth')).default
  const buf = await item.file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
  return { text: value || '', confidence: null, lineConfs: [], via: 'Word文本' }
}

async function extractImage(item) {
  const r = await recognizeImage(item.file)
  return { text: r.text, confidence: Math.round(r.confidence), lineConfs: r.lineConfs, via: 'OCR识别' }
}

async function process(item) {
  item.status = 'running'
  try {
    const result = item.kind === 'pdf' ? await extractPdf(item)
      : item.kind === 'docx' ? await extractDocx(item)
      : await extractImage(item)
    item.confidence = result.confidence
    item.via = result.via
    const blocks = parseOcrText(result.text, result.lineConfs)
    if (blocks.length) {
      item.blocks = blocks.map(b => reactive({
        uid: uidSeq++, include: true,
        qno: b.qno, typeId: 1, kpName: b.kpName || '',
        stem: b.stem, options: { ...b.options },
        answer: b.answer, userAnswer: b.userAnswer || '', analysis: b.analysis,
        confidence: b.confidence
      }))
    } else {
      // 降级模式：整篇存为一题草稿，手动修（依据设计方案 3.1.2）
      item.blocks = [reactive({
        uid: uidSeq++, include: true, qno: 1, typeId: 1, kpName: '',
        stem: result.text.trim().slice(0, 800), options: { A: '', B: '', C: '', D: '' },
        answer: '', userAnswer: '', analysis: '', confidence: result.confidence
      })]
    }
    item.status = 'done'
  } catch (e) {
    item.status = 'error'
    toast(`处理失败：${item.name} —— ${e.message || e}`, 'error', 4000)
  }
}

async function saveAll() {
  const items = allBlocks.value.filter(b => b.include).map(b => ({
    qno: b.qno, typeId: b.typeId, stem: b.stem, options: b.options,
    answer: b.answer, userAnswer: b.userAnswer, kpName: b.kpName, analysis: b.analysis
  }))
  if (!items.length) return
  const noAns = items.filter(i => !i.answer).length
  if (noAns) toast(`有 ${noAns} 题未填答案，这些题暂不计入对错统计（可后补）`, 'info', 3500)
  try {
    if (targetPaperId.value) {
      await appendQuestions(Number(targetPaperId.value), items)
      toast('已追加到所选试卷', 'success')
      router.push({ path: '/papers', query: { paperId: Number(targetPaperId.value), confirm: 1 } })
    } else {
      const paperId = await saveImportedPaper(meta, items, { judge: true, autoCollectWrong: false })
      toast('试卷已保存，去确认错题收录', 'success')
      router.push({ path: '/papers', query: { paperId, confirm: 1 } })
    }
  } catch (e) { toast(e.message || '保存失败', 'error') }
}
</script>
