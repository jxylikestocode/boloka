// npm run export:animation [-- --url http://localhost:5181]
//
// Re-exports the "How it works" pool animation (src/PoolAnimation.tsx) for
// slides, from a running build of the app (the public site by default):
//   docs/pool-animation.svg   standalone, animates by itself (HTML slides, web)
//   docs/pool-animation.gif   800px, seamless 10.8 s loop (PowerPoint, Keynote, Google Slides)
//   docs/pool-animation.mp4   1280px, same loop (video placeholders)
// Edit the picture in src/PoolAnimation.tsx, check it at /help, deploy (or run a
// dev server and pass --url), then run this. Needs Chrome (CHROME_PATH) and ffmpeg.
import puppeteer from 'puppeteer-core'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const url = (args[args.indexOf('--url') + 1] || 'https://boloka.fly.dev').replace(/\/$/, '')
const DOCS = fileURLToPath(new URL('../../docs/', import.meta.url))
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// The coin animations run 2.7 s, 3 s and 3.6 s: 10.8 s is their common period.
// The waves are retimed to fit it too, so the loop has no seam.
const LOOP_S = 10.8
const FPS = 15

if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('ffmpeg not found (brew install ffmpeg)')
  process.exit(1)
}

console.log(`opening ${url}/help …`)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 680, height: 440, deviceScaleFactor: 1 })
  // Not "network idle": the app keeps polling its API. The picture is what matters.
  await page.goto(`${url}/help?embed=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('.help-anim', { timeout: 30_000 })
  await new Promise((r) => setTimeout(r, 1500))

  // 1. Standalone SVG: the live markup with its CSS inside.
  const svg = await page.evaluate(() => {
    const live = document.querySelector('.help-anim')
    const s = live.cloneNode(true)
    const css = live.parentElement.querySelector('style').textContent
    s.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    s.removeAttribute('width')
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    st.textContent = css
    s.insertBefore(st, s.firstChild)
    return s.outerHTML
  })
  writeFileSync(join(DOCS, 'pool-animation.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Boloka: how the pool works (src/PoolAnimation.tsx). Animated with CSS; opens in any browser, embeds in HTML inline or with <img>. -->\n${svg}\n`)
  console.log('wrote docs/pool-animation.svg')

  // 2. Frames: only the picture on its card, animations paused and stepped so every frame is exact.
  await page.evaluate(() => {
    const card = document.querySelector('.help-anim').parentElement
    document.body.innerHTML = ''
    document.body.style.cssText = 'margin:0;background:#FFFFFF;display:flex;align-items:center;justify-content:center;height:100vh'
    card.style.width = '640px'
    card.style.boxSizing = 'border-box'
    document.body.appendChild(card)
    for (const a of document.getAnimations()) {
      const el = a.effect?.target
      if (el?.classList.contains('wave')) a.effect.updateTiming({ duration: el.classList.contains('back') ? 5400 : 2700 })
    }
  })
  const dir = mkdtempSync(join(tmpdir(), 'boloka-anim-'))
  const n = Math.round(LOOP_S * FPS)
  for (let i = 0; i < n; i++) {
    const t = (i / FPS) * 1000
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) {
        a.pause()
        a.currentTime = t
      }
    }, t)
    await page.screenshot({ path: join(dir, `f${String(i).padStart(3, '0')}.png`) })
  }
  console.log(`rendered ${n} frames`)

  const run = (a) => {
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f%03d.png'), ...a], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error('ffmpeg failed')
  }
  run(['-vf', 'scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', join(DOCS, 'pool-animation.gif')])
  console.log('wrote docs/pool-animation.gif')
  run(['-vf', 'scale=1280:-2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(DOCS, 'pool-animation.mp4')])
  console.log('wrote docs/pool-animation.mp4')
} finally {
  await browser.close()
}
