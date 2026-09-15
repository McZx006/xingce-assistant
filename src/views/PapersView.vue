<template>
  <div>
    <div class="page-head row">
      <div>
        <h1>试卷</h1>
        <p>试卷列表 · 单卷统计 · 错题确认收录</p>
      </div>
    </div>

    <div v-if="!sel" class="card">
      <table class="tbl">
        <thead><tr><th>试卷</th><th>来源</th><th>日期</th><th>题数</th><th>错题</th><th>正确率</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in paperRows" :key="p.id" class="clickable" @click="open(p.id)">
            <td>{{ p.name }}</td>
            <td class="muted">{{ p.source || '—' }}</td>
            <td>{{ fmtDate(p.examDate) }}</td>
            <td>{{ p.total }}</td>
            <td style="color:var(--red)">{{ p.wrong }}</td>
            <td>{{ pct(p.accuracy) }}</td>
            <td><button class="btn small" @click.stop="open(p.id)">详情</button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!paperRows.length" class="empty-tip">
        还没有试卷，去 <router-link to="/import">录入试卷</router-link>（答题卡模式 130 题约 2 分钟）
      </div>
      <div class="basis"><b>口径：</b>正确率 = 该卷 mode='paper' 作答记录中答对数 / 总题数；未判定答案的题计入未作答。</div>
    </div>

    <!-- 试卷详情 -->
    <div v-else>
      <div class="row mb8">
        <button class="btn small" @click="sel = null">← 返回列表</button>
        <h2 style="margin:0;font-size:17px">{{ selPaper.name }}</h2>
        <span class="muted">{{ fmtDate(selPaper.examDate) }} · 共 {{ ps.total }} 题</span>
        <span class="grow"></span>
        <button class="btn small" @click="goAppend">+ 追加题目</button>
        <button class="btn small danger" @click="deletePaper">删除试卷</button>
      </div>

      <div class="grid cols-3">
        <div class="card"><h3>各题型错题数</h3><BaseChart :option="wrongBarOption" height="230px" /></div>
        <div class="card"><h3>对错占比</h3><BaseChart :option="pieOption" height="230px" /></div>
        <div class="card"><h3>各模块正确率</h3><BaseChart :option="accBarOption" height="230px" @chart-click="onModuleClick" /></div>
      </div>
      <div class="basis">
        <b>口径（依据设计方案 3.5.1）：</b>各题型错题数=该卷各题型错题数；对错占比=该卷总题数拆分（答对/答错/未作答）；模块正确率=该题型答对数/该题型题数。点柱子可筛选该模块题目。
      </div>

      <!-- 错题确认收录区 -->
      <div class="card mt14" id="confirm-zone">
        <div class="row mb8">
          <h3 style="margin:0">错题收录确认 <span class="muted">（默认预勾选「答错/未作答」，依据设计方案 3.2）</span></h3>
          <span class="grow"></span>
          <button class="btn small" @click="selectAllWrong">全选未收录错题</button>
          <button class="btn small primary" :disabled="!checkedPending.length" @click="confirmCollect">
            收录所选 {{ checkedPending.length }} 题
          </button>
        </div>
        <table class="tbl">
          <thead><tr><th style="width:40px"></th><th>题号</th><th>题型</th><th>知识点</th><th>答案</th><th>你的作答</th><th>判定</th><th>错误类型（推断预填）</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="row in confirmRows" :key="row.q.id">
              <td><input v-model="row.checked" type="checkbox" :disabled="!!row.mistakeId" /></td>
              <td>{{ row.q.qno }}</td>
              <td>{{ moduleName(row.q.typeId) }}</td>
              <td>{{ kpName(row.q.kpId) }}</td>
              <td>{{ row.q.answer || '—' }}</td>
              <td>{{ row.rec?.userAnswer || '未作答' }}</td>
              <td><span :class="row.ok ? 'tag green' : 'tag red'">{{ row.ok ? '对' : '错' }}</span></td>
              <td>
                <select v-model="row.errorType" style="width:120px" :disabled="!!row.mistakeId">
                  <option v-for="et in errorTypes" :key="et.id" :value="et.id">{{ et.name }}</option>
                </select>
                <span class="muted" style="font-size:11px"> 系统推断</span>
              </td>
              <td>
                <span v-if="row.mistakeId" class="tag blue">已在错题本</span>
                <span v-else class="muted">未收录</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!confirmRows.length" class="empty-tip">没有错题，全部正确（或尚无作答数据）</div>
        <div class="basis">
          <b>推断规则依据（设计方案 3.4.2）：</b>未作答→超时未答；曾答对后答错→粗心；同知识点连续错→概念不清；其余→方法不熟。收录后可在错题本改为手动标注。
        </div>
      </div>

      <!-- 题目列表 -->
      <div class="card mt14">
        <div class="row mb8">
          <h3 style="margin:0">题目列表 {{ filterModule ? `（已筛选：${moduleName(filterModule)}）` : '' }}</h3>
          <span class="grow"></span>
          <button v-if="filterModule" class="btn small" @click="filterModule = null">取消筛选</button>
        </div>
        <table class="tbl">
          <thead><tr><th>题号</th><th>题型</th><th>知识点</th><th>题干摘要</th><th>答案</th><th>作答</th><th>判定</th><th></th></tr></thead>
          <tbody>
            <tr v-for="q in listQuestions" :key="q.id">
              <td>{{ q.qno }}</td>
              <td>{{ moduleName(q.typeId) }}</td>
              <td>{{ kpName(q.kpId) }}</td>
              <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="muted">{{ q.stem || '（题干未录入）' }}</td>
              <td>{{ q.answer || '—' }}</td>
              <td>{{ recOf(q.id)?.userAnswer || '未作答' }}</td>
              <td>
                <span v-if="recOf(q.id)?.isCorrect === null || recOf(q.id)?.isCorrect === undefined || !recOf(q.id)?.userAnswer" class="tag amber">未判定</span>
                <span v-else :class="recOf(q.id).isCorrect ? 'tag green' : 'tag red'">{{ recOf(q.id).isCorrect ? '对' : '错' }}</span>
              </td>
              <td><button class="btn small" @click="editQ = q">编辑</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 题目编辑弹窗 -->
    <div v-if="editQ" class="modal-mask" @click.self="editQ = null">
      <div class="modal">
        <h3>编辑第 {{ editQ.qno }} 题</h3>
        <div class="row">
          <label class="field" style="width:110px"><span>题型</span>
            <select v-model="editForm.typeId">
              <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select></label>
          <label class="field grow"><span>知识点</span>
            <input v-model="editForm.kpName" list="paper-kp-list" /></label>
          <datalist id="paper-kp-list">
            <option v-for="k in store.kps" :key="k.id" :value="k.name" />
          </datalist>
        </div>
        <label class="field"><span>题干</span><textarea v-model="editForm.stem" rows="3"></textarea></label>
        <div class="row">
          <label class="field grow"><span>A</span><input v-model="editForm.options.A" /></label>
          <label class="field grow"><span>B</span><input v-model="editForm.options.B" /></label>
        </div>
        <div class="row">
          <label class="field grow"><span>C</span><input v-model="editForm.options.C" /></label>
          <label class="field grow"><span>D</span><input v-model="editForm.options.D" /></label>
        </div>
        <div class="row">
          <label class="field" style="width:110px"><span>正确答案</span><input v-model="editForm.answer" /></label>
          <label class="field" style="width:110px"><span>你的作答</span><input v-model="editForm.userAnswer" /></label>
        </div>
        <label class="field"><span>解析</span><textarea v-model="editForm.analysis" rows="2"></textarea></label>
        <div class="row">
          <button class="btn primary" @click="saveQuestion">保存</button>
          <button class="btn" @click="editQ = null">取消</button>
          <span class="muted">修改答案/作答后系统自动重新判定并更新作答记录</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseChart from '../components/BaseChart.vue'
import { paperStats, pct, fmtDate } from '../stats'
import { MODULES, ERROR_TYPES, db, ensureKp, collectMistake } from '../db'
import { store, refreshStore, toast } from '../store'
import { sameAnswer } from '../importHelpers'

const route = useRoute()
const router = useRouter()
const modules = MODULES
const errorTypes = ERROR_TYPES

const sel = ref(null)
const filterModule = ref(null)
const editQ = ref(null)
const editForm = reactive({ typeId: 1, kpName: '', stem: '', options: {}, answer: '', userAnswer: '', analysis: '' })

const moduleName = id => MODULES.find(m => m.id === id)?.name || id
const kpName = id => store.kps.find(k => k.id === id)?.name || '待标注'

const paperRows = computed(() => store.papers.map(p => {
  const s = paperStats(p.id, store.questions, store.records)
  return { id: p.id, name: p.name, source: p.source, examDate: p.examDate, total: s.total, wrong: s.wrong, accuracy: s.accuracy }
}))

const selPaper = computed(() => store.papers.find(p => p.id === sel.value))
const ps = computed(() => sel.value ? paperStats(sel.value, store.questions, store.records) : null)
const recOf = qid => {
  const rs = store.records.filter(r => r.questionId === qid).sort((a, b) => a.answeredAt - b.answeredAt)
  return rs[0]
}
const listQuestions = computed(() => {
  const qs = ps.value?.questionList || []
  return filterModule.value ? qs.filter(q => q.typeId === filterModule.value) : qs
})

function open(id) { sel.value = id }
watch(() => route.query.paperId, v => { if (v) sel.value = Number(v) }, { immediate: true })

function goAppend() {
  router.push({ path: '/import', query: { tab: 'manual', paperId: sel.value } })
}

async function deletePaper() {
  if (!confirm(`确认删除试卷「${selPaper.value.name}」？其题目、作答记录将一并删除（错题本条目保留但将失去来源）。`)) return
  const qIds = store.questions.filter(q => q.paperId === sel.value).map(q => q.id)
  await db.transaction('rw', [db.papers, db.questions, db.answerRecords, db.paperModuleScores], async () => {
    await db.papers.delete(sel.value)
    await db.questions.where('paperId').equals(sel.value).delete()
    await db.paperModuleScores.where('paperId').equals(sel.value).delete()
    for (const qid of qIds) await db.answerRecords.where('questionId').equals(qid).delete()
  })
  await refreshStore()
  sel.value = null
  toast('试卷已删除', 'success')
}

// ---------- 单卷图表 ----------
const wrongBarOption = computed(() => {
  const cats = [], vals = []
  for (const m of MODULES) {
    const b = ps.value?.byModule[m.id]
    if (!b || !b.total) continue
    cats.push(m.name); vals.push(b.wrong)
  }
  return {
    grid: { left: 40, right: 16, top: 20, bottom: 26 },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', data: vals, itemStyle: { color: '#dc2626', borderRadius: [4, 4, 0, 0] } }],
    tooltip: { trigger: 'axis' }
  }
})
const pieOption = computed(() => {
  const s = ps.value
  return {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['42%', '68%'],
      data: [
        { name: `答对 ${s?.correct}`, value: s?.correct || 0, itemStyle: { color: '#16a34a' } },
        { name: `答错 ${s?.wrong}`, value: s?.wrong || 0, itemStyle: { color: '#dc2626' } },
        { name: `未答/未判定 ${s?.unanswered}`, value: s?.unanswered || 0, itemStyle: { color: '#9ca3af' } }
      ],
      label: { formatter: '{b}: {d}%' }
    }]
  }
})
const accBarOption = computed(() => {
  const cats = [], vals = []
  for (const m of MODULES) {
    const b = ps.value?.byModule[m.id]
    if (!b || !b.total) continue
    cats.push(m.name)
    vals.push(Math.round((b.correct / b.total) * 1000) / 10)
  }
  return {
    grid: { left: 46, right: 16, top: 20, bottom: 26 },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: [{ type: 'bar', data: vals, itemStyle: { color: '#2f6fed', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', formatter: '{c}%' } }],
    tooltip: { trigger: 'axis', valueFormatter: v => v + '%' }
  }
})
function onModuleClick(params) {
  const m = MODULES.find(x => x.name === params.name)
  if (m) filterModule.value = m.id
}

// ---------- 错题确认收录 ----------
const confirmRows = ref([])
function rebuildConfirmRows() {
  if (!ps.value) { confirmRows.value = []; return }
  const rows = []
  for (const q of ps.value.questionList) {
    const rec = recOf(q.id)
    const judged = rec && rec.userAnswer && rec.isCorrect !== null && rec.isCorrect !== undefined
    const ok = judged ? rec.isCorrect : false
    // 待确认 = 未判定（未作答/缺答案）或判定为错；默认预勾选（依据设计方案 3.2）
    const needConfirm = !judged || !ok
    if (!needConfirm) continue
    const mistake = store.mistakes.find(x => x.questionId === q.id)
    rows.push(reactive({
      q, rec, ok: judged && ok, checked: !mistake,
      mistakeId: mistake?.id || null,
      errorType: mistake?.errorTypeId || inferPreview(q, rec) || 3
    }))
  }
  confirmRows.value = rows
}
function inferPreview(q, rec) {
  // 展示用推断：无历史作答时，未作答→4(超时未答)，否则→3(方法不熟)（依据设计方案 3.4.2）
  if (!rec || !rec.userAnswer) return 4
  const earlier = store.records.filter(r => r.questionId === q.id && r.answeredAt < rec.answeredAt)
  if (earlier.some(r => r.isCorrect)) return 1
  const kpQIds = new Set(store.questions.filter(x => x.kpId === q.kpId).map(x => x.id))
  const kpRecs = store.records.filter(r => kpQIds.has(r.questionId)).sort((a, b) => a.answeredAt - b.answeredAt)
  const last = kpRecs.filter(r => r.answeredAt < rec.answeredAt).pop()
  if (last && !last.isCorrect) return 2
  return 3
}
const checkedPending = computed(() => confirmRows.value.filter(r => r.checked && !r.mistakeId))
function selectAllWrong() { confirmRows.value.forEach(r => { if (!r.mistakeId) r.checked = true }) }

async function confirmCollect() {
  for (const row of checkedPending.value) {
    await collectMistake(row.q, row.errorType, 'inferred')
  }
  await refreshStore()
  rebuildConfirmRows()
  toast(`已收录 ${checkedPending.value.length} 题入错题本`, 'success')
}

watch([sel, () => store.mistakes.length, () => store.records.length], rebuildConfirmRows, { immediate: true })
watch(sel, v => { filterModule.value = null })

// ---------- 编辑题目 ----------
watch(editQ, q => {
  if (!q) return
  editForm.typeId = q.typeId
  editForm.kpName = kpName(q.kpId)
  editForm.stem = q.stem || ''
  editForm.options = { ...(q.options || {}) }
  editForm.answer = q.answer || ''
  editForm.userAnswer = recOf(q.id)?.userAnswer || ''
  editForm.analysis = q.analysis || ''
})
async function saveQuestion() {
  const q = editQ.value
  const kpId = editForm.kpName.trim() ? await ensureKp(editForm.kpName.trim(), editForm.typeId) : q.kpId
  await db.questions.update(q.id, {
    typeId: editForm.typeId, kpId, stem: editForm.stem,
    options: editForm.options, answer: editForm.answer.toUpperCase(), analysis: editForm.analysis
  })
  const rec = recOf(q.id)
  if (rec) {
    const judged = editForm.answer && editForm.userAnswer
    await db.answerRecords.update(rec.id, {
      userAnswer: editForm.userAnswer.toUpperCase(),
      isCorrect: judged ? sameAnswer(editForm.userAnswer, editForm.answer) : null
    })
  }
  editQ.value = null
  await refreshStore()
  rebuildConfirmRows()
  toast('题目已更新，判定结果已刷新', 'success')
}
</script>
