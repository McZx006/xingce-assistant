<template>
  <div>
    <div class="page-head">
      <h1>统计趋势</h1>
      <p>单卷复盘 + 长期进步追踪（设计方案 3.5），图表均可点击下钻</p>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'paper' }" @click="tab = 'paper'">单卷统计</button>
      <button :class="{ active: tab === 'long' }" @click="tab = 'long'">长期趋势</button>
    </div>

    <!-- 单卷统计 -->
    <div v-if="tab === 'paper'" class="card">
      <div class="row mb8">
        <select v-model="paperId" style="max-width:260px">
          <option v-for="p in store.papers" :key="p.id" :value="p.id">{{ p.name }}（{{ fmtDate(p.examDate) }}）</option>
        </select>
        <span class="grow"></span>
        <router-link v-if="paperId" class="btn small" :to="{ path: '/papers', query: { paperId } }">去试卷详情</router-link>
      </div>
      <div v-if="!paperId || !curStats" class="empty-tip">请选择试卷</div>
      <template v-else>
        <div class="grid cols-3">
          <div class="card" style="padding:10px"><div class="stat-num">{{ curStats.total }}</div><div class="stat-label">总题数</div></div>
          <div class="card" style="padding:10px"><div class="stat-num" style="color:var(--green)">{{ curStats.correct }}</div><div class="stat-label">答对</div></div>
          <div class="card" style="padding:10px"><div class="stat-num" style="color:var(--red)">{{ curStats.wrong }}</div><div class="stat-label">答错</div></div>
        </div>
        <div class="grid cols-2 mt14">
          <div class="card" style="padding:12px">
            <h3>各题型错题数</h3>
            <BaseChart :option="pWrongBar" height="240px" @chart-click="p => drillToMistakes()" />
            <div class="basis">口径：该卷各题型 错题数（依据设计方案 3.5.1）</div>
          </div>
          <div class="card" style="padding:12px">
            <h3>对错占比</h3>
            <BaseChart :option="pPie" height="240px" />
            <div class="basis">口径：该卷总题数拆分（答对/答错/未作答），未判定答案的题计入未作答</div>
          </div>
        </div>
        <div class="card mt14" style="padding:12px">
          <h3>各模块正确率</h3>
          <BaseChart :option="pAccBar" height="240px" />
          <div class="basis">口径：该题型答对数 / 该题型题数（依据设计方案 3.5.1）</div>
        </div>
      </template>
    </div>

    <!-- 长期趋势 -->
    <div v-else>
      <div class="card">
        <div class="row mb8">
          <span class="muted">时间范围：</span>
          <select v-model="days" style="width:130px">
            <option :value="30">近 30 天</option>
            <option :value="90">近 90 天</option>
            <option :value="0">全部</option>
          </select>
        </div>
        <div class="grid cols-2">
          <div class="card" style="padding:12px">
            <h3>正确率趋势（按试卷）</h3>
            <BaseChart :option="trendLine" height="260px" @chart-click="onTrendClick" />
            <div class="basis">口径：每张试卷 mode='paper' 作答的整体正确率，按考试日期排序（依据设计方案 3.5.2）；练习作答不计入此折线；无数据点断开不插值。</div>
          </div>
          <div class="card" style="padding:12px">
            <h3>五大模块正确率趋势</h3>
            <BaseChart :option="moduleLines" height="260px" />
            <div class="basis">口径：同上，按各卷各模块分别计算（5条线）</div>
          </div>
        </div>
        <div class="grid cols-2 mt14">
          <div class="card" style="padding:12px">
            <h3>累计错题数（按周）</h3>
            <BaseChart :option="cumLine" height="240px" />
            <div class="basis">口径：错题本 addedAt 按周累加；练习产生的错题也计入（依据设计方案 3.5.2）</div>
          </div>
          <div class="card" style="padding:12px">
            <h3>试卷间错题数对比</h3>
            <BaseChart :option="paperWrongBar" height="240px" @chart-click="onTrendClick" />
            <div class="basis">口径：每卷一根柱（错题数），柱顶标注该卷正确率</div>
          </div>
        </div>
      </div>
      <div class="card mt14">
        <h3>趋势解读（自动生成）</h3>
        <div v-if="!trendText" class="empty-tip">累计录入 ≥ 3 套试卷后可生成正确率折线与解读（依据设计方案 1.2「趋势触发」目标）</div>
        <p v-else style="line-height:1.9;margin:0" v-html="trendText"></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseChart from '../components/BaseChart.vue'
import { paperStats, longTrend, pct, fmtDate } from '../stats'
import { MODULES } from '../db'
import { store } from '../store'

const router = useRouter()
const tab = ref('paper')
const paperId = ref(null)
const days = ref(0)

const curStats = computed(() => paperId.value ? paperStats(Number(paperId.value), store.questions, store.records) : null)

const pWrongBar = computed(() => {
  const cats = [], vals = []
  for (const m of MODULES) {
    const b = curStats.value?.byModule[m.id]
    if (!b || !b.total) continue
    cats.push(m.name); vals.push(b.wrong)
  }
  return barOpt(cats, vals, '#dc2626', null)
})
const pPie = computed(() => ({
  tooltip: { trigger: 'item' },
  series: [{
    type: 'pie', radius: ['40%', '66%'],
    data: [
      { name: `答对 ${curStats.value.correct}`, value: curStats.value.correct, itemStyle: { color: '#16a34a' } },
      { name: `答错 ${curStats.value.wrong}`, value: curStats.value.wrong, itemStyle: { color: '#dc2626' } },
      { name: `未答 ${curStats.value.unanswered}`, value: curStats.value.unanswered, itemStyle: { color: '#9ca3af' } }
    ].filter(d => d.value > 0),
    label: { formatter: '{b}: {d}%' }
  }]
}))
const pAccBar = computed(() => {
  const cats = [], vals = []
  for (const m of MODULES) {
    const b = curStats.value?.byModule[m.id]
    if (!b || !b.total) continue
    cats.push(m.name)
    vals.push(Math.round(b.correct / b.total * 1000) / 10)
  }
  return barOpt(cats, vals, '#2f6fed', '{c}%')
})

function barOpt(cats, vals, color, labelFmt) {
  return {
    grid: { left: 46, right: 16, top: 24, bottom: 26 },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar', data: vals, itemStyle: { color, borderRadius: [4, 4, 0, 0] },
      ...(labelFmt ? { label: { show: true, position: 'top', formatter: labelFmt } } : {})
    }],
    tooltip: { trigger: 'axis' }
  }
}

// ---------- 长期 ----------
const trend = computed(() => longTrend(store.papers, store.questions, store.records, store.mistakes, days.value))
const xLabels = computed(() => trend.value.points.map(p => `${p.name.slice(0, 12)}`))
const trendLine = computed(() => ({
  grid: { left: 46, right: 20, top: 24, bottom: 40 },
  xAxis: { type: 'category', data: xLabels.value, axisLabel: { rotate: 20 } },
  yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
  series: [{
    type: 'line', connectNulls: false,
    data: trend.value.points.map(p => p.accuracy === null ? null : Math.round(p.accuracy * 1000) / 10),
    itemStyle: { color: '#2f6fed' }, lineStyle: { width: 3 },
    label: { show: true, formatter: p => p.value + '%' }
  }],
  tooltip: { trigger: 'axis' }
}))
const moduleLines = computed(() => {
  const colors = ['#2f6fed', '#dc2626', '#16a34a', '#d97706', '#7c3aed']
  return {
    grid: { left: 46, right: 20, top: 30, bottom: 40 },
    legend: { top: 0, data: MODULES.map(m => m.name) },
    xAxis: { type: 'category', data: xLabels.value, axisLabel: { rotate: 20 } },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: MODULES.map((m, i) => ({
      name: m.name, type: 'line', connectNulls: false,
      data: trend.value.points.map(p => p.moduleAcc[m.id] === null || p.moduleAcc[m.id] === undefined ? null : Math.round(p.moduleAcc[m.id] * 1000) / 10),
      itemStyle: { color: colors[i] }
    })),
    tooltip: { trigger: 'axis', valueFormatter: v => v + '%' }
  }
})
const cumLine = computed(() => ({
  grid: { left: 46, right: 20, top: 20, bottom: 26 },
  xAxis: { type: 'category', data: trend.value.cumulative.map(c => new Date(c.week).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })) },
  yAxis: { type: 'value', minInterval: 1 },
  series: [{
    type: 'line', data: trend.value.cumulative.map(c => c.count),
    areaStyle: { opacity: 0.12 }, itemStyle: { color: '#dc2626' }
  }],
  tooltip: { trigger: 'axis' }
}))
const paperWrongBar = computed(() => ({
  grid: { left: 46, right: 16, top: 28, bottom: 40 },
  xAxis: { type: 'category', data: xLabels.value, axisLabel: { rotate: 20 } },
  yAxis: { type: 'value', minInterval: 1 },
  series: [{
    type: 'bar',
    data: trend.value.points.map(p => ({ value: p.wrong, acc: p.accuracy })),
    itemStyle: { color: '#dc2626', borderRadius: [4, 4, 0, 0] },
    label: { show: true, position: 'top', formatter: p => p.data.acc === null ? '' : pct(p.data.acc) }
  }],
  tooltip: {
    trigger: 'axis',
    formatter: ps => ps.map(p => `${p.name}<br/>错题：${p.value}<br/>正确率：${pct(p.data.acc)}`).join('')
  }
}))
function onTrendClick(params) {
  const p = trend.value.points[params.dataIndex]
  if (p) router.push({ path: '/papers', query: { paperId: p.paperId, confirm: 1 } })
}
function drillToMistakes() { router.push({ path: '/mistakes' }) }

const trendText = computed(() => {
  const pts = trend.value.points.filter(p => p.accuracy !== null)
  if (pts.length < 3) return ''
  const first = pts[0], last = pts[pts.length - 1]
  const diff = Math.round((last.accuracy - first.accuracy) * 100)
  const dir = diff > 0 ? `<b style="color:var(--green)">上升 ${diff} 个百分点</b>` : diff < 0 ? `<b style="color:var(--red)">下降 ${Math.abs(diff)} 个百分点</b>` : '基本持平'
  return `从「${first.name}」（${pct(first.accuracy)}，${fmtDate(first.date)}）到「${last.name}」（${pct(last.accuracy)}，${fmtDate(last.date)}），整体正确率${dir}；期间累计错题 ${trend.value.cumulative.length ? trend.value.cumulative[trend.value.cumulative.length - 1].count : 0} 题。（依据：长期趋势折线数据口径见各图下方说明，共 ${pts.length} 套试卷）`
})
</script>
