/**
 * A small headless Chrome driver over the DevTools protocol, for the scorecard
 * (scripts/score.mjs) and screenshots. No dependencies: Node's own WebSocket.
 *
 * Page helpers for scripted journeys: click(sel), type(sel, text), taps()
 * (clicks made through click() since the last goto), interceptScript(prefix, body).
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
  const listeners = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method) { for (const l of listeners) l(m); return; }
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
    let taps = 0;
    const mouse = (type, x, y) => s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    return {
      evaluate,
      /** Load a URL and wait until the page (after any redirect) has loaded and settled. */
      async goto(url, settleMs = 2500) {
        taps = 0;
        await s('Page.navigate', { url });
        // A seeded URL hops through /__seed.html first: wait for the page after it.
        for (let i = 0; i < 150; i++) {
          await sleep(100);
          const st = await evaluate('[document.readyState, location.pathname].join(" ")').catch(() => '');
          if (st && st.startsWith('complete') && !st.endsWith('/__seed.html')) break;
        }
        await sleep(settleMs);
      },
      /** A real click at the element's center (scrolled into view). Counts as one tap.
       *  The scroll is instant: with the site's smooth scrolling the box read right after a
       *  smooth scrollIntoView is where the element was before the scroll, and the click missed. */
      async click(selector, settleMs = 400) {
        const r = await evaluate(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;
e.scrollIntoView({block:'center',behavior:'instant'});var b=e.getBoundingClientRect();return b.width&&b.height?{x:b.left+b.width/2,y:b.top+b.height/2}:null;})()`);
        if (!r) throw new Error(`click: nothing visible at ${selector}`);
        await mouse('mouseMoved', r.x, r.y); await mouse('mousePressed', r.x, r.y); await mouse('mouseReleased', r.x, r.y);
        taps++;
        await sleep(settleMs);
      },
      /** Focus a field and type into it (no tap: typing is free in the tap budget). */
      async type(selector, str) {
        const ok = await evaluate(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'center'});e.focus();if(e.select)e.select();return true;})()`);
        if (!ok) throw new Error(`type: nothing at ${selector}`);
        await s('Input.insertText', { text: String(str) });
        await sleep(150);
      },
      taps: () => taps,
      /** Answer any request whose URL starts with urlPrefix with this script body. */
      async interceptScript(urlPrefix, body) {
        listeners.push((m) => {
          if (m.sessionId !== sessionId || m.method !== 'Fetch.requestPaused') return;
          const { requestId, request } = m.params;
          if (request.url.startsWith(urlPrefix)) {
            s('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(String(body)).toString('base64') }).catch(() => {});
          } else s('Fetch.continueRequest', { requestId }).catch(() => {});
        });
        await s('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
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
