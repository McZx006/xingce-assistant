<template>
  <div>
    <div class="page-head">
      <h1>录入试卷</h1>
      <p>四种入口任选，最终统一写入同一张试卷结构（设计方案 3.1）——核心目标：更快</p>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'card' }" @click="tab = 'card'">① 答题卡快速录入</button>
      <button :class="{ active: tab === 'manual' }" @click="tab = 'manual'">② 逐题录入</button>
      <button :class="{ active: tab === 'ocr' }" @click="tab = 'ocr'">③ 文件导入（PDF / Word / 图片）</button>
      <button :class="{ active: tab === 'fenbi' }" @click="tab = 'fenbi'">④ 粉笔模考导入</button>
      <button :class="{ active: tab === 'fenbiweb' }" @click="tab = 'fenbiweb'">⑤ 粉笔网页版（粘贴/JSON）</button>
    </div>

    <CardImport v-if="tab === 'card'" />
    <ManualImport v-else-if="tab === 'manual'" />
    <FileImport v-else-if="tab === 'ocr'" />
    <FenbiImport v-else-if="tab === 'fenbi'" />
    <FenbiWebImport v-else />

    <div class="card mt14">
      <div class="basis" style="margin-top:0">
        <b>五种方式如何选（依据设计方案 3.1.1-3.1.3 的适用场景）：</b><br />
        · 只有答题卡/答案（如对完答案的纸质卷）→ <b>① 答题卡快速录入</b>：粘贴两串即可，130题约2分钟；<br />
        · 需要题干入库刷题 → <b>② 逐题录入</b>：粘贴整题自动拆分，题型/知识点自动沿用；<br />
        · 手头是 PDF/Word/试卷截图 → <b>③ 文件导入</b>：PDF文字层直读（零误差），扫描件与图片走 OCR，.docx 直读文本；<br />
        · 粉笔App模考完 → <b>④ 粉笔导入</b>：粘贴成绩页文本，模块得分+逐题对错一键入库，错题自动收录；<br />
        · 粉笔网页版报告 → <b>⑤ 网页版导入</b>：A. 全选复制报告文本粘贴，或 B. 用配套油猴脚本一键导出 JSON 导入——两种方式都带题干/选项/答案/解析。
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

// 异步组件：切到对应标签才下载该入口代码（PDF/Word/OCR 等重型库随之按需加载，不拖慢首屏）
const CardImport = defineAsyncComponent(() => import('../components/import/CardImport.vue'))
const ManualImport = defineAsyncComponent(() => import('../components/import/ManualImport.vue'))
const FileImport = defineAsyncComponent(() => import('../components/import/FileImport.vue'))
const FenbiImport = defineAsyncComponent(() => import('../components/import/FenbiImport.vue'))
const FenbiWebImport = defineAsyncComponent(() => import('../components/import/FenbiWebImport.vue'))

const route = useRoute()
const tab = ref(['card', 'manual', 'ocr', 'fenbi', 'fenbiweb'].includes(route.query.tab) ? route.query.tab : 'card')
watch(() => route.query.tab, v => { if (v) tab.value = v })
</script>
