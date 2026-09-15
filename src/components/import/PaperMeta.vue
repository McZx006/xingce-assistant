<template>
  <div>
    <div class="row mb8" style="align-items:flex-end">
      <label class="field grow"><span>试卷名称 *</span>
        <input v-model="meta.name" type="text" placeholder="如：2025粉笔模考第3季" maxlength="40" /></label>
      <label class="field grow"><span>来源</span>
        <input v-model="meta.source" type="text" placeholder="如：粉笔App / 中公真题卷" /></label>
      <label class="field" style="width:160px"><span>考试日期 *</span>
        <input v-model="meta.examDate" type="date" /></label>
    </div>

    <template v-if="showRanges">
      <div class="row mb8">
        <b style="font-size:13px">题型分布（题号 → 模块）</b>
        <select @change="applyPreset($event)" style="max-width:260px">
          <option value="">快速套用预设结构…</option>
          <option value="gk135">国考副省级 135 题结构</option>
          <option value="gk130">国考地市级 130 题结构</option>
        </select>
        <button class="btn small" @click="addRange">+ 添加区间</button>
      </div>
      <table class="tbl" style="max-width:560px">
        <tbody>
          <tr v-for="(r, i) in ranges" :key="i">
            <td>第 <input v-model.number="r.from" type="number" min="1" style="width:64px" /> ~
                <input v-model.number="r.to" type="number" min="1" style="width:64px" /> 题</td>
            <td>
              <select v-model="r.moduleId" style="width:110px">
                <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
            </td>
            <td><button class="btn small danger" @click="ranges.splice(i, 1)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <div class="basis">预设依据：国考行测卷面结构（副省135题：常识20/言语40/数量15/判断30/资料30；地市130题：常识20/言语40/数量10/判断30/资料30）。题目将先挂到「模块·综合」知识点，之后可在错题确认中细分。</div>
    </template>
  </div>
</template>

<script setup>
import { MODULES } from '../../db'

const props = defineProps({
  meta: { type: Object, required: true },
  showRanges: { type: Boolean, default: false },
  ranges: { type: Array, default: () => [] }
})
const modules = MODULES

const PRESETS = {
  gk135: [ [1, 20, 5], [21, 60, 1], [61, 75, 2], [76, 105, 3], [106, 135, 4] ],
  gk130: [ [1, 20, 5], [21, 60, 1], [61, 70, 2], [71, 100, 3], [101, 130, 4] ]
}
function applyPreset(e) {
  const p = PRESETS[e.target.value]
  if (!p) return
  props.ranges.splice(0, props.ranges.length, ...p.map(([from, to, moduleId]) => ({ from, to, moduleId })))
  e.target.value = ''
}
function addRange() {
  const last = props.ranges[props.ranges.length - 1]
  props.ranges.push({ from: last ? last.to + 1 : 1, to: last ? last.to + 10 : 10, moduleId: 1 })
}
</script>
