<template>
  <div>
    <div class="page-head">
      <h1>刷题练习</h1>
      <p>按策略出题，作答结果回写作答记录与错题本（设计方案 3.3）</p>
    </div>

    <!-- 出题设置 -->
    <div v-if="!session" class="card">
      <div class="row mb8">
        <label class="row" style="gap:4px"><input v-model="strategy" type="radio" value="wrong" /> 仅错题（待复习池）</label>
        <label class="row" style="gap:4px"><input v-model="strategy" type="radio" value="weak" /> 薄弱知识点 Top5</label>
        <label class="row" style="gap:4px"><input v-model="strategy" type="radio" value="random" /> 随机抽题</label>
        <label class="row" style="gap:4px"><input v-model="strategy" type="radio" value="paper" /> 按试卷重做</label>
        <select v-if="strategy === 'paper'" v-model="paperId" style="width:200px">
          <option v-for="p in store.papers" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-model.number="count" style="width:110px">
          <option :value="10">10 题</option><option :value="20">20 题</option><option :value="30">30 题</option>
        </select>
        <button class="btn primary" @click="start">开始练习</button>
      </div>
      <table class="tbl" style="max-width:640px">
        <thead><tr><th>策略</th><th>取题范围</th><th>当前可用</th></tr></thead>
        <tbody>
          <tr><td>仅错题</td><td>错题本「待复习」的题</td><td>{{ poolSizes.wrong }} 题</td></tr>
          <tr><td>薄弱知识点</td><td>薄弱度 Top5 知识点下的题</td><td>{{ poolSizes.weak }} 题</td></tr>
          <tr><td>随机抽题</td><td>全题库</td><td>{{ poolSizes.random }} 题</td></tr>
          <tr><td>按试卷重做</td><td>指定试卷全部题</td><td>{{ poolSizes.paper }} 题</td></tr>
        </tbody>
      </table>
      <div class="basis"><b>策略依据：</b>设计方案 3.3 出题策略表。薄弱知识点取自「薄弱分析」页的薄弱度排序（公式与依据同）。</div>
    </div>

    <!-- 练习中 -->
    <div v-else-if="q" class="card">
      <div class="row mb8">
        <span class="tag blue">第 {{ idx + 1 }} / {{ queue.length }} 题</span>
        <span class="tag">{{ typeName }}</span>
        <span class="tag" v-if="kpName">{{ kpName }}</span>
        <span class="muted">来源：{{ sourceName }}{{ q.fenbiQno ? ` · 粉笔原题${q.fenbiQno}` : '' }}</span>
        <span class="grow"></span>
        <span class="muted">本轮正确率 {{ sessionAccuracy }}（{{ sessionCorrect }}/{{ idx }}）</span>
        <button class="btn small" @click="quit">结束本轮</button>
      </div>

      <div class="q-stem">{{ q.stem || '（该题题干未录入：可在试卷页编辑补全；可先根据记忆作答或跳过）' }}</div>

      <div class="mt8">
        <div v-for="opt in optionList" :key="opt.letter" class="opt-row clickable"
          :class="{ correct: submitted && isAnswer(opt.letter), wrong: submitted && isWrongSel(opt.letter), active: !submitted && selected.includes(opt.letter) }"
          @click="!submitted && toggle(opt.letter)">
          <span class="opt-letter">{{ opt.letter }}.</span>
          <span>{{ opt.text || '（选项未录入）' }}</span>
          <span class="grow"></span>
          <span v-if="submitted && isAnswer(opt.letter)" class="tag green">正确答案</span>
          <span v-if="submitted && isWrongSel(opt.letter)" class="tag red">你选的</span>
        </div>
        <div v-if="!optionList.length" class="muted mt8">该题选项未录入（答题卡/粉笔导入的题可后补），直接提交你的记忆作答：</div>
      </div>

      <div v-if="!submitted" class="row mt14">
        <span class="muted">已选：{{ selected.join('') || '未选择（提交视为未作答）' }}</span>
        <span class="grow"></span>
        <button class="btn" @click="skip">跳过</button>
        <button class="btn primary" @click="submit">提交</button>
      </div>

      <!-- 粉笔式即时反馈 -->
      <div v-else class="mt14">
        <div class="card" :style="{ borderLeft: '4px solid ' + (result.ok ? 'var(--green)' : 'var(--red)') }">
          <h3>
            {{ result.ok ? '回答正确' : (result.unanswered ? '未作答' : '回答错误') }}
            <span class="muted" style="font-weight:400">· 正确答案：{{ q.answer || '未录入' }} · 你的作答：{{ result.answer || '未作答' }}</span>
          </h3>
          <div v-if="!result.ok && q.answer" class="muted mb8">
            错因已自动登记：{{ result.errorTypeName }}（<span v-if="result.existed">该题已在错题本，掌握度已重置</span><span v-else>已新收入错题本</span>，依据设计方案 3.3）
          </div>
          <div v-if="result.ok && result.mastered" class="tag green">连续 3 次答对，已自动标记「已掌握」（依据设计方案 3.2，可在错题本恢复）</div>
          <div v-if="q.analysis" class="mt8" style="line-height:1.8;white-space:pre-wrap">
            <b>解析：</b>{{ q.analysis }}
          </div>
          <div v-else class="muted mt8">该题暂无解析文本（可在错题卡粘贴粉笔解析，系统不臆造解析内容）</div>
          <div class="basis">
            <b>数据反馈（口径=你的个人作答记录）：</b>该题累计作答 {{ result.os.attempts }} 次，个人正确率 {{ result.os.accuracy === null ? '—' : pct(result.os.accuracy) }}<template v-if="result.os.topWrong">；历史错选最多：{{ result.os.topWrong }}（{{ result.os.distribution[0][1] }} 次）</template>
          </div>
        </div>
        <div class="row mt8">
          <button class="btn primary" @click="nextQ">下一题</button>
        </div>
      </div>
    </div>

    <!-- 本轮结束 -->
    <div v-else class="card">
      <h3>本轮练习完成</h3>
      <div class="stat-num">{{ sessionAccuracy }}</div>
      <div class="stat-label">本轮正确率（{{ sessionCorrect }}/{{ idx }} 已作答）</div>
      <div class="basis"><b>依据：</b>本轮每次作答均已写入作答记录（mode=practice），计入长期趋势的「各模块正确率趋势」与「累计错题」（依据设计方案 3.5.2）。</div>
      <div class="row mt14">
        <button class="btn primary" @click="session = null">再练一轮</button>
        <router-link class="btn" to="/mistakes">去错题本查看</router-link>
        <router-link class="btn" to="/analysis">看薄弱分析</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { db, collectMistake, inferErrorType } from '../db'
import { store, refreshStore, toast } from '../store'
import { weakPoints, wrongOptionStats, pct } from '../stats'
import { sameAnswer } from '../importHelpers'
import { MODULES, ERROR_TYPES } from '../db'

const route = useRoute()
const strategy = ref('wrong')
const paperId = ref(null)
const count = ref(20)
const session = ref(false)
const queue = ref([])
const idx = ref(0)
const selected = ref([])
const submitted = ref(false)
const result = ref(null)
const sessionCorrect = ref(0)

onMounted(() => {
  if (route.query.strategy) strategy.value = route.query.strategy
})

const poolSizes = computed(() => ({
  wrong: store.mistakes.filter(m => m.status === '待复习').length,
  weak: weakPoints(store.questions, store.records, 'all').slice(0, 5)
    .reduce((s, w) => s + w.questionIds.length, 0),
  random: store.questions.length,
  paper: paperId.value ? store.questions.filter(q => q.paperId === Number(paperId.value)).length : 0
}))

function start() {
  let ids = []
  if (strategy.value === 'wrong') {
    ids = store.mistakes.filter(m => m.status === '待复习').map(m => m.questionId)
  } else if (strategy.value === 'weak') {
    const top5 = weakPoints(store.questions, store.records, 'all').slice(0, 5)
    ids = [...new Set(top5.flatMap(w => w.questionIds))]
  } else if (strategy.value === 'random') {
    ids = store.questions.map(q => q.id)
  } else if (strategy.value === 'paper') {
    if (!paperId.value) { toast('请选择试卷', 'error'); return }
    ids = store.questions.filter(q => q.paperId === Number(paperId.value)).map(q => q.id)
  }
  ids = [...new Set(ids)].filter(Boolean)
  if (!ids.length) { toast('该策略下暂无可练题目', 'error'); return }
  // 随机打乱，截取题数
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  queue.value = ids.slice(0, count.value)
  idx.value = 0
  sessionCorrect.value = 0
  submitted.value = false
  result.value = null
  selected.value = []
  session.value = true
}

const q = computed(() => {
  const id = queue.value[idx.value]
  return id ? store.questions.find(x => x.id === id) : null
})
const typeName = computed(() => MODULES.find(m => m.id === q.value?.typeId)?.name || '—')
const kpName = computed(() => store.kps.find(k => k.id === q.value?.kpId)?.name || '')
const sourceName = computed(() => store.papers.find(p => p.id === q.value?.paperId)?.name || '—')
const sessionAccuracy = computed(() => idx.value ? pct(sessionCorrect.value / idx.value) : '—')

const optionList = computed(() => {
  const opts = q.value?.options || {}
  return ['A', 'B', 'C', 'D'].filter(l => (opts[l] || '').trim()).map(l => ({ letter: l, text: opts[l] }))
})
const isAnswer = letter => (q.value?.answer || '').includes(letter)
const isWrongSel = letter => selected.value.includes(letter) && !isAnswer(letter)
function toggle(letter) {
  const i = selected.value.indexOf(letter)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(letter)
}

async function submit() {
  const answer = selected.value.slice().sort().join('')
  const judged = !!q.value.answer // 无标准答案的题（答题卡/粉笔导入未补答案）不判定也不入错题本
  const ok = judged && !!answer && sameAnswer(answer, q.value.answer)
  const rec = {
    questionId: q.value.id, paperId: null, mode: 'practice',
    userAnswer: answer, isCorrect: judged ? ok : null,
    answeredAt: Date.now()
  }
  await db.answerRecords.add(rec)
  // 错题本回写（依据设计方案 3.3：答错加入/刷新错题本；答对掌握度+1）
  const exist = store.mistakes.find(m => m.questionId === q.value.id)
  if (judged && !ok) {
    const qRecords = store.records.filter(r => r.questionId === q.value.id).sort((a, b) => a.answeredAt - b.answeredAt)
    qRecords.push(rec)
    const kpQIds = new Set(store.questions.filter(x => x.kpId === q.value.kpId).map(x => x.id))
    const kpRecords = store.records.filter(r => kpQIds.has(r.questionId)).sort((a, b) => a.answeredAt - b.answeredAt)
    kpRecords.push(rec)
    const et = inferErrorType(rec, qRecords, kpRecords)
    await collectMistake(q.value, et, 'inferred')
    result.value = {
      ok, unanswered: !answer, answer, os: null,
      existed: !!exist, errorTypeName: ERROR_TYPES.find(e => e.id === et)?.name
    }
  } else if (judged && ok) {
    let mastered = false
    if (exist) {
      const mastery = (exist.mastery || 0) + 1
      if (mastery >= 3) {
        await db.mistakes.update(exist.id, { mastery, status: '已掌握' })
        mastered = true
      } else {
        await db.mistakes.update(exist.id, { mastery })
      }
    }
    result.value = { ok, unanswered: false, answer, os: null, mastered }
  } else {
    // 未判定（该题无标准答案）：仅记录作答
    result.value = { ok: false, unanswered: !answer, answer, os: null }
  }
  if (ok) sessionCorrect.value++
  await refreshStore()
  // 反馈中的个人正确率基于最新记录
  result.value.os = wrongOptionStats(q.value, store.records)
  submitted.value = true
}

function skip() { nextQ() }
async function nextQ() {
  if (idx.value >= queue.value.length - 1) {
    idx.value++
    return
  }
  idx.value++
  selected.value = []
  submitted.value = false
  result.value = null
}
function quit() { session.value = false }
</script>

<style scoped>
.opt-row.active { border-color: var(--primary); background: var(--primary-weak); }
.q-stem { line-height: 1.8; white-space: pre-wrap; background: #f8fafc; border-radius: 8px; padding: 12px 14px; }
</style>
