// ============================================================
// 文本解析引擎 —— 录入提速的核心
// 1) parseAnswerSequence：答题卡串解析（支持题号前缀 / 纯字母串 / 未作答标记）
// 2) parseQuestionBlocks：整卷/整题文本解析（题干、选项、答案、解析、知识点）
// 3) parseFenbiScore：粉笔模考成绩页解析（模块得分、逐题对错）
// ============================================================

const MISS = /^(未|未答|空|缺|无|U|\?|？|-|—|－)$/i

function normToken(tok) {
  if (!tok) return ''
  const t = tok.trim().toUpperCase()
  if (/^[A-D]{1,4}$/.test(t)) return t
  if (MISS.test(tok.trim())) return '' // 未作答
  return null // 非法
}

// ---------- 1. 答题卡串 ----------
// 输入示例A（带题号）： 1.B 2.C 3.未 4、A
// 输入示例B（纯串）：   BCADU CCADB ...   （U/未/? 表示未作答）
export function parseAnswerSequence(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[，]/g, ',')
  // 先试带题号模式
  const numbered = []
  const re = /(\d{1,3})\s*[.、．:：]?\s*([A-Da-d]{1,4}(?:\s*,\s*[A-Da-d]{1,4})*|未|未答|空|缺|无|U|\?|？|-|—|－)/g
  let m
  while ((m = re.exec(clean))) {
    let val = m[2].trim().toUpperCase().replace(/\s+/g, '')
    if (/^(未|未答|空|缺|无|U|\?|？|-|—|－)$/.test(val)) val = ''
    else if (!/^[A-D]{1,4}(,[A-D]{1,4})*$/.test(val)) continue
    numbered.push({ qno: +m[1], val })
  }
  if (numbered.length >= 3 && numbered.every((x, i) => i === 0 || x.qno > numbered[i - 1].qno)) {
    return { mode: 'numbered', items: numbered }
  }
  // 纯串模式：逐字符取（U/未/空/缺/? 等均视为未作答）
  const tokens = clean.match(/[A-Da-dUu]|未|空|缺|无|\?|？|-|—|－/g) || []
  const items = tokens.map((t, i) => ({ qno: i + 1, val: normToken(t) ?? '' }))
  return { mode: 'plain', items }
}

// ---------- 2. 题目块解析 ----------
// 输入示例：
// 1、下列各组成语中……
// A．相濡以沫 B．耳熟能详 C．…… D．……
// 答案：B
// 解析：……
export function parseQuestionBlocks(text) {
  const t = String(text || '').replace(/\r/g, '')
  const markerRe = /(?:^|\n)\s*(\d{1,3})\s*[.、．]/g
  const marks = []
  let m
  while ((m = markerRe.exec(t))) marks.push({ qno: +m[1], contentStart: m.index + m[0].length, blockStart: m.index })
  if (!marks.length) return []
  const blocks = []
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].blockStart : t.length
    const raw = t.slice(marks[i].contentStart, end)
    blocks.push({ qno: marks[i].qno, ...splitBlock(raw) })
  }
  return blocks
}

export function splitBlock(raw) {
  // 知识点
  const kpMatch = raw.match(/(?:知识点|考点)\s*[:：]\s*([^\n]+)/)
  const kpName = kpMatch ? kpMatch[1].trim().slice(0, 20) : ''
  // 正确答案：优先匹配「正确答案」，避免把「你的答案：C」误当成正确答案
  const ansKey = raw.match(/正确答案\s*[:：]?\s*([A-D]{1,4}(?:\s*,\s*[A-D]{1,4})*)\s*/i)
  const ansPlain = raw.match(/(?<!你的)答案\s*[:：]?\s*([A-D]{1,4}(?:\s*,\s*[A-D]{1,4})*)\s*/i)
  const answer = (ansKey ? ansKey[1] : (ansPlain ? ansPlain[1] : '')).replace(/\s+/g, '').toUpperCase()
  // 你的答案（粉笔网页版复制格式），映射为默认作答
  const userMatch = raw.match(/(?:你的答案|我的答案|作答)\s*[:：]?\s*([A-D]{1,4}|未|未答|空)\s*/i)
  const userAnswer = userMatch ? (/^(未|未答|空)$/i.test(userMatch[1]) ? '' : userMatch[1].toUpperCase()) : ''
  // 解析（从"解析"标记到块尾）
  const anMatch = raw.match(/解\s*析\s*[:：]([\s\S]*)$/)
  const analysis = anMatch ? anMatch[1].trim() : ''
  // 主体（去掉答案与解析部分）
  let body = raw
  if (anMatch) body = body.slice(0, anMatch.index)
  body = body.replace(/(?:正确答案|你的答案|我的答案|(?<!你的)答案)\s*[:：]?\s*[A-D]{1,4}(?:\s*,\s*[A-D]{1,4})*\s*/g, '')
  body = body.replace(/(?:你的答案|我的答案|作答)\s*[:：]?\s*(?:[A-D]{1,4}|未|未答|空)\s*/g, '')
  body = body.replace(/(?:知识点|考点)\s*[:：]\s*[^\n]+\n?/g, '')
  // 清理粉笔网页版常见题型标记
  body = body.replace(/【\s*(单选|多选|不定项)\s*】/g, '')
  // 选项定位：仅接受按 A→B→C→D 顺序出现的标记，避免把题干中的"A市"当选项
  const optRe = /([A-D])\s*[.、．:：]\s*/g
  const positions = []
  let om
  while ((om = optRe.exec(body))) positions.push({ letter: om[1], textStart: om.index + om[0].length, markerStart: om.index })
  const kept = []
  let expect = 0 // 'A'.charCodeAt
  for (const p of positions) {
    if (p.letter.charCodeAt(0) === 65 + expect) { kept.push(p); expect++ }
  }
  const options = { A: '', B: '', C: '', D: '' }
  let stem = body.trim()
  if (kept.length >= 2) {
    stem = body.slice(0, kept[0].markerStart).trim()
    for (let i = 0; i < kept.length; i++) {
      const end = i + 1 < kept.length ? kept[i + 1].markerStart : body.length
      options[kept[i].letter] = body.slice(kept[i].textStart, end).trim()
    }
  }
  return { stem, options, answer, userAnswer, analysis, kpName }
}

// ---------- 3. 粉笔模考成绩页解析 ----------
// 支持：模块得分（言语理解与表达 32/40）、逐题对错（1.对 2.错 或 纯"对错对…"串 或 "错题：3,5,7"）
const MODULE_ALIAS = [
  [/言语/, 1], [/数量/, 2], [/判断/, 3], [/资料/, 4], [/常识/, 5]
]
export function parseFenbiScore(text) {
  const t = String(text || '').replace(/\r/g, '')
  const result = { name: '', modules: {}, wrongList: null, seq: [], totalHint: 0, warnings: [] }

  // 试卷名
  const nameLine = t.split('\n').map(s => s.trim()).find(s => s.length >= 4)
  const nameMatch = nameLine && nameLine.match(/[「【]?(.{4,40}?模考.{0,12}?)[」】]?/)
  result.name = nameMatch ? nameMatch[1] : (nameLine || '')

  // 模块得分
  for (const line of t.split('\n')) {
    for (const [aliasRe, moduleId] of MODULE_ALIAS) {
      const mm = line.match(new RegExp(`(${aliasRe.source})[^\\d]{0,12}(\\d{1,3})\\s*[/／]\\s*(\\d{1,3})`))
      if (mm) {
        const key = `m${moduleId}`
        if (!result.modules[key]) result.modules[key] = { moduleId, score: 0, total: 0 }
        result.modules[key].score = +mm[2]
        result.modules[key].total = +mm[3]
      }
    }
    const tm = line.match(/(?:总分|成绩)[^\d]{0,8}(\d{1,3}(?:\.\d)?)/)
    if (tm) result.totalScore = +tm[1]
  }

  // 逐题对错：带题号
  const numbered = []
  const nre = /(\d{1,3})\s*[.、．:：]?\s*(对|错|√|×|✓|✗|未|未答|空)/g
  let nm
  while ((nm = nre.exec(t))) numbered.push({ qno: +nm[1], ok: /^(对|√|✓)$/.test(nm[2]), miss: /^(未|未答|空)/.test(nm[2]) })
  if (numbered.length >= 3 && numbered.every((x, i) => i === 0 || x.qno > numbered[i - 1].qno)) {
    result.seq = numbered
    result.totalHint = numbered.length
  } else {
    // 纯对错串
    const tokens = t.match(/对|错|√|×|✓|✗|未答|未|空/g) || []
    if (tokens.length >= 3) {
      result.seq = tokens.map((tk, i) => ({ qno: i + 1, ok: /^(对|√|✓)$/.test(tk), miss: /^(未答|未|空)$/.test(tk) }))
      result.totalHint = result.seq.length
    }
  }
  // 错题列表兜底
  const wl = t.match(/错题[:：]([\d\s,，、]+)/)
  if (wl) result.wrongList = (wl[1].match(/\d{1,3}/g) || []).map(Number)

  const moduleTotal = Object.values(result.modules).reduce((s, x) => s + x.total, 0)
  if (!result.seq.length && !result.wrongList) result.warnings.push('未识别到逐题对错，请粘贴含"对/错"序列或错题题号的文本')
  if (moduleTotal && result.totalHint && moduleTotal !== result.totalHint) {
    result.warnings.push(`模块题量合计(${moduleTotal})与对错序列长度(${result.totalHint})不一致，请核对模块题量分布`)
  }
  return result
}

// ---------- 4. 粉笔网页版报告/解析页文本解析 ----------
// 依据：粉笔网页版报告按模块分段（如「一、言语理解与表达」），题号全卷连续，
//       题目含题干/选项/正确答案/你的答案/解析。模块标题行用于题型自动归类。
const MODULE_HEADER_RE = /^\s*(?:[一二三四五六七八九十]+\s*[、.．]?\s*)?(言语理解与表达|言语理解|数量关系|判断推理|资料分析|常识判断)[^\d\n]{0,8}$/
export function parseFenbiWeb(text) {
  const t = String(text || '').replace(/\r/g, '')
  const lines = t.split('\n')
  // 扫描模块标题行，切分段落
  const segs = []
  let cur = { moduleId: null, from: 0 }
  let pos = 0
  for (const line of lines) {
    const m = line.match(MODULE_HEADER_RE)
    if (m) {
      if (pos > cur.from || segs.length || cur.moduleId !== null) segs.push({ ...cur, to: pos })
      cur = { moduleId: aliasToModuleId(m[1]), from: pos }
    }
    pos += line.length + 1
  }
  segs.push({ ...cur, to: t.length })
  // 各段独立拆题，段落标题决定题型
  const blocks = []
  for (const s of segs) {
    const segText = t.slice(s.from, s.to)
    const parsed = parseQuestionBlocks(segText)
    for (const b of parsed) blocks.push({ ...b, moduleId: s.moduleId })
  }
  return blocks
}
function aliasToModuleId(alias) {
  if (alias.includes('言语')) return 1
  if (alias.includes('数量')) return 2
  if (alias.includes('判断')) return 3
  if (alias.includes('资料')) return 4
  if (alias.includes('常识')) return 5
  return null
}

// 按模块题量分布生成题型区间（粉笔导入用）
export function buildModuleRanges(modules, seqLen) {
  const order = [1, 2, 3, 4, 5]
  const ranges = []
  let start = 1
  for (const m of order) {
    const info = modules[`m${m}`]
    if (info && info.total > 0) {
      ranges.push({ from: start, to: start + info.total - 1, moduleId: m })
      start += info.total
    }
  }
  if (start - 1 < seqLen && ranges.length) ranges[ranges.length - 1].to = seqLen
  return ranges
}

export function moduleOfQno(ranges, qno) {
  for (const r of ranges) if (qno >= r.from && qno <= r.to) return r.moduleId
  return null
}
