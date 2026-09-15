<template>
  <div>
    <div class="page-head row">
      <div>
        <h1>薄弱分析</h1>
        <p>回答「哪里弱、为什么弱、在变好还是变差」（设计方案 3.4）——每个结论都标注数据依据</p>
      </div>
      <span class="grow"></span>
      <select v-model="timeRange" style="width:120px">
        <option value="week">本周</option>
        <option value="month">本月</option>
        <option value="all">全部</option>
      </select>
    </div>

    <!-- 薄弱知识点 Top5 -->
    <div class="card">
      <div class="row mb8">
        <h3 style="margin:0">薄弱知识点 Top 5</h3>
        <span class="muted">薄弱度 = 错误率 × log2(题量+2) × 趋势权重（依据设计方案 3.4.1）</span>
      </div>
      <div v-if="!weak.length" class="empty-tip">暂无作答数据：先去录入试卷并记录对错</div>
      <div v-for="(w, i) in top5" :key="w.kpId" class="weak-item clickable" @click="toggle(w.kpId)">
        <div class="row">
          <span class="rank" :style="{ background: i === 0 ? 'var(--red)' : 'var(--ink-3)' }">{{ i + 1 }}</span>
          <b>{{ kpName(w.kpId) }}</b>
          <span v-if="w.lowSample" class="tag amber">样本少（n&lt;3）</span>
          <span class="grow"></span>
          <span>错误率 <b>{{ pct(w.errRate) }}</b>（{{ w.wrong }}/{{ w.total }}）</span>
          <span class="muted">题量 {{ w.total }}</span>
          <span>近3次 <b :style="{ color: arrowColor(w.arrows) }">{{ arrowText(w.arrows) }}</b></span>
          <span class="tag blue">薄弱度 {{ w.score.toFixed(2) }}</span>
        </div>
        <div v-if="expanded === w.kpId" class="mt8" @click.stop>
          <div class="muted mb8">该知识点下 {{ w.questionIds.length }} 道题（点击去练习）：</div>
          <span v-for="qid in w.questionIds" :key="qid" class="qchip" style="margin:3px" @click="goPractice">
            {{ qnoOf(qid) }}
          </span>
          <div class="basis">
            <b>本条依据：</b>该知识点全部作答记录 n={{ w.total }} 条（口径：{{ rangeText }}，含试卷与练习）；趋势=最近3次作答逐次方向（↑本次错上次对 / ↓反之 / →持平），趋势权重={{ w.weight.toFixed(2) }}。
          </div>
        </div>
      </div>
      <div class="basis">
        <b>公式依据（设计方案 3.4.1）：</b>错误率=错题数/累计作答题数；log2(题量+2) 抑制小样本（只做1题错1题不会被排到最前）；趋势权重=1+0.15×(↑次数−↓次数)，夹在[0.6,1.6]，反映「是否在恶化」。
      </div>
    </div>

    <div class="grid cols-2 mt14">
      <!-- 错误类型 -->
      <div class="card">
        <h3>错误类型分布（为什么错）</h3>
        <BaseChart :option="errorPieOption" height="250px" />
        <div class="basis">
          <b>口径：</b>错题本 {{ dist.total }} 条，其中手动标注 {{ dist.manual }} 条、系统推断 {{ dist.inferred }} 条（推断规则依据设计方案 3.4.2：未作答→超时未答；曾对后错→粗心；同知识点连续错→概念不清；其余→方法不熟）。
          「方法不熟/概念不清」居多 → 补知识；「粗心」居多 → 练熟练度与检查习惯。
        </div>
      </div>

      <!-- 模块正确率 -->
      <div class="card">
        <h3>模块正确率（哪个模块拖后腿）</h3>
        <BaseChart :option="moduleBarOption" height="250px" @chart-click="onModuleClick" />
        <div class="basis">
          <b>口径：</b>{{ rangeText }}全部作答记录 n={{ recordsInRange }} 条（含练习作答，依据设计方案 3.4.3）。点击柱子可下钻到该模块错题。
        </div>
      </div>
    </div>

    <!-- 结论卡 -->
    <div class="card mt14">
      <h3>本阶段结论（自动生成，均附数据依据）</h3>
      <div v-if="!conclusions.length" class="empty-tip">数据不足，暂无结论</div>
      <ol v-else style="line-height:2.1;margin:0;padding-left:20px">
        <li v-for="(c, i) in conclusions" :key="i" v-html="c"></li>
      </ol>
      <div class="basis">
        <b>生成规则：</b>结论取自上方计算结果（薄弱度Top、错误类型占比、模块正确率差值），不含任何主观臆断；每条结论括号内即其计算依据，可下钻核对原始作答记录。
      </div>
    </div>

    <!-- 下钻抽屉 -->
    <div v-if="drillModule" class="modal-mask" @click.self="drillModule = null">
      <div class="modal">
        <div class="row mb8">
          <h3 style="margin:0">{{ moduleName(drillModule) }} · 相关错题（{{ drillRows.length }}）</h3>
          <span class="grow"></span>
          <button class="btn small" @click="drillModule = null">关闭</button>
        </div>
        <table class="tbl">
          <thead><tr><th>题号</th><th>来源</th><th>知识点</th><th>错误类型</th></tr></thead>
          <tbody>
            <tr v-for="r in drillRows" :key="r.id">
              <td>{{ r.qno }}</td>
              <td class="muted">{{ r.paperName }}</td>
              <td>{{ r.kpName }}</td>
              <td>{{ r.etName }}</td>
            </tr>
          </tbody>
        </table>
        <div class="row mt8">
          <button class="btn primary small" @click="goPractice">去练习</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseChart from '../components/BaseChart.vue'
import { weakPoints, errorTypeDistribution, moduleAccuracy, pct, rangeStart, DAY } from '../stats'
import { MODULES, ERROR_TYPES } from '../db'
import { store } from '../store'

const router = useRouter()
const timeRange = ref('all')
const expanded = ref(null)
const drillModule = ref(null)

const rangeText = computed(() => ({ week: '本周（近7天）', month: '本月（近30天）', all: '全部时间' })[timeRange.value])
const weak = computed(() => weakPoints(store.questions, store.records, timeRange.value))
const top5 = computed(() => weak.value.slice(0, 5))
const dist = computed(() => errorTypeDistribution(store.questions, store.records, store.mistakes))
const modAcc = computed(() => moduleAccuracy(store.questions, store.records, timeRange.value))
const recordsInRange = computed(() => {
  const start = rangeStart(timeRange.value)
  return store.records.filter(r => r.answeredAt >= start).length
})

const kpName = id => store.kps.find(k => k.id === id)?.name || '未知知识点'
const moduleName = id => MODULES.find(m => m.id === id)?.name || id
const qnoOf = qid => store.questions.find(q => q.id === qid)?.qno || '?'
const arrowText = arrows => arrows.length ? arrows.map(a => ({ up: '↑', down: '↓', flat: '→' })[a]).join(' ') : '—'
const arrowColor = arrows => arrows.includes('up') ? 'var(--red)' : arrows.includes('down') ? 'var(--green)' : 'var(--ink-2)'

function toggle(kpId) { expanded.value = expanded.value === kpId ? null : kpId }
function goPractice() { drillModule.value = null; router.push('/practice') }
function onModuleClick(params) {
  const m = MODULES.find(x => x.name === params.name)
  if (m) drillModule.value = m.id
}
const drillRows = computed(() => {
  if (!drillModule.value) return []
  const qMap = Object.fromEntries(store.questions.map(q => [q.id, q]))
  return store.mistakes
    .map(m => ({ ...m, q: qMap[m.questionId] }))
    .filter(r => r.q?.typeId === drillModule.value)
    .map(r => ({
      id: r.id, qno: r.q.qno,
      paperName: store.papers.find(p => p.id === r.q.paperId)?.name || '—',
      kpName: kpName(r.q.kpId),
      etName: ERROR_TYPES.find(e => e.id === r.errorTypeId)?.name || '未标注'
    }))
})

const errorPieOption = computed(() => {
  const data = ERROR_TYPES.map(et => ({ name: et.name, value: dist.value.dist[et.id] || 0 }))
    .filter(d => d.value > 0)
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie', radius: ['38%', '62%'],
      data: data.length ? data : [{ name: '暂无数据', value: 1, itemStyle: { color: '#e5e7eb' } }],
      label: { formatter: '{b}: {c}条 ({d}%)' }
    }]
  }
})
const moduleBarOption = computed(() => {
  const cats = [], vals = [], counts = []
  for (const m of MODULES) {
    const b = modAcc.value[m.id]
    if (!b.total) continue
    cats.push(m.name)
    vals.push(b.accuracy === null ? 0 : Math.round(b.accuracy * 1000) / 10)
    counts.push(`${b.correct}/${b.total}题`)
  }
  return {
    grid: { left: 46, right: 16, top: 24, bottom: 26 },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: [{
      type: 'bar', data: vals, itemStyle: { color: '#2f6fed', borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', formatter: p => `${p.c}%` }
    }],
    tooltip: { trigger: 'axis', formatter: ps => ps.map(p => `${p.name}：${p.c}%（${counts[p.dataIndex]}）`).join('<br/>') }
  }
})

const conclusions = computed(() => {
  const list = []
  const w = top5.value[0]
  const n = recordsInRange.value
  if (w && n > 0) {
    const dir = w.arrows.includes('up') ? '且最近3次仍在恶化' : w.arrows.includes('down') ? '但最近3次已开始改善' : '最近3次基本持平'
    list.push(
      `当前最薄弱知识点是「<b>${kpName(w.kpId)}</b>」：错误率 <b>${pct(w.errRate)}</b>（${w.wrong}/${w.total} 条作答记录），${dir}；` +
      `建议优先安排复习（依据：${rangeText}作答记录 n=${n} 条，薄弱度 ${w.score.toFixed(2)} 排名第1）`
    )
  }
  const totalEt = Object.values(dist.value.dist).reduce((s, x) => s + x, 0)
  if (totalEt > 0) {
    const top = ERROR_TYPES.map(et => ({ name: et.name, v: dist.value.dist[et.id] }))
      .sort((a, b) => b.v - a.v)[0]
    if (top.v > 0) {
      list.push(
        `错误原因中占比最高的是「<b>${top.name}</b>」（${top.v}/${totalEt} 条，${pct(top.v / totalEt)}）` +
        `；${top.name === '粗心' ? '建议练熟练度并养成回读检查习惯，而非补新知识' : '建议针对性补该类知识/方法'}` +
        `（依据：错题本标注分布，手动标注${dist.value.manual}条+系统推断${dist.value.inferred}条）`
      )
    }
  }
  const mods = MODULES.map(m => ({ m, b: modAcc.value[m.id] })).filter(x => x.b.total >= 3)
  if (mods.length >= 2) {
    const sorted = [...mods].sort((a, b) => (a.b.accuracy || 0) - (b.b.accuracy || 0))
    const low = sorted[0], high = sorted[sorted.length - 1]
    if ((high.b.accuracy || 0) - (low.b.accuracy || 0) >= 0.1) {
      list.push(
        `模块层面「<b>${low.m.full || low.m.name}</b>」正确率最低（${pct(low.b.accuracy)}，${low.b.correct}/${low.b.total}），` +
        `比最高的「${high.m.name}」（${pct(high.b.accuracy)}）低 ${Math.round(((high.b.accuracy || 0) - (low.b.accuracy || 0)) * 100)} 个百分点，可作为阶段主攻方向` +
        `（依据：${rangeText}各模块作答正确率对比）`
      )
    }
  }
  return list
})
</script>

<style scoped>
.weak-item { padding: 10px 8px; border-bottom: 1px solid var(--line); }
.weak-item:hover { background: #f8fafc; }
.rank {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: 12px; flex: none;
}
</style>
