import Dexie from 'dexie'

// ===================== 静态枚举 =====================
// 题型五大模块（依据：国考行测卷面结构：言语理解与表达 / 数量关系 / 判断推理 / 资料分析 / 常识判断）
export const MODULES = [
  { id: 1, name: '言语', full: '言语理解与表达' },
  { id: 2, name: '数量', full: '数量关系' },
  { id: 3, name: '判断', full: '判断推理' },
  { id: 4, name: '资料', full: '资料分析' },
  { id: 5, name: '常识', full: '常识判断' }
]

// 错误类型（依据：设计方案 3.2 / 3.4.2：粗心 / 概念不清 / 方法不熟 / 超时未答）
export const ERROR_TYPES = [
  { id: 1, name: '粗心' },
  { id: 2, name: '概念不清' },
  { id: 3, name: '方法不熟' },
  { id: 4, name: '超时未答' }
]

export const ERROR_TYPE_SOURCE = { manual: '手动标注', inferred: '系统推断' }

// 预置知识点库（依据：国考行测五大模块下主流题库/教辅的通用考点划分，可自行增删）
export const PRESET_KPS = [
  { name: '逻辑填空-实词', moduleId: 1 }, { name: '逻辑填空-成语', moduleId: 1 },
  { name: '片段阅读-主旨概括', moduleId: 1 }, { name: '片段阅读-意图判断', moduleId: 1 },
  { name: '片段阅读-细节理解', moduleId: 1 }, { name: '语句排序', moduleId: 1 },
  { name: '语句填空', moduleId: 1 }, { name: '篇章阅读', moduleId: 1 },
  { name: '行程问题', moduleId: 2 }, { name: '工程问题', moduleId: 2 },
  { name: '经济利润', moduleId: 2 }, { name: '排列组合', moduleId: 2 },
  { name: '概率问题', moduleId: 2 }, { name: '几何问题', moduleId: 2 },
  { name: '浓度问题', moduleId: 2 }, { name: '最值问题', moduleId: 2 },
  { name: '图形推理-位置规律', moduleId: 3 }, { name: '图形推理-样式规律', moduleId: 3 },
  { name: '图形推理-数量规律', moduleId: 3 }, { name: '图形推理-立体图形', moduleId: 3 },
  { name: '定义判断', moduleId: 3 }, { name: '类比推理', moduleId: 3 },
  { name: '翻译推理', moduleId: 3 }, { name: '加强削弱', moduleId: 3 },
  { name: '增长率', moduleId: 4 }, { name: '增长量', moduleId: 4 },
  { name: '比重', moduleId: 4 }, { name: '平均数', moduleId: 4 },
  { name: '倍数', moduleId: 4 }, { name: '隔年增长', moduleId: 4 },
  { name: '政治常识', moduleId: 5 }, { name: '法律常识', moduleId: 5 },
  { name: '经济常识', moduleId: 5 }, { name: '历史人文', moduleId: 5 },
  { name: '地理科技', moduleId: 5 }, { name: '时事政治', moduleId: 5 }
]

// ===================== 数据库 =====================
// 数据模型依据：设计方案「四、数据模型设计」
// paper / question / answer_record / mistake / knowledge_point / question_type(静态枚举) / paper_module_score
class AppDB extends Dexie {
  constructor() {
    super('xingce_assistant')
    this.version(1).stores({
      papers: '++id, name, examDate, createdAt',
      questions: '++id, paperId, qno, typeId, kpId, fenbiQno',
      answerRecords: '++id, questionId, paperId, mode, isCorrect, answeredAt',
      mistakes: '++id, questionId, kpId, errorTypeId, status, addedAt',
      knowledgePoints: '++id, moduleId, name',
      paperModuleScores: '++id, paperId, moduleId',
      settings: 'key'
    })
  }
}

export const db = new AppDB()

// ===================== 初始化与设置 =====================
export async function initDB() {
  const kpCount = await db.knowledgePoints.count()
  if (kpCount === 0) {
    await db.knowledgePoints.bulkAdd(PRESET_KPS.map(k => ({ ...k, preset: 1 })))
  }
  const langPath = await getSetting('ocrLangPath')
  if (langPath === undefined) await setSetting('ocrLangPath', '')
}

export async function getSetting(key) {
  const row = await db.settings.get(key)
  return row ? row.value : undefined
}
export async function setSetting(key, value) {
  await db.settings.put({ key, value })
}

// ===================== 知识点 =====================
export async function ensureKp(name, moduleId) {
  const found = await db.knowledgePoints.where('name').equals(name).first()
  if (found) return found.id
  return db.knowledgePoints.add({ name, moduleId: moduleId || null, preset: 0 })
}

// 快速录入/粉笔导入时，题目先挂到「模块·综合」知识点，保证模块级统计可用，后续可再细分
export async function ensureModuleKp(moduleId) {
  const name = `${MODULES.find(m => m.id === moduleId)?.name || '未知'}·综合`
  return ensureKp(name, moduleId)
}

// ===================== 错误类型规则推断 =====================
// 依据：设计方案 3.4.2 —— 未作答→超时未答；曾答对后答错→粗心；同一知识点连续错→概念不清；其余→方法不熟
export function inferErrorType(targetRecord, qRecords, kpRecords) {
  if (!targetRecord.userAnswer) return 4 // 超时未答
  const before = ts => qRecords.filter(r => r.answeredAt < ts)
  if (before(targetRecord.answeredAt).some(r => r.isCorrect)) return 1 // 曾答对后答错 → 粗心(不稳)
  const kpBefore = kpRecords.filter(r => r.answeredAt < targetRecord.answeredAt)
  const last = kpBefore[kpBefore.length - 1]
  if (last && !last.isCorrect) return 2 // 同知识点连续错 → 概念不清
  return 3 // 其余 → 方法不熟
}

// 将一次作答沉淀为错题本条目（幂等：同题已存在则刷新状态与知识点）
export async function collectMistake(question, errorTypeId, errorTypeSource) {
  const exist = await db.mistakes.where('questionId').equals(question.id).first()
  if (exist) {
    await db.mistakes.update(exist.id, {
      kpId: question.kpId ?? exist.kpId,
      status: '待复习',
      ...(errorTypeId ? { errorTypeId, errorTypeSource } : {})
    })
    return exist.id
  }
  return db.mistakes.add({
    questionId: question.id,
    kpId: question.kpId ?? null,
    errorTypeId: errorTypeId ?? null,
    errorTypeSource: errorTypeId ? (errorTypeSource || 'inferred') : 'inferred',
    status: '待复习',
    mastery: 0,
    addedAt: Date.now(),
    note: ''
  })
}

// ===================== 备份 / 恢复 =====================
export async function exportBackup() {
  const [papers, questions, answerRecords, mistakes, knowledgePoints, paperModuleScores, settings] = await Promise.all([
    db.papers.toArray(), db.questions.toArray(), db.answerRecords.toArray(),
    db.mistakes.toArray(), db.knowledgePoints.toArray(), db.paperModuleScores.toArray(), db.settings.toArray()
  ])
  return { version: 1, exportedAt: Date.now(), papers, questions, answerRecords, mistakes, knowledgePoints, paperModuleScores, settings }
}

export async function importBackup(data) {
  if (!data || !Array.isArray(data.questions)) throw new Error('备份文件格式不正确')
  await db.transaction('rw', [db.papers, db.questions, db.answerRecords, db.mistakes, db.knowledgePoints, db.paperModuleScores, db.settings], async () => {
    await Promise.all([
      db.papers.clear(), db.questions.clear(), db.answerRecords.clear(),
      db.mistakes.clear(), db.knowledgePoints.clear(), db.paperModuleScores.clear()
    ])
    await db.papers.bulkAdd(data.papers || [])
    await db.questions.bulkAdd(data.questions || [])
    await db.answerRecords.bulkAdd(data.answerRecords || [])
    await db.mistakes.bulkAdd(data.mistakes || [])
    await db.knowledgePoints.bulkAdd(data.knowledgePoints || [])
    await db.paperModuleScores.bulkAdd(data.paperModuleScores || [])
    if (data.settings) await db.settings.bulkPut(data.settings)
  })
}
