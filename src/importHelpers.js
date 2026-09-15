// 录入保存公共逻辑：四种导入方式最终都走这里入库（设计方案 3.1.4 导入后统一处理）
import { db, ensureKp, ensureModuleKp, collectMistake } from './db'
import { refreshStore } from './store'

// 统一多选答案比较：忽略顺序与空格
export function sameAnswer(user, answer) {
  const norm = s => [...new Set(String(s).toUpperCase().replace(/[^A-D]/g, '').split(''))].sort().join('')
  return norm(user) === norm(answer) && norm(user) !== ''
}

// items: [{ qno, typeId, stem, options, answer, userAnswer, kpName, analysis, fenbiQno }]
// opts.autoCollectWrong: 保存时自动把「已判定为错」的题收进错题本（粉笔导入按设计方案3.1.3默认开启）
// opts.errorTypeId: 自动收录时统一预填的错误类型（未传则按规则推断）
export async function saveImportedPaper(meta, items, opts = {}) {
  if (!meta.name || meta.name.trim().length < 2) throw new Error('请填写试卷名称（2-40字）')
  if (!items.length) throw new Error('没有可保存的题目')
  const paperId = await db.papers.add({
    name: meta.name.trim(),
    source: meta.source || '',
    examDate: meta.examDate ? new Date(meta.examDate).getTime() : Date.now(),
    createdAt: Date.now()
  })
  const now = Date.now()
  const kpCache = new Map()
  async function resolveKp(it) {
    if (it.kpName && it.kpName.trim()) {
      const name = it.kpName.trim()
      if (!kpCache.has(name)) kpCache.set(name, await ensureKp(name, it.typeId))
      return kpCache.get(name)
    }
    const key = `__module_${it.typeId}`
    if (!kpCache.has(key)) kpCache.set(key, await ensureModuleKp(it.typeId))
    return kpCache.get(key)
  }
  for (const it of items) {
    const kpId = await resolveKp(it)
    const qId = await db.questions.add({
      paperId,
      qno: it.qno,
      typeId: it.typeId || 1,
      stem: it.stem || '',
      options: it.options || {},
      answer: String(it.answer || '').toUpperCase().replace(/[^A-D,]/g, ''),
      kpId,
      analysis: it.analysis || '',
      fenbiQno: it.fenbiQno || null
    })
    const userAnswer = String(it.userAnswer || '').trim().toUpperCase()
    const hasAnswer = !!String(it.answer || '').trim()
    const judged = opts.judge !== false && hasAnswer
    const isCorrect = judged ? sameAnswer(userAnswer, it.answer) : null
    await db.answerRecords.add({
      questionId: qId, paperId, mode: 'paper',
      userAnswer, isCorrect, answeredAt: now
    })
    if (opts.autoCollectWrong && judged && !isCorrect) {
      // 录入即沉淀错题（提速点：免去事后手动逐题勾选；错误类型按规则推断，标注「系统推断」）
      // 推断依据设计方案 3.4.2：无作答→超时未答(4)；首次导入无历史作答的已答错题→方法不熟(3)
      const question = { id: qId, kpId, paperId }
      const et = it.errorType || (userAnswer ? 3 : 4)
      await collectMistake(question, et, 'inferred')
    }
  }
  await refreshStore()
  return paperId
}

// 追加题目到已有试卷（手动逐题录入的追加模式 / OCR 追加）
export async function appendQuestions(paperId, items) {
  const paper = await db.papers.get(paperId)
  if (!paper) throw new Error('试卷不存在')
  const existing = await db.questions.where('paperId').equals(paperId).toArray()
  const maxQno = existing.reduce((m, q) => Math.max(m, q.qno), 0)
  let i = 0
  for (const it of items) {
    const qno = it.qno || (maxQno + (++i))
    const kpId = it.kpName ? await ensureKp(it.kpName, it.typeId) : await ensureModuleKp(it.typeId)
    const qId = await db.questions.add({
      paperId, qno, typeId: it.typeId || 1,
      stem: it.stem || '', options: it.options || {},
      answer: String(it.answer || '').toUpperCase().replace(/[^A-D,]/g, ''),
      kpId, analysis: it.analysis || '', fenbiQno: it.fenbiQno || null
    })
    const userAnswer = String(it.userAnswer || '').trim().toUpperCase()
    const hasAnswer = !!String(it.answer || '').trim()
    const isCorrect = hasAnswer && userAnswer ? sameAnswer(userAnswer, it.answer) : null
    await db.answerRecords.add({ questionId: qId, paperId, mode: 'paper', userAnswer, isCorrect, answeredAt: Date.now() })
  }
  await refreshStore()
}
