<template>
  <div>
    <div class="page-head">
      <h1>概览</h1>
      <p>数据全部存储在本机浏览器（IndexedDB），离线可用</p>
    </div>

    <div class="grid cols-4">
      <div class="card">
        <div class="stat-num">{{ store.papers.length }}</div>
        <div class="stat-label">试卷数</div>
        <div class="stat-base">依据：paper 表</div>
      </div>
      <div class="card">
        <div class="stat-num">{{ store.questions.length }}</div>
        <div class="stat-label">累计题量</div>
        <div class="stat-base">依据：question 表</div>
      </div>
      <div class="card">
        <div class="stat-num">{{ pendingMistakes }}</div>
        <div class="stat-label">待复习错题</div>
        <div class="stat-base">依据：mistake 表 status='待复习'</div>
      </div>
      <div class="card">
        <div class="stat-num">{{ todayRecords }}</div>
        <div class="stat-label">今日作答（题）</div>
        <div class="stat-base">依据：answer_record 今日流水</div>
      </div>
    </div>

    <div class="grid cols-2 mt14">
      <div class="card">
        <h3>当前最薄弱 Top 3 <span class="muted">（依据：薄弱度公式，见「薄弱分析」页）</span></h3>
        <div v-if="!topWeak.length" class="empty-tip">录入并作答后自动生成</div>
        <table v-else class="tbl">
          <thead><tr><th>知识点</th><th>错误率</th><th>题量</th><th>近3次</th></tr></thead>
          <tbody>
            <tr v-for="w in topWeak" :key="w.kpId" class="clickable" @click="$router.push('/analysis')">
              <td>{{ kpName(w.kpId) }} <span v-if="w.lowSample" class="tag amber">样本少</span></td>
              <td>{{ pct(w.errRate) }}（{{ w.wrong }}/{{ w.total }}）</td>
              <td>{{ w.total }}</td>
              <td>{{ arrowText(w.arrows) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="basis"><b>口径：</b>全部作答记录（试卷+练习），n={{ store.records.length }} 条</div>
      </div>

      <div class="card">
        <h3>快捷入口</h3>
        <div class="row mt8">
          <button class="btn primary" @click="$router.push({ path: '/import', query: { tab: 'card' } })">答题卡快速录入</button>
          <button class="btn" @click="$router.push({ path: '/import', query: { tab: 'ocr' } })">文件导入（PDF/Word/图片）</button>
          <button class="btn" @click="$router.push({ path: '/import', query: { tab: 'fenbi' } })">粉笔模考导入</button>
          <button class="btn" @click="$router.push('/practice')">开始刷错题</button>
        </div>
        <div class="basis mt14">
          <b>录入提速（对应设计方案量化目标：130题手动录入≤25分钟）：</b><br />
          ① 答题卡模式：只需粘贴「你的作答串」+「答案串」，130题约2分钟完成对错统计，题干可后补；<br />
          ② 逐题录入：粘贴整题文本自动拆分题干/选项/答案，题型与知识点自动沿用上一题；<br />
          ③ OCR：图像预处理+Worker复用，多图排队识别，低置信度自动高亮；<br />
          ④ 粉笔导入：粘贴成绩页文本一键解析模块得分与逐题对错。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store } from '../store'
import { weakPoints, pct } from '../stats'

const pendingMistakes = computed(() => store.mistakes.filter(m => m.status === '待复习').length)
const todayRecords = computed(() => {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return store.records.filter(r => r.answeredAt >= d.getTime()).length
})
const topWeak = computed(() => weakPoints(store.questions, store.records, 'all').slice(0, 3))
const kpName = id => store.kps.find(k => k.id === id)?.name || '未知'
function arrowText(arrows) {
  const map = { up: '↑', down: '↓', flat: '→' }
  return arrows.length ? arrows.map(a => map[a]).join(' ') : '—'
}
</script>
