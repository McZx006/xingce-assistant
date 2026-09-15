// ============================================================
// 统计分析引擎 —— 所有结论均给出计算口径与数据依据
// 依据：设计方案 3.4（薄弱点与错误分析）、3.5（统计分析）
// ============================================================

export const DAY = 24 * 3600 * 1000

// ---------- 单卷统计（设计方案 3.5.1） ----------
// 口径：该卷题目在「作答记录」中 mode='paper' 的记录
export function paperStats(paperId, questions, records) {
  const qs = questions.filter(q => q.paperId === paperId)
  const qIds = new Set(qs.map(q => q.id))
  const rs = records.filter(r => r.paperId === paperId && qIds.has(r.questionId))
  const byModule = {}
  for (const m of [1, 2, 3, 4, 5]) byModule[m] = { total: 0, correct: 0, wrong: 0, unanswered: 0 }
  let total = 0, correct = 0, wrong = 0, unanswered = 0
  for (const q of qs) {
    const r = rs.find(x => x.questionId === q.id) ||
      records.filter(x => x.questionId === q.id).sort((a, b) => a.answeredAt - b.answeredAt)[0]
    const m = q.typeId || 0
    if (!byModule[m]) byModule[m] = { total: 0, correct: 0, wrong: 0, unanswered: 0 }
    byModule[m].total++
    total++
    // 未作答口径：无作答内容，或因缺少标准答案尚未判定（isCorrect 为空）
    if (!r || !r.userAnswer || r.isCorrect === null || r.isCorrect === undefined) {
      unanswered++; byModule[m].unanswered++
    } else if (r.isCorrect) {
      correct++; byModule[m].correct++
    } else {
      wrong++; byModule[m].wrong++
    }
  }
  const accuracy = total ? correct / total : 0
  return { total, correct, wrong, unanswered, accuracy, byModule, questionList: qs, records: rs }
}

// ---------- 时间范围过滤 ----------
export function rangeStart(range) {
  const now = Date.now()
  if (range === 'week') return now - 7 * DAY
  if (range === 'month') return now - 30 * DAY
  return 0 // all
}

// ---------- 薄弱知识点（设计方案 3.4.1） ----------
// 薄弱度 = 错误率 × log2(题量 + 2) × 趋势权重
// 趋势权重（本实现的量化定义，界面同步展示）：
//   对最近 3 次作答逐次判定方向：本次错且上次对=↑(恶化)；本次对且上次错=↓(改善)；其余=→(持平)
//   权重 = 1 + 0.15×(↑次数) − 0.15×(↓次数)，并夹在 [0.6, 1.6]，避免单次波动过度放大
export function weakPoints(questions, records, timeRange = 'all') {
  const start = rangeStart(timeRange)
  const byKp = new Map()
  for (const r of records) {
    if (r.answeredAt < start) continue
    const q = questions.find(x => x.id === r.questionId)
    if (!q || !q.kpId) continue
    if (!byKp.has(q.kpId)) byKp.set(q.kpId, [])
    byKp.get(q.kpId).push(r)
  }
  const result = []
  for (const [kpId, rs] of byKp) {
    rs.sort((a, b) => a.answeredAt - b.answeredAt)
    const total = rs.length
    const wrong = rs.filter(r => !r.userAnswer ? true : !r.isCorrect).length
    const errRate = total ? wrong / total : 0
    // 最近 3 次逐次方向
    const arrows = []
    const last4 = rs.slice(-4)
    for (let i = 1; i < last4.length; i++) {
      const now = last4[i], prev = last4[i - 1]
      const nowWrong = now.userAnswer ? !now.isCorrect : true
      const prevWrong = prev.userAnswer ? !prev.isCorrect : true
      if (nowWrong && !prevWrong) arrows.push('up')
      else if (!nowWrong && prevWrong) arrows.push('down')
      else arrows.push('flat')
    }
    const ups = arrows.filter(a => a === 'up').length
    const downs = arrows.filter(a => a === 'down').length
    const weight = Math.min(1.6, Math.max(0.6, 1 + 0.15 * ups - 0.15 * downs))
    const score = errRate * Math.log2(total + 2) * weight
    const recent3 = rs.slice(-3)
    result.push({
      kpId, total, wrong, errRate, arrows, weight, score,
      recent3Wrong: recent3.filter(r => r.userAnswer ? !r.isCorrect : true).length,
      recent3Total: recent3.length,
      lowSample: total < 3,
      questionIds: [...new Set(rs.map(r => r.questionId))]
    })
  }
  result.sort((a, b) => b.score - a.score)
  return result
}

// ---------- 错误类型分布（设计方案 3.4.2） ----------
// 口径：错题本条目。优先手动标注；未标注的条目按规则推断并标注「系统推断」
// 推断规则依据设计方案 3.4.2：未作答→超时未答；曾答对后答错→粗心；同知识点连续错→概念不清；其余→方法不熟
export function errorTypeDistribution(questions, records, mistakes) {
  const qMap = Object.fromEntries(questions.map(q => [q.id, q]))
  const recByQ = new Map()
  for (const r of records) {
    if (!recByQ.has(r.questionId)) recByQ.set(r.questionId, [])
    recByQ.get(r.questionId).push(r)
  }
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0 }
  let manual = 0, inferred = 0
  const detail = []
  for (const m of mistakes) {
    const q = qMap[m.questionId]
    let typeId = m.errorTypeId
    let source = m.errorTypeSource || 'manual'
    if (!typeId) {
      const qrs = (recByQ.get(m.questionId) || []).sort((a, b) => a.answeredAt - b.answeredAt)
      const kprs = q.kpId
        ? records.filter(r => qMap[r.questionId]?.kpId === q.kpId).sort((a, b) => a.answeredAt - b.answeredAt)
        : []
      typeId = inferTypeByRule(q, qrs, kprs)
      source = 'runtime'
    }
    if (source === 'manual') manual++; else inferred++
    if (dist[typeId] !== undefined) dist[typeId]++
    detail.push({ mistake: m, typeId, source, question: q })
  }
  return { dist, manual, inferred, detail }
}

export function inferTypeByRule(question, qRecords, kpRecords) {
  const last = qRecords[qRecords.length - 1]
  if (!last || !last.userAnswer) return 4 // 超时未答
  if (qRecords.slice(0, -1).some(r => r.isCorrect)) return 1 // 曾对后错 → 粗心(不稳)
  const kpLast = kpRecords.filter(r => r.answeredAt < last.answeredAt).pop()
  if (kpLast && !kpLast.isCorrect) return 2 // 同知识点连续错 → 概念不清
  return 3 // 方法不熟
}

// ---------- 模块正确率（设计方案 3.4.3 / 3.5.2） ----------
// 口径：全部作答记录（含试卷作答与练习作答），按题目题型聚合
export function moduleAccuracy(questions, records, timeRange = 'all') {
  const start = rangeStart(timeRange)
  const byModule = {}
  for (const m of [1, 2, 3, 4, 5]) byModule[m] = { total: 0, correct: 0, wrong: 0, unanswered: 0 }
  for (const r of records) {
    if (r.answeredAt < start) continue
    const q = questions.find(x => x.id === r.questionId)
    if (!q || !byModule[q.typeId]) continue
    const b = byModule[q.typeId]
    b.total++
    if (!r.userAnswer) b.unanswered++
    else if (r.isCorrect) b.correct++
    else b.wrong++
  }
  for (const m of Object.keys(byModule)) {
    const b = byModule[m]
    b.accuracy = b.total ? b.correct / b.total : null
  }
  return byModule
}

// ---------- 长期趋势（设计方案 3.5.2） ----------
// 折线口径：试卷作答（mode='paper'）按考试日期；练习作答不计入试卷折线
// 累计错题口径：错题本 addedAt 按周累加（练习产生的错题也计入）
export function longTrend(papers, questions, records, mistakes, days = 0) {
  const start = days ? Date.now() - days * DAY : 0
  const sorted = [...papers].filter(p => !start || (p.examDate || 0) >= start)
    .sort((a, b) => (a.examDate || 0) - (b.examDate || 0))
  const qByPaper = new Map()
  for (const q of questions) {
    if (!qByPaper.has(q.paperId)) qByPaper.set(q.paperId, [])
    qByPaper.get(q.paperId).push(q)
  }
  const points = sorted.map(p => {
    const qs = qByPaper.get(p.id) || []
    const qIds = new Set(qs.map(q => q.id))
    const rs = records.filter(r => r.paperId === p.id && qIds.has(r.questionId) && r.userAnswer)
    const total = rs.length || qs.length
    const correct = rs.filter(r => r.isCorrect).length
    // 各模块正确率（多折线）
    const moduleAcc = {}
    for (const m of [1, 2, 3, 4, 5]) {
      const mqs = new Set(qs.filter(q => q.typeId === m).map(q => q.id))
      const mrs = rs.filter(r => mqs.has(r.questionId))
      moduleAcc[m] = mrs.length ? mrs.filter(r => r.isCorrect).length / mrs.length : null
    }
    return {
      paperId: p.id, name: p.name, date: p.examDate || p.createdAt,
      accuracy: total ? correct / total : null, wrong: qs.length ? qs.length - correct : 0, moduleAcc
    }
  })
  // 累计错题按周
  const weekMap = new Map()
  for (const m of mistakes) {
    if (m.addedAt < start) continue
    const d = new Date(m.addedAt)
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    const key = monday.getTime()
    weekMap.set(key, (weekMap.get(key) || 0) + 1)
  }
  const weeks = [...weekMap.keys()].sort((a, b) => a - b)
  let acc = 0
  const cumulative = weeks.map(w => { acc += weekMap.get(w); return { week: w, count: acc } })
  return { points, cumulative }
}

// ---------- 易错项统计（参考粉笔「易错项」呈现；数据口径=个人作答记录） ----------
export function wrongOptionStats(question, records) {
  const counts = {}
  let attempts = 0, corrects = 0
  for (const r of records.filter(r => r.questionId === question.id)) {
    if (!r.userAnswer) continue
    attempts++
    if (r.isCorrect) corrects++
    // 易错项口径：仅统计真实选项作答（A-D），「✓/×」等占位作答（粉笔导入-对错未知选项）不计入分布
    else if (/^[A-D]{1,4}$/.test(r.userAnswer)) counts[r.userAnswer] = (counts[r.userAnswer] || 0) + 1
  }
  const wrongOptions = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return {
    attempts, corrects,
    accuracy: attempts ? corrects / attempts : null,
    topWrong: wrongOptions[0] ? wrongOptions[0][0] : null,
    distribution: wrongOptions
  }
}

// ---------- 格式化 ----------
export const pct = v => (v === null || v === undefined) ? '—' : Math.round(v * 100) + '%'
export const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('zh-CN') : '—'
export const fmtTime = ts => ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
