import { reactive } from 'vue'
import { db } from './db'

// 全局提示（提前声明，避免依赖顺序问题）
export const toasts = reactive([])
let toastSeq = 1
export function toast(msg, type = 'info', duration = 2600) {
  const id = toastSeq++
  toasts.push({ id, msg, type })
  setTimeout(() => {
    const i = toasts.findIndex(t => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, duration)
}

// 全局数据仓：一次性载入全部表，各页面共享；任何写入后调用 refreshStore() 同步
export const store = reactive({
  papers: [],
  questions: [],
  records: [],
  mistakes: [],
  kps: [],
  moduleScores: [],
  loaded: false
})

export async function refreshStore() {
  const [papers, questions, records, mistakes, kps, moduleScores] = await Promise.all([
    db.papers.toArray(), db.questions.toArray(), db.answerRecords.toArray(),
    db.mistakes.toArray(), db.knowledgePoints.toArray(), db.paperModuleScores.toArray()
  ])
  store.papers = papers
  store.questions = questions
  store.records = records
  store.mistakes = mistakes
  store.kps = kps
  store.moduleScores = moduleScores
  store.loaded = true
}

// 常用索引
export const questionsById = () => Object.fromEntries(store.questions.map(q => [q.id, q]))
export const papersById = () => Object.fromEntries(store.papers.map(p => [p.id, p]))
export const kpsById = () => Object.fromEntries(store.kps.map(k => [k.id, k]))
