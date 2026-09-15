<template>
  <div>
    <PaperMeta :meta="meta" :ranges="ranges" :show-ranges="true" />

    <div class="grid cols-2 mt14">
      <div class="card">
        <h3>你的作答串（答题卡）
          <HelpDot>
            <b>纯串格式（推荐，每字符一题）</b><br />
            · 每 <b>5 个字母为一组</b>，组间用<b>空格</b>隔开，如：<code>BCADU DABCC BBAUC</code><br />
            · <b>未作答用 U</b>（未、?、空、- 也可以）<br />
            · 空格与换行只是便于核对，多打或少打不影响解析<br /><br />
            <b>带题号格式（多选题必用）</b><br />
            · 如：<code>1.B 2.C 3.未 4、A</code>，多选题写 <code>12.ABD</code><br /><br />
            <b>注意</b>：与右侧「正确答案串」的<b>题数必须一致</b>；解析预览表可逐题修正后保存
          </HelpDot>
        </h3>
        <textarea v-model="userStr" rows="6" placeholder="纯串（推荐）：BCADU DABCC BBAUC…（每5个字母一组、组间空格，未作答用 U）&#10;带题号：1.B 2.C 3.未 4、A（多选题如 12.ABD）"></textarea>
        <div class="muted mt8">格式详情见标题旁的 <b style="color:var(--primary)">?</b> 说明</div>
      </div>
      <div class="card">
        <h3>正确答案串（参考答案）</h3>
        <textarea v-model="keyStr" rows="6" placeholder="格式与左侧作答串相同，如：BADCB CDAUB…&#10;每5个字母一组、组间空格；未作答可留 U；两串题数需一致"></textarea>
        <div class="muted mt8">依据：系统按位比对两串自动判对错，写入作答记录</div>
      </div>
    </div>

    <div class="card mt14">
      <div class="row mb8">
        <h3 style="margin:0">解析预览</h3>
        <span class="tag" :class="matched ? 'green' : 'red'">{{ matched ? '题数一致' : '题数不一致' }}</span>
        <span class="muted">你的作答 {{ userItems.length }} 题 · 答案串 {{ keyItems.length }} 题</span>
      </div>
      <div v-if="!previewRows.length" class="empty-tip">粘贴作答串后自动预览</div>
      <div v-else style="max-height:280px;overflow:auto">
        <table class="tbl">
          <thead><tr><th style="width:70px">题号</th><th style="width:110px">你的作答</th><th style="width:110px">正确答案</th><th>判定</th><th>模块（按题型分布）</th></tr></thead>
          <tbody>
            <tr v-for="row in previewRows" :key="row.qno" :class="{ clickable: false }">
              <td>{{ row.qno }}</td>
              <td><input v-model="row.user" style="width:80px" /></td>
              <td><input v-model="row.key" style="width:80px" /></td>
              <td>
                <span v-if="row.key && row.user" :class="row.ok ? 'tag green' : 'tag red'">{{ row.ok ? '对' : '错' }}</span>
                <span v-else class="tag amber">未判定</span>
              </td>
              <td class="muted">{{ moduleName(row.qno) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="row mt14">
        <button class="btn primary" :disabled="!previewRows.length" @click="save">生成试卷并统计对错</button>
        <span class="muted">保存后直接进入「错题确认」：错题已预勾选，可一键收录</span>
      </div>
      <div class="basis">
        <b>提速依据：</b>此模式只录入「对错数据」（题号、作答、答案、模块），题干与选项可后续补录 —— 统计与薄弱点分析不依赖题干，130 题预计 2 分钟内完成（设计方案目标 ≤25 分钟）。
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PaperMeta from './PaperMeta.vue'
import HelpDot from '../HelpDot.vue'
import { parseAnswerSequence } from '../../parse'
import { saveImportedPaper } from '../../importHelpers'
import { MODULES } from '../../db'
import { toast } from '../../store'

const router = useRouter()
const meta = reactive({ name: '', source: '', examDate: new Date().toISOString().slice(0, 10) })
const ranges = ref([])
const userStr = ref('')
const keyStr = ref('')

const userItems = computed(() => parseAnswerSequence(userStr.value).items)
const keyItems = computed(() => parseAnswerSequence(keyStr.value).items)
const matched = computed(() =>
  userItems.value.length > 0 && userItems.value.length === keyItems.value.length)

const previewRows = ref([])
function rebuildPreview() {
  const rows = []
  const n = Math.max(userItems.value.length, keyItems.value.length)
  for (let i = 0; i < n; i++) {
    const u = userItems.value[i], k = keyItems.value[i]
    const qno = u?.qno || k?.qno || i + 1
    rows.push(reactive({
      qno,
      user: u ? u.val.replace(/,/g, '') : '',
      key: k ? k.val.replace(/,/g, '') : '',
      get ok() {
        const norm = s => [...new Set(String(s).toUpperCase().replace(/[^A-D]/g, '').split(''))].sort().join('')
        return norm(this.user) === norm(this.key) && norm(this.user) !== ''
      }
    }))
  }
  previewRows.value = rows
}
watch([userStr, keyStr], rebuildPreview)

function moduleName(qno) {
  const r = ranges.value.find(x => qno >= x.from && qno <= x.to)
  return r ? MODULES.find(m => m.id === r.moduleId)?.name : '未分配'
}

async function save() {
  if (!matched.value) { toast('两串题数不一致，请检查', 'error'); return }
  const items = previewRows.value.map(r => {
    const range = ranges.value.find(x => r.qno >= x.from && r.qno <= x.to)
    return {
      qno: r.qno,
      typeId: range ? range.moduleId : 1,
      stem: '', options: {},
      answer: r.key,
      userAnswer: r.user,
      kpName: ''
    }
  })
  try {
    const paperId = await saveImportedPaper(meta, items, { judge: true, autoCollectWrong: false })
    toast('试卷已生成，去确认错题收录', 'success')
    router.push({ path: '/papers', query: { paperId, confirm: 1 } })
  } catch (e) {
    toast(e.message || '保存失败', 'error')
  }
}
</script>
