<template>
  <div>
    <div class="mb8"><PaperMeta :meta="meta" /></div>

    <div class="card mb14">
      <div class="row mb8">
        <h3 style="margin:0">粉笔网页版导入</h3>
        <label class="row" style="gap:4px"><input v-model="mode" type="radio" value="paste" /> A. 粘贴报告文本</label>
        <label class="row" style="gap:4px"><input v-model="mode" type="radio" value="json" /> B. 导入脚本 JSON</label>
      </div>

      <!-- A. 粘贴模式 -->
      <template v-if="mode === 'paste'">
        <textarea v-model="rawText" rows="8"
          placeholder="登录粉笔网页版（fenbi.com）→ 打开模考报告/题目解析页 → 全选复制 → 粘贴到这里。&#10;自动识别：模块分段标题（言语理解与表达…）、题号、题干、A-D选项、正确答案、你的答案、解析。"></textarea>
        <div class="row mt8">
          <button class="btn primary" @click="parsePaste">解析并预览</button>
          <span class="muted">解析规则：模块分段 + 题号切块 + 答案/解析行提取（与逐题录入的智能粘贴同一引擎）</span>
        </div>
      </template>

      <!-- B. JSON 模式 -->
      <template v-else>
        <div class="dropzone" :class="{ over }" @click="jsonInput.click()"
          @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="e => { over = false; loadJsonFile(e.dataTransfer.files[0]) }">
          点击选择或拖入油猴脚本导出的 .json 文件
          <input ref="jsonInput" type="file" accept=".json,application/json" hidden @change="e => loadJsonFile(e.target.files[0])" />
        </div>
        <div class="basis mt8">
          <b>配套脚本：</b>项目根目录 <code>fenbi-exporter.user.js</code> —— 用 Tampermonkey 安装后，在粉笔网页版页面点击右下角「导出题目JSON」按钮，脚本会把整页题目文本按本工具同样的解析规则转成 JSON（复制到剪贴板并下载），再到本页导入。脚本的精准选择器模式将在拿到真实报告页 HTML 样本后开启校准。
        </div>
      </template>
    </div>

    <!-- 预览 -->
    <div v-if="previewRows.length" class="card">
      <div class="row mb8">
        <h3 style="margin:0">解析预览</h3>
        <span class="tag blue">{{ previewRows.length }} 题</span>
        <span class="tag red">错 {{ wrongCount }} 题</span>
        <span v-if="missingAnswer" class="tag amber">{{ missingAnswer }} 题缺答案</span>
        <span class="grow"></span>
        <button class="btn small" @click="previewRows = []">清空</button>
      </div>
      <div style="max-height:340px;overflow:auto">
        <table class="tbl">
          <thead><tr><th>题号</th><th>模块</th><th>题干摘要</th><th style="width:90px">你的作答</th><th style="width:90px">正确答案</th><th>预判</th><th>解析</th></tr></thead>
          <tbody>
            <tr v-for="row in previewRows" :key="row.uid">
              <td>{{ row.qno }}</td>
              <td><select v-model="row.typeId" style="width:80px">
                <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select></td>
              <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="muted">{{ row.stem || '（无题干）' }}</td>
              <td><input v-model="row.userAnswer" style="width:70px" /></td>
              <td><input v-model="row.answer" style="width:70px" /></td>
              <td>
                <span v-if="row.answer && row.userAnswer" :class="row.ok ? 'tag green' : 'tag red'">{{ row.ok ? '对' : '错' }}</span>
                <span v-else class="tag amber">未判定</span>
              </td>
              <td><span v-if="row.analysis" class="tag">有</span><span v-else class="muted">无</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="row mt14">
        <button class="btn primary" :disabled="!previewRows.length" @click="saveAll">确认导入（错题自动收录）</button>
        <span class="muted">导入后跳转试卷详情，可直接核对错题收录与补录知识点</span>
      </div>
      <div class="basis">
        <b>依据：</b>逐题数据全部来自你粘贴/导出的粉笔页面内容，系统不做任何臆造补全；对错判定=「你的答案」与「正确答案」比对；错题错误类型按设计方案 3.4.2 规则推断（未作答→超时未答，已答错→方法不熟，均为「系统推断」，可在错题本手动修正）。
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PaperMeta from './PaperMeta.vue'
import { parseFenbiWeb } from '../../parse'
import { saveImportedPaper } from '../../importHelpers'
import { MODULES } from '../../db'
import { toast } from '../../store'

const router = useRouter()
const modules = MODULES
const mode = ref('paste')
const rawText = ref('')
const over = ref(false)
const jsonInput = ref(null)
const meta = reactive({ name: '', source: '粉笔网页版', examDate: new Date().toISOString().slice(0, 10) })
let uidSeq = 1

const previewRows = ref([])
const wrongCount = computed(() => previewRows.value.filter(r => r.answer && r.userAnswer && !r.ok).length)
const missingAnswer = computed(() => previewRows.value.filter(r => !r.answer).length)

function norm(s) {
  return [...new Set(String(s).toUpperCase().replace(/[^A-D]/g, '').split(''))].sort().join('')
}

function parsePaste() {
  if (!rawText.value.trim()) { toast('请先粘贴报告文本', 'error'); return }
  const blocks = parseFenbiWeb(rawText.value)
  if (!blocks.length) { toast('未识别到题目结构（需以“1、/1.”题号开头）。若页面复制结果不含题号，请改用油猴脚本 JSON 方式', 'error', 4200); return }
  previewRows.value = blocks.map(b => reactive({
    uid: uidSeq++, qno: b.qno, typeId: b.moduleId || 1,
    stem: b.stem, options: { ...b.options },
    userAnswer: b.userAnswer || '', answer: b.answer || '',
    analysis: b.analysis || '', kpName: b.kpName || '',
    get ok() { return !!this.answer && !!this.userAnswer && norm(this.userAnswer) === norm(this.answer) }
  }))
  if (!meta.name) {
    // 尝试用第一行作为试卷名（粉笔网页报告首行通常是卷名）
    const first = rawText.value.split('\n').map(s => s.trim()).find(s => s.length >= 4)
    if (first) meta.name = first.slice(0, 40)
  }
  toast(`识别 ${blocks.length} 题，请核对后导入`, 'success')
}

function loadJsonFile(file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result)
      const qs = Array.isArray(data) ? data : data.questions
      if (!Array.isArray(qs) || !qs.length) throw new Error('JSON 中没有 questions 数组')
      if (data.name && !meta.name) meta.name = String(data.name).slice(0, 40)
      previewRows.value = qs.map((q, i) => reactive({
        uid: uidSeq++, qno: q.qno || i + 1,
        typeId: q.typeId || q.moduleId || 1,
        stem: q.stem || '', options: q.options || {},
        userAnswer: q.userAnswer || '', answer: q.answer || '',
        analysis: q.analysis || '', kpName: q.kpName || '',
        get ok() { return !!this.answer && !!this.userAnswer && norm(this.userAnswer) === norm(this.answer) }
      }))
      toast(`JSON 导入 ${qs.length} 题，请核对后保存`, 'success')
    } catch (e) {
      toast('JSON 解析失败：' + (e.message || e), 'error', 4000)
    }
  }
  reader.readAsText(file, 'utf-8')
}

async function saveAll() {
  const items = previewRows.value.map(r => ({
    qno: r.qno, typeId: r.typeId, stem: r.stem, options: { ...r.options },
    answer: r.answer, userAnswer: r.userAnswer, kpName: r.kpName, analysis: r.analysis
  }))
  try {
    const paperId = await saveImportedPaper(meta, items, { judge: true, autoCollectWrong: true })
    toast('导入完成，错题已自动收录', 'success')
    router.push({ path: '/papers', query: { paperId, confirm: 1 } })
  } catch (e) { toast(e.message || '导入失败', 'error') }
}
</script>
