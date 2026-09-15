// ==UserScript==
// @name         粉笔网页版题目导出器（行测小助手专用）
// @namespace    xingce-assistant
// @version      0.1.0
// @description  在粉笔网页版（fenbi.com）题目/报告页，一键把整页题目提取为 JSON，供「行测小助手」→ 录入试卷 → ⑤ 粉笔网页版导入（B. 导入脚本 JSON）使用。
// @author       xingce-assistant
// @match        https://www.fenbi.com/*
// @match        https://*.fenbi.com/*
// @grant        GM_setClipboard
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

/*
 * 使用说明
 * 1. 用 Tampermonkey 安装本脚本，打开粉笔网页版的模考报告 / 题目解析页；
 * 2. 点击右下角「导出题目JSON」按钮；
 * 3. 题目数据会自动复制到剪贴板并下载 .json 文件；
 * 4. 回到「行测小助手」→ 录入试卷 → ⑤ 粉笔网页版导入 → B. 导入脚本 JSON。
 *
 * 提取模式说明（诚实声明，保证有据）：
 * - 当前为【文本兜底模式】：直接解析页面可见文本，规则与「行测小助手」的粘贴解析完全一致
 *   （模块分段标题 / 题号切块 / A-D选项 / 正确答案 / 你的答案 / 解析）。
 * - 【精准选择器模式】的配置位已预留（下方 CONFIG.selectors），
 *   需要一份真实报告页的 HTML 结构样本后才能编写可靠选择器——不凭空猜测页面结构。
 */

(function () {
  'use strict'

  // ===== 可配置区（精准选择器模式，待真实页面样本校准；为空时走文本兜底模式）=====
  const CONFIG = {
    // questionCard: '题卡容器选择器，如 .question-item',
    // stem: '题干选择器', option: '选项选择器', answer: '正确答案选择器',
    // userAnswer: '你的作答选择器', analysis: '解析选择器'
    selectors: {},
    includeAnalysis: true
  }

  // ================= 以下解析规则与主程序 parse.js 保持一致 =================
  const MODULE_HEADER_RE = /^\s*(?:[一二三四五六七八九十]+\s*[、.．]?\s*)?(言语理解与表达|言语理解|数量关系|判断推理|资料分析|常识判断)[^\d\n]{0,8}$/

  function aliasToModuleId(alias) {
    if (alias.includes('言语')) return 1
    if (alias.includes('数量')) return 2
    if (alias.includes('判断')) return 3
    if (alias.includes('资料')) return 4
    if (alias.includes('常识')) return 5
    return null
  }

  function splitBlock(raw) {
    const kpMatch = raw.match(/(?:知识点|考点)\s*[:：]\s*([^\n]+)/)
    const kpName = kpMatch ? kpMatch[1].trim().slice(0, 20) : ''
    const ansKey = raw.match(/正确答案\s*[:：]?\s*([A-D]{1,4}(?:\s*,\s*[A-D]{1,4})*)\s*/i)
    const ansPlain = raw.match(/(?<!你的)答案\s*[:：]?\s*([A-D]{1,4}(?:\s*,\s*[A-D]{1,4})*)\s*/i)
    const answer = (ansKey ? ansKey[1] : (ansPlain ? ansPlain[1] : '')).replace(/\s+/g, '').toUpperCase()
    const userMatch = raw.match(/(?:你的答案|我的答案|作答)\s*[:：]?\s*([A-D]{1,4}|未|未答|空)\s*/i)
    const userAnswer = userMatch ? (/^(未|未答|空)$/i.test(userMatch[1]) ? '' : userMatch[1].toUpperCase()) : ''
    const anMatch = raw.match(/解\s*析\s*[:：]([\s\S]*)$/)
    const analysis = anMatch ? anMatch[1].trim() : ''
    let body = raw
    if (anMatch) body = body.slice(0, anMatch.index)
    body = body.replace(/(?:正确答案|你的答案|我的答案|(?<!你的)答案)\s*[:：]?\s*[A-D]{1,4}(?:\s*,\s*[A-D]{1,4})*\s*/g, '')
    body = body.replace(/(?:你的答案|我的答案|作答)\s*[:：]?\s*(?:[A-D]{1,4}|未|未答|空)\s*/g, '')
    body = body.replace(/(?:知识点|考点)\s*[:：]\s*[^\n]+\n?/g, '')
    body = body.replace(/【\s*(单选|多选|不定项)\s*】/g, '')
    const optRe = /([A-D])\s*[.、．:：]\s*/g
    const positions = []
    let om
    while ((om = optRe.exec(body))) positions.push({ letter: om[1], textStart: om.index + om[0].length, markerStart: om.index })
    const kept = []
    let expect = 0
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
    return { stem, options, answer, userAnswer, analysis: CONFIG.includeAnalysis ? analysis : '', kpName }
  }

  function parseFenbiWeb(text) {
    const t = String(text || '').replace(/\r/g, '')
    const lines = t.split('\n')
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
    const blocks = []
    for (const s of segs) {
      const segText = t.slice(s.from, s.to)
      const markerRe = /(?:^|\n)\s*(\d{1,3})\s*[.、．]/g
      const marks = []
      let m
      while ((m = markerRe.exec(segText))) marks.push({ qno: +m[1], contentStart: m.index + m[0].length, blockStart: m.index })
      for (let i = 0; i < marks.length; i++) {
        const end = i + 1 < marks.length ? marks[i + 1].blockStart : segText.length
        blocks.push({ qno: marks[i].qno, moduleId: s.moduleId, ...splitBlock(segText.slice(marks[i].contentStart, end)) })
      }
    }
    return blocks
  }

  // ================= 导出流程 =================
  function extract() {
    const text = document.body.innerText || ''
    const questions = parseFenbiWeb(text)
    return {
      name: (document.title || '').replace(/[-–—|].*$/, '').trim().slice(0, 40) || '粉笔网页版导入',
      source: '粉笔网页版(脚本)',
      exportedAt: Date.now(),
      via: 'text-fallback',
      questions: questions.map(q => ({
        qno: q.qno, typeId: q.moduleId || 1, stem: q.stem, options: q.options,
        answer: q.answer, userAnswer: q.userAnswer, analysis: q.analysis, kpName: q.kpName
      }))
    }
  }

  function download(json) {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fenbi-questions-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 3000)
  }

  function showToast(msg, ok) {
    const t = document.createElement('div')
    t.textContent = msg
    t.style.cssText = `position:fixed;left:50%;top:60px;transform:translateX(-50%);z-index:99999;background:${ok ? '#16a34a' : '#dc2626'};color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.25)`
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 3200)
  }

  function main() {
    const json = extract()
    if (!json.questions.length) {
      showToast('未识别到题目（需要页面含“1、”式题号与选项文本）', false)
      return
    }
    const str = JSON.stringify(json, null, 2)
    if (typeof GM_setClipboard === 'function') GM_setClipboard(str)
    download(json)
    showToast(`已导出 ${json.questions.length} 题：已复制到剪贴板并下载 JSON`, true)
  }

  // 悬浮按钮
  const btn = document.createElement('button')
  btn.textContent = '导出题目JSON'
  btn.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:99999;background:#2f6fed;color:#fff;border:none;border-radius:24px;padding:12px 22px;font-size:14px;cursor:pointer;box-shadow:0 6px 20px rgba(47,111,237,.4);font-family:inherit'
  btn.addEventListener('click', main)
  document.body.appendChild(btn)
})()
