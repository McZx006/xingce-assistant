<template>
  <div>
    <div v-if="!appendPaper" class="mb8">
      <PaperMeta :meta="meta" />
    </div>
    <div v-else class="card mb8">
      追加模式：向试卷「{{ appendPaper.name }}」追加题目，题号自动顺延
    </div>

    <div class="card">
      <h3>智能粘贴（提速核心：整题文本自动拆分）</h3>
      <textarea v-model="pasteText" rows="4" placeholder="粘贴整道题（或整卷多题），自动识别：&#10;1、题干……&#10;A．选项 B．选项&#10;答案：B&#10;解析：…&#10;知识点：逻辑填空-成语"></textarea>
      <div class="row mt8">
        <button class="btn primary" @click="pasteIntoCurrent">填入当前题</button>
        <button class="btn" @click="pasteWholePaper">按题号拆分为多题</button>
        <span class="muted">识别项：题干 / A-D选项 / 答案 / 解析 / 知识点行</span>
      </div>
    </div>

    <div class="grid cols-2 mt14">
      <div class="card">
        <div class="row mb8">
          <h3 style="margin:0">题目编辑</h3>
          <span class="tag" :class="curOk ? 'green' : 'red'">{{ curOk ? '答对' : '答错' }}</span>
          <span class="grow"></span>
          <button class="btn small danger" @click="removeCurrent">删除本题</button>
        </div>
        <div class="row mb8">
          <label class="field" style="width:90px"><span>题号</span>
            <input v-model.number="cur.qno" type="number" min="1" /></label>
          <label class="field" style="width:110px"><span>题型 *</span>
            <select v-model="cur.typeId">
              <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select></label>
          <label class="field grow"><span>知识点 *（可输入新建）</span>
            <input v-model="cur.kpName" list="kp-list" placeholder="从库中选择或直接输入新建" /></label>
          <datalist id="kp-list">
            <option v-for="k in store.kps" :key="k.id" :value="k.name">{{ moduleFull(k.moduleId) }}</option>
          </datalist>
        </div>
        <label class="field"><span>题干</span>
          <textarea v-model="cur.stem" rows="3"></textarea></label>
        <div class="row">
          <label class="field grow"><span>A</span><input v-model="cur.options.A" /></label>
          <label class="field grow"><span>B</span><input v-model="cur.options.B" /></label>
        </div>
        <div class="row">
          <label class="field grow"><span>C</span><input v-model="cur.options.C" /></label>
          <label class="field grow"><span>D</span><input v-model="cur.options.D" /></label>
        </div>
        <div class="row">
          <label class="field" style="width:130px"><span>正确答案 *</span>
            <input v-model="cur.answer" placeholder="如 B 或 AB" /></label>
          <label class="field" style="width:130px"><span>你的作答 *</span>
            <input v-model="cur.userAnswer" list="ua-list" placeholder="未作答可留空" />
            <datalist id="ua-list"><option>A</option><option>B</option><option>C</option><option>D</option><option value="">未作答</option></datalist>
          </label>
        </div>
        <label class="field"><span>解析（可选，展示在错题卡）</span>
          <textarea v-model="cur.analysis" rows="2"></textarea></label>
        <div class="row mt8">
          <button class="btn" @click="prev">上一题</button>
          <button class="btn primary" @click="next">保存草稿并下一题（Ctrl+Enter）</button>
          <button class="btn" @click="addQuestion">+ 添加题目</button>
        </div>
      </div>

      <div class="card">
        <h3>题目列表（点击切换）</h3>
        <div class="muted mb8">共 {{ drafts.length }} 题 · 已判定 {{ judgedCount }} 题 · 答对 {{ correctCount }} 题</div>
        <div style="max-height:430px;overflow:auto">
          <span v-for="(d, i) in drafts" :key="i" class="qchip"
            :class="[{ active: i === curIndex, ok: chipClass(d) === 'ok', wrong: chipClass(d) === 'wrong' }, chipClass(d)]"
            style="margin:3px" @click="curIndex = i">
            {{ d.qno }}
          </span>
        </div>
        <div class="basis mt14">
          <b>提速依据：</b>题型与知识点自动沿用上一题；粘贴整题文本自动拆分题干/选项/答案/解析；对错实时判定。保存时统一校验必填（设计方案 3.1.4）。
        </div>
        <div class="row mt14">
          <button class="btn primary" @click="saveAll">保存{{ appendPaper ? '追加题目' : '试卷' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PaperMeta from './PaperMeta.vue'
import { parseQuestionBlocks } from '../../parse'
import { saveImportedPaper, appendQuestions, sameAnswer } from '../../importHelpers'
import { MODULES } from '../../db'
import { store, toast } from '../../store'

const route = useRoute()
const router = useRouter()
const modules = MODULES
const moduleFull = id => MODULES.find(m => m.id === id)?.full || ''

const appendPaper = computed(() => {
  const pid = Number(route.query.paperId)
  return pid ? store.papers.find(p => p.id === pid) : null
})

const meta = reactive({ name: '', source: '', examDate: new Date().toISOString().slice(0, 10) })
const pasteText = ref('')
const drafts = ref([])
const curIndex = ref(0)

function blankDraft(inherit = null) {
  return reactive({
    qno: drafts.value.length + 1,
    typeId: inherit?.typeId || 1,
    kpName: inherit?.kpName || '',
    stem: '', options: { A: '', B: '', C: '', D: '' },
    answer: '', userAnswer: '', analysis: ''
  })
}
const cur = computed(() => {
  if (!drafts.value.length) drafts.value.push(blankDraft())
  return drafts.value[curIndex.value] || drafts.value[0]
})
const curOk = computed(() => !!cur.value.answer && sameAnswer(cur.value.userAnswer, cur.value.answer))
const judgedCount = computed(() => drafts.value.filter(d => d.answer && d.userAnswer).length)
const correctCount = computed(() => drafts.value.filter(d => d.answer && sameAnswer(d.userAnswer, d.answer)).length)

function chipClass(d) {
  if (!d.answer || !d.userAnswer) return ''
  return sameAnswer(d.userAnswer, d.answer) ? 'ok' : 'wrong'
}

function addQuestion() {
  const prev = drafts.value[curIndex.value]
  drafts.value.push(blankDraft(prev)) // 题型/知识点沿用上一题（提速点）
  curIndex.value = drafts.value.length - 1
  fixQnos()
}
function prev() { if (curIndex.value > 0) curIndex.value-- }
function next() {
  if (!cur.value.answer) { toast('请先填写正确答案', 'error'); return }
  if (curIndex.value === drafts.value.length - 1) addQuestion()
  else curIndex.value++
}
function removeCurrent() {
  if (!drafts.value.length) return
  drafts.value.splice(curIndex.value, 1)
  if (curIndex.value >= drafts.value.length) curIndex.value = Math.max(0, drafts.value.length - 1)
  fixQnos()
}
function fixQnos() { drafts.value.forEach((d, i) => { d.qno = i + 1 }) }

// Ctrl+Enter 快捷流转
function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); next() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// 智能粘贴
function pasteIntoCurrent() {
  const blocks = parseQuestionBlocks(pasteText.value)
  if (!blocks.length) { toast('未识别到题目结构（需以“1、”等题号开头）', 'error'); return }
  applyBlock(cur.value, blocks[0])
  toast('已填入当前题，请核对', 'success')
}
function pasteWholePaper() {
  const blocks = parseQuestionBlocks(pasteText.value)
  if (!blocks.length) { toast('未识别到题目结构', 'error'); return }
  const inherit = drafts.value[curIndex.value] || null
  drafts.value = blocks.map(b => {
    const d = blankDraft(inherit)
    applyBlock(d, b)
    return d
  })
  curIndex.value = 0
  toast(`已拆分 ${blocks.length} 题，请逐题核对`, 'success')
}
function applyBlock(d, b) {
  if (b.stem) d.stem = b.stem
  for (const l of ['A', 'B', 'C', 'D']) if (b.options[l]) d.options[l] = b.options[l]
  if (b.answer) d.answer = b.answer
  if (b.userAnswer) d.userAnswer = b.userAnswer
  if (b.analysis) d.analysis = b.analysis
  if (b.kpName) d.kpName = b.kpName
}

async function saveAll() {
  const valid = drafts.value.filter(d => d.stem || d.answer || d.options.A)
  if (!valid.length) { toast('没有可保存的题目', 'error'); return }
  const missing = valid.filter(d => !d.answer)
  if (missing.length) { toast(`第 ${missing.map(d => d.qno).join('、')} 题缺少正确答案`, 'error'); return }
  const items = valid.map(d => ({
    qno: d.qno, typeId: d.typeId, stem: d.stem, options: cleanOptions(d.options),
    answer: d.answer, userAnswer: d.userAnswer, kpName: d.kpName, analysis: d.analysis
  }))
  try {
    if (appendPaper.value) {
      await appendQuestions(appendPaper.value.id, items)
      toast('已追加，去错题确认页检查', 'success')
      router.push({ path: '/papers', query: { paperId: appendPaper.value.id, confirm: 1 } })
    } else {
      const paperId = await saveImportedPaper(meta, items, { judge: true, autoCollectWrong: false })
      toast('试卷已保存，去确认错题收录', 'success')
      router.push({ path: '/papers', query: { paperId, confirm: 1 } })
    }
  } catch (e) { toast(e.message || '保存失败', 'error') }
}
function cleanOptions(o) {
  const r = {}
  for (const l of ['A', 'B', 'C', 'D']) if ((o[l] || '').trim()) r[l] = o[l].trim()
  return r
}

watch(appendPaper, v => { if (v) fixQnos() }, { immediate: true })
</script>
