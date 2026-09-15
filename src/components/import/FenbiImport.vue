<template>
  <div>
    <div class="card mb14">
      <h3>粉笔模考成绩页导入（设计方案 3.1.3）</h3>
      <div class="row mb8">
        <label class="row" style="gap:4px"><input v-model="mode" type="radio" value="text" /> 粘贴文本</label>
        <label class="row" style="gap:4px"><input v-model="mode" type="radio" value="ocr" /> 上传成绩页截图（OCR）</label>
      </div>
      <textarea v-if="mode === 'text'" v-model="rawText" rows="7"
        placeholder="在粉笔App模考报告页复制文本粘贴到这里（含模块得分与逐题对错）…&#10;支持格式：&#10;· 言语理解与表达 32/40（模块得分）&#10;· 1.对 2.错 3.未（逐题对错）&#10;· 对错对对错…（纯对错串）&#10;· 错题：3,5,17（错题号列表）"></textarea>
      <div v-else>
        <div class="dropzone" :class="{ over }" @click="imgInput.click()"
          @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="e => { over = false; onImg(e.dataTransfer.files[0]) }">
          点击选择或拖入成绩页截图
          <input ref="imgInput" type="file" accept="image/*" hidden @change="e => onImg(e.target.files[0])" />
        </div>
        <div v-if="ocrStatus" class="muted mt8">{{ ocrStatus }}</div>
      </div>
      <div class="row mt8">
        <button class="btn primary" :disabled="parsing" @click="doParse">{{ parsing ? '解析中…' : '解析' }}</button>
        <span class="muted">解析规则：正则提取结构化字段（设计方案技术选型）；解析失败会给出具体提示</span>
      </div>
    </div>

    <div v-if="parsed" class="card mb14">
      <h3>解析结果</h3>
      <div class="row mb8">
        <label class="field grow"><span>试卷名称（自动识别，可改）</span>
          <input v-model="meta.name" /></label>
        <label class="field" style="width:160px"><span>考试日期</span>
          <input v-model="meta.examDate" type="date" /></label>
      </div>
      <div class="grid cols-3">
        <div class="card" style="padding:10px">
          <div class="stat-num">{{ totalCount }}</div>
          <div class="stat-label">总题数（对错序列长度）</div>
        </div>
        <div class="card" style="padding:10px">
          <div class="stat-num" style="color:var(--red)">{{ wrongCount }}</div>
          <div class="stat-label">错题数</div>
        </div>
        <div class="card" style="padding:10px">
          <div class="stat-num" style="color:var(--amber)">{{ missCount }}</div>
          <div class="stat-label">未作答数</div>
        </div>
      </div>

      <div v-if="moduleRows.length" class="mt14">
        <b style="font-size:13px">模块得分（自动映射到本系统题型枚举）</b>
        <table class="tbl" style="max-width:520px">
          <thead><tr><th>模块</th><th>得分</th><th>题量</th></tr></thead>
          <tbody>
            <tr v-for="r in moduleRows" :key="r.moduleId">
              <td>{{ moduleName(r.moduleId) }}</td><td>{{ r.score }}</td><td>{{ r.total }}</td>
            </tr>
          </tbody>
        </table>
        <div class="basis">映射依据：设计方案 3.1.3 —— 言语理解→言语、数量关系→数量、判断推理→判断、资料分析→资料、常识判断→常识</div>
      </div>

      <div class="mt14">
        <b style="font-size:13px">题型分布（题号 → 模块，可修改）</b>
        <div v-for="(r, i) in ranges" :key="i" class="row mb8">
          第 <input v-model.number="r.from" type="number" style="width:64px" /> ~
          <input v-model.number="r.to" type="number" style="width:64px" /> 题
          <select v-model="r.moduleId" style="width:100px">
            <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <button class="btn small danger" @click="ranges.splice(i, 1)">删除</button>
        </div>
        <button class="btn small" @click="ranges.push({ from: 1, to: totalCount, moduleId: 1 })">+ 添加区间</button>
      </div>

      <div v-if="parsed.warnings.length" class="mt14">
        <div v-for="(w, i) in parsed.warnings" :key="i" class="tag amber" style="margin:2px">{{ w }}</div>
      </div>

      <div class="row mt14">
        <button class="btn primary" :disabled="!totalCount" @click="confirmImport">确认导入</button>
        <span class="muted">导入后：逐题对错写入作答记录，错题自动进错题本（错因按规则推断，标注「系统推断」）——依据设计方案 3.1.3</span>
      </div>
      <div class="basis">
        <b>说明：</b>粉笔成绩页不含题干与标准答案，故题目题干留空、作答记为「对✓/错×」占位，不影响正确率与趋势统计；补录题干后可正常刷题练习（依据设计方案 3.1.3 假设条款）。
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { parseFenbiScore, buildModuleRanges } from '../../parse'
import { recognizeImage } from '../../utils/ocr'
import { saveImportedPaper } from '../../importHelpers'
import { MODULES, db } from '../../db'
import { toast, refreshStore } from '../../store'

const router = useRouter()
const modules = MODULES
const mode = ref('text')
const rawText = ref('')
const parsing = ref(false)
const parsed = ref(null)
const ranges = ref([])
const over = ref(false)
const imgInput = ref(null)
const ocrStatus = ref('')

const meta = reactive({ name: '', source: '粉笔模考', examDate: new Date().toISOString().slice(0, 10) })

const moduleName = id => MODULES.find(m => m.id === id)?.name || id
const moduleRows = computed(() => Object.values(parsed.value?.modules || {}))
const totalCount = computed(() => parsed.value?.totalHint || parsed.value?.wrongListMax || 0)
const wrongCount = computed(() => {
  const p = parsed.value
  if (!p) return 0
  if (p.seq.length) return p.seq.filter(x => !x.ok && !x.miss).length
  if (p.wrongList) return p.wrongList.length
  return 0
})
const missCount = computed(() => parsed.value?.seq.filter(x => x.miss).length || 0)

async function doParse() {
  const text = mode.value === 'text' ? rawText.value : null
  if (mode.value === 'text' && !text.trim()) { toast('请先粘贴文本', 'error'); return }
  parsing.value = true
  try {
    const t = mode.value === 'text' ? text : ocrTextCache
    if (!t) { toast('请先完成截图识别', 'error'); return }
    const result = parseFenbiScore(t)
    if (result.name) meta.name = result.name
    parsed.value = result
    ranges.value = buildModuleRanges(result.modules, result.totalHint)
    if (!ranges.value.length && result.totalHint) {
      ranges.value = [{ from: 1, to: result.totalHint, moduleId: 1 }]
    }
  } finally { parsing.value = false }
}

let ocrTextCache = ''
async function onImg(file) {
  if (!file) return
  ocrStatus.value = 'OCR 识别中…（首次使用需联网下载语言包）'
  try {
    const { text, confidence } = await recognizeImage(file)
    ocrTextCache = text
    ocrStatus.value = `识别完成（整页置信度 ${Math.round(confidence)}%），已填入解析原料，点击「解析」`
    rawText.value = text
    mode.value = 'text'
  } catch (e) {
    ocrStatus.value = ''
    toast('OCR 失败：' + (e.message || e), 'error', 4000)
  }
}

async function confirmImport() {
  const p = parsed.value
  const items = []
  if (p.seq.length) {
    for (const s of p.seq) {
      const range = ranges.value.find(r => s.qno >= r.from && s.qno <= r.to)
      items.push({
        qno: s.qno, typeId: range ? range.moduleId : 1,
        stem: '', options: {},
        answer: '', // 成绩页无标准答案
        userAnswer: s.miss ? '' : (s.ok ? '✓' : '×'),
        kpName: '',
        fenbiQno: s.qno,
        errorType: s.miss ? 4 : 3 // 未作答→超时未答；错→方法不熟（规则依据设计方案3.4.2）
      })
    }
  } else if (p.wrongList) {
    const wrongSet = new Set(p.wrongList)
    const total = totalCount.value
    if (!total) { toast('仅识别到错题列表时需要总题数，请在文本中补充分模块题量（如 数量关系 15/15）', 'error', 4000); return }
    for (let qno = 1; qno <= total; qno++) {
      const range = ranges.value.find(r => qno >= r.from && qno <= r.to)
      const wrong = wrongSet.has(qno)
      items.push({
        qno, typeId: range ? range.moduleId : 1, stem: '', options: {},
        answer: '', userAnswer: wrong ? '×' : '✓', kpName: '', fenbiQno: qno,
        errorType: wrong ? 3 : null
      })
    }
  }
  if (!items.length) { toast('没有可导入的题目数据', 'error'); return }
  try {
    const paperId = await saveImportedPaper(meta, items, { judge: true, autoCollectWrong: true })
    // 模块得分入库（paper_module_score 表，依据设计方案数据模型）
    for (const r of moduleRows.value) {
      await db.paperModuleScores.add({ paperId, moduleId: r.moduleId, score: r.score, total: r.total })
    }
    await refreshStore()
    toast('粉笔模考导入完成，错题已自动收录', 'success')
    router.push({ path: '/papers', query: { paperId, confirm: 1 } })
  } catch (e) { toast(e.message || '导入失败', 'error') }
}
</script>
