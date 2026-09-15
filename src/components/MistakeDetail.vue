<template>
  <div v-if="q" class="mistake-detail">
    <div class="row mb8">
      <span class="tag blue">{{ typeName }}</span>
      <span class="tag">{{ kpName || '知识点待标注' }}</span>
      <span class="muted">来源：{{ sourceName }} · 第{{ q.qno }}题</span>
      <span class="grow"></span>
      <span v-if="masteryInfo" class="muted">掌握度 <span class="mastery-dots">{{ masteryInfo }}</span>（连续答对/3）</span>
    </div>

    <div class="q-stem">{{ q.stem || '（题干未录入：可回「录入试卷-逐题录入」补全，不影响统计）' }}</div>

    <div class="mt8">
      <div v-for="opt in optionList" :key="opt.letter" class="opt-row"
        :class="{ correct: isAnswer(opt.letter), wrong: isWrongChoice(opt.letter) }">
        <span class="opt-letter">{{ opt.letter }}.</span>
        <span>{{ opt.text || '（选项未录入）' }}</span>
        <span class="grow"></span>
        <span v-if="isAnswer(opt.letter)" class="tag green">正确答案</span>
        <span v-if="isWrongChoice(opt.letter)" class="tag red">你的错选</span>
      </div>
    </div>

    <div class="grid cols-2 mt14">
      <div class="card">
        <h3>个人正确率与易错项</h3>
        <div class="row">
          <div>
            <div class="stat-num">{{ ostats.accuracy === null ? '—' : pct(ostats.accuracy) }}</div>
            <div class="stat-label">该题个人正确率</div>
            <div class="stat-base">依据：该题全部作答记录 n={{ ostats.attempts }} 次（含练习）</div>
          </div>
          <div class="grow">
            <div class="muted mb8">易错项分布（你的历次错选，口径=个人作答记录，非全站数据）：</div>
            <div v-for="[opt, n] in ostats.distribution" :key="opt" class="row mb8">
              <span class="tag red" style="min-width:24px;text-align:center">{{ opt }}</span>
              <div class="bar-track grow">
                <div class="bar-fill" :style="{ width: (n / Math.max(1, ostats.attempts - ostats.corrects) * 100) + '%', background: 'var(--red)' }"></div>
              </div>
              <span class="muted">{{ n }}次</span>
            </div>
            <div v-if="!ostats.distribution.length" class="muted">暂无错选记录</div>
          </div>
        </div>
        <div class="basis">
          <b>粉笔式呈现说明：</b>粉笔的「正确率/易错项」来自全站作答数据；本工具为单机应用，以上数据全部来自<b>你自己的作答记录</b>（answer_record 表，n={{ ostats.attempts }}），保证有据可查。
        </div>
      </div>

      <div class="card">
        <h3>错因与掌握进度</h3>
        <div class="row mb8">
          <span class="tag amber">{{ errorTypeName }}</span>
          <span class="tag">{{ errorTypeSourceLabel }}</span>
        </div>
        <div class="muted">错误类型来源：{{ errorTypeSourceLabel }}{{ errorTypeSource === 'inferred' ? '（规则依据：设计方案3.4.2 —— 未作答→超时未答；曾对后错→粗心；同知识点连续错→概念不清；其余→方法不熟）' : '' }}</div>
        <div class="mt14">
          <label class="field"><span>更换错因标签</span>
            <div class="row">
              <select v-model="newErrorType" style="max-width:160px">
                <option v-for="et in errorTypes" :key="et.id" :value="et.id">{{ et.name }}</option>
              </select>
              <button class="btn small" @click="saveErrorType">保存</button>
            </div>
          </label>
        </div>
        <div class="basis">
          <b>作答轨迹（{{ trackRecords.length }} 条，依据：answer_record 流水）：</b>
          <div v-for="r in trackRecords" :key="r.id" class="mt8">
            {{ fmtTime(r.answeredAt) }} · {{ r.mode === 'practice' ? '练习' : '试卷' }} ·
            作答 {{ r.userAnswer || '未作答' }} ·
            <span :style="{ color: r.userAnswer ? (r.isCorrect ? 'var(--green)' : 'var(--red)') : 'var(--ink-3)' }">
              {{ r.userAnswer ? (r.isCorrect ? '正确' : '错误') : '未作答' }}
            </span>
          </div>
          <div v-if="!trackRecords.length">暂无作答记录</div>
        </div>
      </div>
    </div>

    <div class="card mt14">
      <h3>答案解析（可粘贴粉笔 App 该题的解析文本）</h3>
      <textarea v-model="analysisDraft" rows="4" placeholder="粘贴粉笔解析，或写下自己的解题思路…（保存到本地题库）"></textarea>
      <div class="row mt8">
        <button class="btn primary small" @click="saveAnalysis">保存解析</button>
        <span class="muted">依据：解析为人工粘贴/自写内容，系统不臆造解析文本；上方统计数据均为本地作答记录计算所得。</span>
      </div>
    </div>

    <div class="row mt14">
      <button class="btn" @click="$emit('practice')">去练习此题</button>
      <button class="btn" @click="markMastered">标记为已掌握</button>
      <button class="btn danger" @click="removeMistake">移出错题本</button>
    </div>
  </div>
  <div v-else class="empty-tip">未找到该题目数据</div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { store, refreshStore, toast } from '../store'
import { db, ERROR_TYPES } from '../db'
import { wrongOptionStats, pct, fmtTime } from '../stats'

const props = defineProps({ mistakeId: { type: Number, required: true } })
defineEmits(['practice'])

const q = computed(() => {
  const m = store.mistakes.find(x => x.id === props.mistakeId)
  return m ? store.questions.find(x => x.id === m.questionId) : null
})
const mistake = computed(() => store.mistakes.find(x => x.id === props.mistakeId))
const typeName = computed(() => {
  const names = { 1: '言语', 2: '数量', 3: '判断', 4: '资料', 5: '常识' }
  return names[q.value?.typeId] || '未知'
})
const kpName = computed(() => store.kps.find(k => k.id === q.value?.kpId)?.name || '')
const sourceName = computed(() => store.papers.find(p => p.id === q.value?.paperId)?.name || '—')
const errorTypes = ERROR_TYPES
const errorTypeName = computed(() => ERROR_TYPES.find(e => e.id === mistake.value?.errorTypeId)?.name || '未标注')
const errorTypeSource = computed(() => mistake.value?.errorTypeSource || 'manual')
const errorTypeSourceLabel = computed(() => errorTypeSource.value === 'manual' ? '手动标注' : '系统推断')
const masteryInfo = computed(() => {
  const m = mistake.value
  if (!m) return ''
  return '●'.repeat(m.mastery || 0) + '○'.repeat(Math.max(0, 3 - (m.mastery || 0)))
})
const optionList = computed(() => {
  const opts = q.value?.options || {}
  return ['A', 'B', 'C', 'D'].filter(l => (opts[l] || '').trim() !== '' || isAnswer(l)).map(l => ({ letter: l, text: opts[l] }))
})
const isAnswer = letter => (q.value?.answer || '').includes(letter)
const isWrongChoice = letter => {
  if (!isAnswer(letter) && !q.value?.answer) return false
  const wrongs = ostats.value.distribution.map(d => d[0])
  return wrongs.includes(letter)
}
const ostats = computed(() => wrongOptionStats(q.value || {}, store.records))
const trackRecords = computed(() => store.records
  .filter(r => r.questionId === q.value?.id)
  .sort((a, b) => b.answeredAt - a.answeredAt))

const analysisDraft = ref('')
const newErrorType = ref(null)
watch(() => props.mistakeId, () => {
  analysisDraft.value = q.value?.analysis || ''
  newErrorType.value = mistake.value?.errorTypeId || null
}, { immediate: true })
watch(q, () => { analysisDraft.value = q.value?.analysis || '' })

async function saveAnalysis() {
  if (!q.value) return
  await db.questions.update(q.value.id, { analysis: analysisDraft.value })
  await refreshStore()
  toast('解析已保存', 'success')
}
async function saveErrorType() {
  if (!newErrorType.value) return
  await db.mistakes.update(mistake.value.id, { errorTypeId: newErrorType.value, errorTypeSource: 'manual' })
  await refreshStore()
  toast('错因标签已更新（来源：手动标注）', 'success')
}
async function markMastered() {
  await db.mistakes.update(mistake.value.id, { status: '已掌握' })
  await refreshStore()
  toast('已标记为已掌握，退出默认复习池（保留记录用于统计）', 'success')
}
async function removeMistake() {
  await db.mistakes.delete(mistake.value.id)
  await refreshStore()
  toast('已移出错题本', 'success')
}
</script>

<style scoped>
.q-stem { line-height: 1.8; white-space: pre-wrap; background: #f8fafc; border-radius: 8px; padding: 12px 14px; }
.mistake-detail { width: 100%; }
</style>
