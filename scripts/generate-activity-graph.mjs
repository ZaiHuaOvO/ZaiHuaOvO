#!/usr/bin/env node
// 抓取 GitHub 公开贡献日历，渲染成近 31 天的折线图 SVG。
// 数据源是 github.com/users/<user>/contributions 的公开 HTML，不需要 token。
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const USER = process.env.GH_USER || 'ZaiHuaOvO'
const DAYS = 31
const OUT = 'activity-graph.svg'

const THEME = {
  bg: '#fffafc',
  border: '#ffd9e6',
  grid: '#f7e9f0',
  axis: '#b9a0a8',
  title: '#b07a8a',
  line: '#f7a8b8',
  area: '#ffc9de',
}

const W = 800
const H = 220
const PAD = { l: 46, r: 22, t: 42, b: 36 }

export function parseContributions(html) {
  const byId = new Map()
  for (const m of html.matchAll(/<tool-tip\b[^>]*>([\s\S]*?)<\/tool-tip>/g)) {
    const id = /(?:^|\s)for="([^"]+)"/.exec(m[0])
    if (!id) continue
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    const hit = /^([\d,]+)\s+contribution/i.exec(text)
    if (hit) byId.set(id[1], Number(hit[1].replace(/,/g, '')))
    else if (/^no contributions/i.test(text)) byId.set(id[1], 0)
  }

  const days = []
  for (const m of html.matchAll(/<td\b[^>]*>/g)) {
    const date = /(?:^|\s)data-date="(\d{4}-\d{2}-\d{2})"/.exec(m[0])
    if (!date) continue
    const id = /(?:^|\s)id="([^"]+)"/.exec(m[0])
    const level = /(?:^|\s)data-level="(\d)"/.exec(m[0])
    let count = id ? byId.get(id[1]) : undefined
    // 拿不到 tooltip 文本时退回 data-level，保证图表仍能画出来
    if (count === undefined) count = level ? Number(level[1]) : 0
    days.push({ date: date[1], count })
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return days
}

// 上限取 4 的倍数，保证 4 等分的 Y 轴刻度都是整数
function niceCeil(v) {
  return (
    [4, 8, 12, 16, 20, 24, 32, 40, 48, 60, 80, 100, 120, 160, 200].find((s) => s >= v) ??
    Math.ceil(v / 40) * 40
  )
}

export function renderSvg(days) {
  const n = days.length
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const baseY = PAD.t + plotH
  const max = niceCeil(Math.max(...days.map((d) => d.count), 1))

  const x = (i) => (n === 1 ? PAD.l + plotW / 2 : PAD.l + (plotW * i) / (n - 1))
  const y = (v) => baseY - (plotH * v) / max

  const pts = days.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`)
  const line = `M ${pts.join(' L ')}`
  const area = `${line} L ${x(n - 1).toFixed(1)},${baseY} L ${x(0).toFixed(1)},${baseY} Z`

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const gy = baseY - plotH * f
      return (
        `<line x1="${PAD.l}" y1="${gy.toFixed(1)}" x2="${W - PAD.r}" y2="${gy.toFixed(1)}" stroke="${THEME.grid}" stroke-width="1"/>` +
        `<text x="${PAD.l - 10}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${THEME.axis}">${Math.round(max * f)}</text>`
      )
    })
    .join('\n  ')

  const TICKS = 6
  const xLabels = Array.from({ length: TICKS }, (_, k) => {
    const i = Math.round(((n - 1) * k) / (TICKS - 1))
    const [, mm, dd] = days[i].date.split('-')
    return `<text x="${x(i).toFixed(1)}" y="${H - 14}" text-anchor="middle" font-size="10" fill="${THEME.axis}">${Number(mm)}/${Number(dd)}</text>`
  }).join('\n  ')

  const dots = days
    .map((d, i) =>
      d.count > 0
        ? `<circle cx="${x(i).toFixed(1)}" cy="${y(d.count).toFixed(1)}" r="2.4" fill="${THEME.line}"/>`
        : ''
    )
    .filter(Boolean)
    .join('\n  ')

  const total = days.reduce((s, d) => s + d.count, 0)
  const range = `${days[0].date.slice(5)} → ${days.at(-1).date.slice(5)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="再花最近 31 天的 GitHub 贡献折线图">
  <title>再花最近 31 天的 GitHub 贡献</title>
  <defs>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${THEME.area}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${THEME.area}" stop-opacity="0.04"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <text x="${PAD.l}" y="26" font-size="13" font-weight="600" fill="${THEME.title}">最近 31 天摸鱼记录</text>
  <text x="${W - PAD.r}" y="26" text-anchor="end" font-size="11" fill="${THEME.axis}">${range} · 共 ${total} 次贡献</text>
  ${grid}
  <path d="${area}" fill="url(#area)"/>
  <path d="${line}" fill="none" stroke="${THEME.line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  ${xLabels}
</svg>
`
}

async function main() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, {
    headers: { 'User-Agent': `${USER}-activity-graph` },
  })
  if (!res.ok) throw new Error(`抓取贡献日历失败：HTTP ${res.status}`)

  const all = parseContributions(await res.text())
  if (all.length === 0) {
    throw new Error('解析出 0 天数据，github.com 的页面结构可能已变更')
  }

  const recent = all.slice(-DAYS)
  writeFileSync(OUT, renderSvg(recent), 'utf8')

  const total = recent.reduce((s, d) => s + d.count, 0)
  console.log(
    `已生成 ${OUT}：${recent.length} 天（${recent[0].date} ~ ${recent.at(-1).date}），共 ${total} 次贡献`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
