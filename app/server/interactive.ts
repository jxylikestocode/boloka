/// <reference lib="dom" />
// Completes a SEP-24 anchor's interactive page in a hidden Chrome, with
// FICTIONAL test details. This is only appropriate for a test anchor (here
// SDF's testanchor.stellar.org) so the prototype has no pop-up; with a real
// anchor the customer, or the sending app's own KYC, completes this step.
import puppeteer from 'puppeteer-core'
import type { Log } from './anchor.ts'

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Test values by field name/id; anything unrecognised gets a generic value. */
function valueFor(key: string, amount: string): string {
  const k = key.toLowerCase()
  if (k.includes('amount')) return amount
  if (k.includes('surname') || k.includes('last')) return 'Test'
  if (k === 'name' || k.includes('first')) return 'Kate'
  if (k.includes('email')) return 'lerato.test@example.com'
  if (k.includes('routing') || k.includes('bank_number') || k.includes('branch')) return '021000021'
  if (k.includes('account')) return '1234567890'
  if (k.includes('phone') || k.includes('mobile')) return '+26771234567'
  if (k.includes('country')) return 'BW'
  if (k.includes('city')) return 'Gaborone'
  return 'Test'
}

/** Desktop Chrome locally, Chromium in the container (--no-sandbox: it runs as root there). */
function launchChrome() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--no-sandbox', '--disable-dev-shm-usage'] })
}

export async function fillInteractiveForm(url: string, opts: { amount: string }, log: Log) {
  // --no-sandbox: Chrome runs as root inside the container.
  const browser = await launchChrome()
  try {
    const page = await browser.newPage()
    // Don't wait for the network to go quiet (the page keeps polling); the
    // form fields are what matter.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('input, select', { timeout: 15_000 }).catch(() => {})
    // Some anchors use more than one page; fill and submit until it shows
    // the transaction summary (or nothing is left to fill).
    for (let round = 0; round < 4; round++) {
      await page.waitForSelector('input, select, button', { timeout: 30_000 }).catch(() => {})
      const fields = await page.$$eval('input, select', (els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null && !(e as HTMLInputElement).disabled)
          .map((e) => ({ key: (e as HTMLInputElement).name || e.id, tag: e.tagName, type: (e as HTMLInputElement).type, value: (e as HTMLInputElement).value })),
      )
      const empty = fields.filter((f) => f.key && f.type !== 'hidden' && f.type !== 'submit' && f.type !== 'checkbox' && !f.value)
      if (!empty.length) break
      log('anchor form', { fields: empty.map((f) => f.key) })
      for (const f of empty) {
        if (f.tag === 'SELECT') {
          await page.$eval(`[name="${f.key}"], [id="${f.key}"]`, (el) => {
            const s = el as HTMLSelectElement
            const opt = [...s.options].find((o) => o.value)
            if (opt) s.value = opt.value
            s.dispatchEvent(new Event('change', { bubbles: true }))
          })
        } else {
          await page.type(`[name="${f.key}"], [id="${f.key}"]`, valueFor(f.key, opts.amount))
        }
      }
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /submit|continue|next|confirm/i.test(x.textContent ?? ''))
        if (!b) return false
        b.click()
        return true
      })
      if (!clicked) break
      // Wait for the page to move on (the fields we filled go away), not a fixed delay.
      await page
        .waitForFunction(
          (keys: string[]) =>
            keys.every((k) => {
              const el = document.querySelector(`[name="${k}"], [id="${k}"]`) as HTMLInputElement | null
              return !el || el.offsetParent === null || el.disabled
            }),
          { timeout: 4000 },
          empty.map((f) => f.key),
        )
        .catch(() => {})
    }
  } finally {
    await browser.close()
  }
}
