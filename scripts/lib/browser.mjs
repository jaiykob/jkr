/**
 * A small headless Chrome driver over the DevTools protocol, for the scorecard
 * (scripts/score.mjs) and screenshots. No dependencies: Node's own WebSocket.
 *
 * Why not `chrome --window-size=360,900 --dump-dom`: on Windows headless
 * Chrome will not make a window narrower than about 526px, so a "360px" check
 * silently measured 526px. Device emulation sets the real phone viewport.
 *
 *   const b = await openBrowser();          // null when no Chrome is installed
 *   const p = await b.page({ width: 360 });
 *   await p.goto('http://127.0.0.1:1234/index.html');
 *   const html = await p.html();
 *   await p.screenshot('home.png');
 *   await b.close();
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p)) || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openBrowser() {
  if (!CHROME) return null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jkr-cdp-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) { proc.kill(); return null; }
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(m.error.message)); else res(m.result);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  async function page({ width = 360, height = 900 } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await s('Page.enable');
    const evaluate = async (expression) => {
      const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return r.result ? r.result.value : undefined;
    };
    return {
      evaluate,
      /** Load a URL and wait until the page (after any redirect) has loaded and settled. */
      async goto(url, settleMs = 2500) {
        await s('Page.navigate', { url });
        // A seeded URL hops through /__seed.html first: wait for the page after it.
        for (let i = 0; i < 150; i++) {
          await sleep(100);
          const st = await evaluate('[document.readyState, location.pathname].join(" ")').catch(() => '');
          if (st && st.startsWith('complete') && !st.endsWith('/__seed.html')) break;
        }
        await sleep(settleMs);
      },
      html: () => evaluate('document.documentElement.outerHTML'),
      /** The whole page, the first screen, or (selector) the part starting at that element. */
      async screenshot(file, { full = true, selector = null, tall = height } = {}) {
        const m = await s('Page.getLayoutMetrics');
        let y = 0, h = full ? Math.ceil(m.cssContentSize.height) : height;
        if (selector) {
          y = Math.max(0, Math.floor(await evaluate(`(function(){var e=document.querySelector(${JSON.stringify(selector)});return e?e.getBoundingClientRect().top+scrollY:0;})()`) || 0));
          h = Math.min(tall, Math.ceil(m.cssContentSize.height) - y);
        }
        const r = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height: h, scale: 1 } });
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      },
      close: () => send('Target.closeTarget', { targetId }).catch(() => {}),
    };
  }

  async function close() {
    try { await send('Browser.close'); } catch { /* already gone */ }
    try { ws.close(); } catch { /* closed */ }
    proc.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file */ }
  }
  return { page, close };
}
