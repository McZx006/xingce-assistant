<template>
  <div>
    <div class="page-head">
      <h1>错题本</h1>
      <p>可筛选、可复习的错题库 —— 状态与掌握度驱动复习（设计方案 3.2）</p>
    </div>

    <div class="card">
      <div class="row mb8">
        <select v-model="fType" style="width:100px">
          <option value="">全部题型</option>
          <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <select v-model="fKp" style="width:170px">
          <option value="">全部知识点</option>
          <option v-for="k in store.kps" :key="k.id" :value="k.id">{{ k.name }}</option>
        </select>
        <select v-model="fPaper" style="width:190px">
          <option value="">全部来源试卷</option>
          <option v-for="p in store.papers" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-model="fError" style="width:130px">
          <option value="">全部错误类型</option>
          <option v-for="et in errorTypes" :key="et.id" :value="et.id">{{ et.name }}</option>
        </select>
        <select v-model="fStatus" style="width:110px">
          <option value="">全部状态</option>
          <option value="待复习">待复习</option>
          <option value="已掌握">已掌握</option>
        </select>
        <select v-model="fTime" style="width:110px">
          <option value="all">全部时间</option>
          <option value="week">最近7天</option>
          <option value="month">最近30天</option>
        </select>
        <span class="grow"></span>
        <span class="muted">共 {{ filtered.length }} 条</span>
      </div>

      <div class="row mb8" v-if="filtered.length">
        <button class="btn small" @click="batchStatus('已掌握')">批量标记已掌握</button>
        <button class="btn small" @click="batchStatus('待复习')">批量恢复待复习</button>
        <span style="width:1px;height:20px;background:var(--line)"></span>
        <span class="muted">批量打错误类型：</span>
        <select v-model="batchError" style="width:120px">
          <option v-for="et in errorTypes" :key="et.id" :value="et.id">{{ et.name }}</option>
        </select>
        <button class="btn small" @click="batchTag">应用到所选</button>
      </div>

      <table class="tbl">
        <thead>
          <tr>
            <th style="width:36px"><input type="checkbox" @change="toggleAll($event)" /></th>
            <th>题号</th><th>题型</th><th>知识点</th><th>来源试卷</th><th>错误类型</th>
            <th>状态</th><th>掌握度</th><th>加入时间</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.m.id">
            <td><input v-model="selected" :value="row.m.id" type="checkbox" /></td>
            <td>{{ row.q?.qno || '—' }}</td>
            <td>{{ moduleName(row.q?.typeId) }}</td>
            <td>{{ kpName(row.q?.kpId) }}</td>
            <td class="muted">{{ row.paper?.name || '—' }}</td>
            <td>
              <span class="tag amber">{{ errorTypeName(row.m.errorTypeId) }}</span>
              <span v-if="row.m.errorTypeSource !== 'manual'" class="muted" style="font-size:11px"> 推断</span>
            </td>
            <td><span :class="row.m.status === '已掌握' ? 'tag green' : 'tag blue'">{{ row.m.status }}</span></td>
            <td><span class="mastery-dots">{{ '●'.repeat(row.m.mastery || 0) }}{{ '○'.repeat(3 - (row.m.mastery || 0)) }}</span></td>
            <td class="muted">{{ fmtDate(row.m.addedAt) }}</td>
            <td><button class="btn small" @click="openDetail(row.m.id)">解析</button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!filtered.length" class="empty-tip">暂无错题。错题来源：①试卷保存后「错题确认收录」 ②粉笔导入自动收录 ③练习答错自动收录</div>
      <div class="basis">
        <b>口径：</b>掌握度 = 练习中连续答对次数（依据设计方案 3.2，达 3 次自动建议标记已掌握）；错误类型标注「推断」的为系统规则推断，可点解析卡改为手动标注。
      </div>
    </div>

    <div v-if="detailId !== null" class="modal-mask" @click.self="detailId = null">
      <div class="modal" style="width:min(860px,94vw)">
        <div class="row mb8">
          <h3 style="margin:0">错题解析（粉笔式呈现）</h3>
          <span class="grow"></span>
          <button class="btn small" @click="detailId = null">关闭</button>
        </div>
        <MistakeDetail :mistake-id="detailId" @practice="goPractice" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import MistakeDetail from '../components/MistakeDetail.vue'
import { MODULES, ERROR_TYPES, db } from '../db'
import { store, refreshStore, toast } from '../store'
import { rangeStart, fmtDate } from '../stats'

const router = useRouter()
const modules = MODULES
const errorTypes = ERROR_TYPES

const fType = ref(''), fKp = ref(''), fPaper = ref(''), fError = ref(''), fStatus = ref(''), fTime = ref('all')
const selected = ref([])
const detailId = ref(null)
const batchError = ref(2)

const moduleName = id => MODULES.find(m => m.id === id)?.name || '—'
const kpName = id => store.kps.find(k => k.id === id)?.name || '待标注'
const errorTypeName = id => ERROR_TYPES.find(e => e.id === id)?.name || '未标注'

const filtered = computed(() => {
  const start = rangeStart(fTime.value)
  return store.mistakes
    .filter(m => m.addedAt >= start)
    .map(m => ({
      m,
      q: store.questions.find(q => q.id === m.questionId),
      paper: null
    }))
    .filter(row => !fType.value || row.q?.typeId === Number(fType.value))
    .filter(row => !fKp.value || row.q?.kpId === Number(fKp.value))
    .filter(row => !fError.value || row.m.errorTypeId === Number(fError.value))
    .filter(row => !fStatus.value || row.m.status === fStatus.value)
    .map(row => ({ ...row, paper: store.papers.find(p => p.id === row.q?.paperId) }))
    .filter(row => !fPaper.value || row.paper?.id === Number(fPaper.value))
    .sort((a, b) => b.m.addedAt - a.m.addedAt)
})

function toggleAll(e) {
  selected.value = e.target.checked ? filtered.value.map(r => r.m.id) : []
}
async function batchStatus(status) {
  if (!selected.value.length) { toast('请先勾选错题', 'error'); return }
  for (const id of selected.value) await db.mistakes.update(id, { status })
  await refreshStore()
  toast(`已批量更新 ${selected.value.length} 条状态`, 'success')
  selected.value = []
}
async function batchTag() {
  if (!selected.value.length) { toast('请先勾选错题', 'error'); return }
  for (const id of selected.value) await db.mistakes.update(id, { errorTypeId: batchError.value, errorTypeSource: 'manual' })
  await refreshStore()
  toast(`已为 ${selected.value.length} 条打上「${errorTypeName(batchError.value)}」（手动标注）`, 'success')
  selected.value = []
}
function openDetail(id) { detailId.value = id }
function goPractice() {
  detailId.value = null
  router.push({ path: '/practice', query: { strategy: 'wrong' } })
}
</script>
