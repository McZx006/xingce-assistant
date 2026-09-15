<template>
  <div>
    <div class="page-head">
      <h1>设置</h1>
      <p>知识点库 · OCR 语言包 · 数据备份</p>
    </div>

    <div class="card">
      <h3>知识点库 <span class="muted">（预置库依据：国考行测五大模块及主流题库的通用考点划分，可增删）</span></h3>
      <div v-for="m in modules" :key="m.id" class="mb8">
        <b style="font-size:13px">{{ m.full }}</b>
        <div class="row mt8">
          <span v-for="k in kpsOf(m.id)" :key="k.id" class="tag" :class="{ blue: !k.preset }">
            {{ k.name }}
            <span class="clickable" style="margin-left:4px;color:var(--red)" @click="delKp(k)">×</span>
          </span>
          <input v-model="newNames[m.id]" placeholder="新增知识点，回车添加" style="width:180px" @keyup.enter="addKp(m.id)" />
        </div>
      </div>
      <div class="basis">删除知识点前请先确认没有题目引用；题目引用的知识点被删除后显示为「待标注」。</div>
    </div>

    <div class="card mt14">
      <h3>OCR 语言包（离线识别）</h3>
      <label class="field" style="max-width:520px">
        <span>本地语言包目录 langPath（可选）</span>
        <input v-model="langPath" placeholder="默认使用官方 CDN；可填本地目录 URL，如 http://localhost:8080/tessdata" />
      </label>
      <div class="row">
        <button class="btn primary small" @click="saveLang">保存</button>
        <button class="btn small" @click="resetWorker">重建 OCR 引擎（应用新路径）</button>
      </div>
      <div class="basis">
        <b>说明：</b>首次 OCR 需联网下载 chi_sim+eng 语言包（浏览器会自动缓存，之后离线可用）；
        完全离线环境请下载 <i>tessdata</i> 的 chi_sim.traineddata 与 eng.traineddata 放入同一目录，并在上方填写该目录地址。
      </div>
    </div>

    <div class="card mt14">
      <h3>数据备份与恢复 <span class="muted">（数据存于浏览器 IndexedDB，建议定期备份）</span></h3>
      <div class="row">
        <button class="btn primary" @click="doExport">导出全部数据（JSON）</button>
        <label class="btn" style="cursor:pointer">
          从 JSON 恢复
          <input type="file" accept=".json" hidden @change="doImport" />
        </label>
        <button class="btn danger" @click="clearAll">清空全部数据</button>
      </div>
      <div class="basis">恢复会覆盖当前全部数据（试卷/题目/作答记录/错题本/知识点库）。</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { MODULES, db, getSetting, setSetting, importBackup } from '../db'
import { store, refreshStore, toast } from '../store'
import { exportBackup } from '../db'
import { destroyWorker } from '../utils/ocr'

const modules = MODULES
const newNames = reactive({})
const langPath = ref('')

onMounted(async () => {
  const v = await getSetting('ocrLangPath')
  langPath.value = v || ''
})

const kpsOf = mid => store.kps.filter(k => k.moduleId === mid)
async function addKp(mid) {
  const name = (newNames[mid] || '').trim()
  if (!name) return
  if (store.kps.some(k => k.name === name)) { toast('已存在同名知识点', 'error'); return }
  await db.knowledgePoints.add({ name, moduleId: mid, preset: 0 })
  newNames[mid] = ''
  await refreshStore()
  toast('知识点已添加', 'success')
}
async function delKp(k) {
  const used = store.questions.some(q => q.kpId === k.id)
  if (used) { toast('该知识点已被题目引用，请先在题目中改挂其他知识点', 'error', 3200); return }
  await db.knowledgePoints.delete(k.id)
  await refreshStore()
  toast('已删除', 'success')
}

async function saveLang() {
  await setSetting('ocrLangPath', langPath.value.trim())
  toast('已保存', 'success')
}
async function resetWorker() {
  await destroyWorker()
  toast('OCR 引擎已重置，下次识别将应用新配置', 'success')
}

async function doExport() {
  const data = await exportBackup()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `行测小助手备份_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  toast('已导出', 'success')
}
async function doImport(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  if (!confirm('恢复将覆盖当前全部数据，确认继续？')) return
  try {
    const text = await f.text()
    await importBackup(JSON.parse(text))
    await refreshStore()
    toast('恢复完成', 'success')
  } catch (err) {
    toast('恢复失败：' + (err.message || err), 'error')
  }
}
async function clearAll() {
  if (!confirm('确认清空全部数据？此操作不可恢复（建议先导出备份）。')) return
  await Promise.all([
    db.papers.clear(), db.questions.clear(), db.answerRecords.clear(),
    db.mistakes.clear(), db.paperModuleScores.clear()
  ])
  await refreshStore()
  toast('已清空', 'success')
}
</script>
