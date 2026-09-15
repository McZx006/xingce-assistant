<template>
  <div ref="el" :style="{ height: height }"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch, ref } from 'vue'
// 按需引入：仅注册项目实际使用的 pie/bar/line + 提示/图例/网格 + Canvas 渲染器
import * as echarts from 'echarts/core'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([TooltipComponent, LegendComponent, GridComponent, PieChart, BarChart, LineChart, CanvasRenderer])

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '300px' }
})
const emit = defineEmits(['chartClick'])

const el = ref(null)
let chart = null

function render() {
  if (!chart) return
  chart.setOption(props.option, true)
}

onMounted(() => {
  chart = echarts.init(el.value)
  chart.setOption(props.option)
  chart.on('click', params => emit('chartClick', params))
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})
function resize() { chart?.resize() }
watch(() => props.option, render, { deep: true })

defineExpose({ resize, getChart: () => chart })
</script>
