#!/usr/bin/env node
// 录制真实运行的 Windrise 智导助手（端口 5001）—— 自动驱动 UI 跑完准备好的问题串，
// 实时截屏，按实际耗时编码为 MP4（保证真实播放速度）。
// 前提：doc-knowledge-server 已在 5001 运行。
// 用法：node scripts/record-live-mp4.mjs [output.mp4] [起始题号] [题数]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const OUTPUT = resolve(process.argv[2] || 'generated-knowledge/windrise-5001-偏航液压问题串.mp4');
const START = Number(process.argv[3] || 0);
const COUNT = Number(process.argv[4] || 13);
const BASE = process.env.DEMO_BASE || 'http://127.0.0.1:5001';
const W = 1920, H = 1080;
const PORT = 9520;
const CADENCE_MS = 80;             // 目标 ~12.5fps 采样
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const cache = JSON.parse(readFileSync('generated-knowledge/pdf-question-answer-cache.json', 'utf8'));
const QUESTIONS = cache.items.slice(START, START + COUNT).map(x => x.question);

const framesDir = mkdtempSync(join(tmpdir(), 'winframes-'));
const userDir = mkdtempSync(join(tmpdir(), 'winrec-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--force-device-scale-factor=1', `--window-size=${W},${H}`,
  '--remote-allow-origins=*', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + userDir, 'about:blank',
], { stdio: ['ignore', 'ignore', 'inherit'] });
let chromeAlive = true;
chrome.on('exit', () => { chromeAlive = false; });

function cleanup(code) {
  try { chrome.kill('SIGKILL'); } catch {}
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
  try { rmSync(framesDir, { recursive: true, force: true }); } catch {}
  if (code !== undefined) process.exit(code);
}
process.on('SIGINT', () => cleanup(130));

let ws, msgId = 0;
const pending = new Map();
const evHandlers = new Map();
function connect(url) {
  return new Promise((res, rej) => {
    ws = new WebSocket(url);
    ws.onopen = () => res();
    ws.onerror = (e) => rej(new Error('WS error'));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method && evHandlers.has(m.method)) evHandlers.get(m.method)(m.params);
    };
  });
}
function send(method, params = {}, sessionId) {
  const id = ++msgId; const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify(payload)); });
}

const DIRECTOR = (questions) => `
(async () => {
  window.__demoDone = false; window.__demoStatus = 'intro';
  const QS = ${JSON.stringify(questions)};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, to) => { const t0 = Date.now(); while (Date.now()-t0 < to) { try { if (fn()) return true; } catch(e){} await sleep(200); } return false; };
  const input = document.getElementById('chatInput');
  const container = () => document.getElementById('chatMessages');
  const scrollTargetFor = (el) => { const c = container(); const cr = c.getBoundingClientRect(); const er = el.getBoundingClientRect(); return c.scrollTop + (er.top - cr.top); };
  const smoothScroll = (target, dur) => new Promise(res => {
    const c = container(); const start = c.scrollTop; const t0 = performance.now();
    const max = c.scrollHeight - c.clientHeight; const to = Math.max(0, Math.min(max, target));
    (function step(now){ const p = Math.min(1, (now - t0) / dur); const e = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2; c.scrollTop = start + (to - start) * e; if (p < 1) requestAnimationFrame(step); else res(); })(performance.now());
  });
  // 保持“排查过程”开启：展示推理图谱（思维链步骤/分析中状态已在页面内隐藏）
  try { const tg = document.getElementById('reasoningToggle'); if (tg && tg.getAttribute('aria-pressed') !== 'true') toggleReasoningChain(); } catch (e) {}
  await sleep(3000);                                   // 片头停留
  const lastAssistant = () => [...document.querySelectorAll('.message.assistant')].pop();
  const answerEl = (m) => m ? (m.querySelector('.assistant-answer') || m.querySelector('.message-content') || m) : null;
  for (let i = 0; i < QS.length; i++) {
    window.__demoStatus = 'turn ' + (i+1) + '/' + QS.length;
    // 逐字输入问题（现场工人口吻），让观众看清在问什么
    const q = QS[i];
    input.value = '';
    input.focus();
    for (let c = 0; c < q.length; c++) {
      input.value = q.slice(0, c + 1);
      try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      await sleep(55);
    }
    await sleep(1700);                                            // 打完停一下，读完整问题
    try { sendMessage(); } catch (e) { window.__demoError = String(e); }
    await sleep(700);
    // ⓪ 展示“提问”：滚到刚发出的问题气泡，停顿让观众看清在问什么
    const users = [...document.querySelectorAll('.message.user')];
    const ubub = users[users.length - 1];
    if (ubub) { await smoothScroll(scrollTargetFor(ubub) - 40, 700); await sleep(1500); }
    const m = lastAssistant();
    // ① 展示本轮推理图谱（滚到图谱卡片顶部，停留看图）
    const card = m ? m.querySelector('.reasoning-card') : null;
    if (card) { await smoothScroll(scrollTargetFor(card) - 16, 900); await sleep(5000); }
    // ② 等答案渲染完（不再是“正在…”占位）
    const answerReady = () => {
      const el = m ? m.querySelector('.assistant-answer') : null;
      if (!el) return false;
      const t = (el.textContent || '').trim();
      return t.length > 25 && !t.includes('正在') && !el.querySelector('.thinking, [class*="thinking"]');
    };
    await until(answerReady, 60000);
    await sleep(400);
    // ③ 滚到助手回答（最终指令），按长度停留阅读
    if (m) {
      const ans = m.querySelector('.assistant-answer') || m;
      await smoothScroll(scrollTargetFor(ans) - 70, 1400);
      const len = ((m.querySelector('.assistant-answer') || m).textContent || '').length;
      await sleep(Math.min(11000, Math.max(5000, len * 30)));
    } else {
      await sleep(6000);
    }
  }
  window.__demoStatus = 'outro';
  await sleep(4500);
  window.__demoDone = true;
})();
`;

async function main() {
  console.log(`录制真实系统 ${BASE}/?chat=1 · 题号 ${START}..${START + COUNT - 1} · 共 ${QUESTIONS.length} 题`);
  // 连接 Chrome
  let wsUrl;
  for (let i = 0; i < 100; i++) {
    if (!chromeAlive) throw new Error('Chrome 提前退出');
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) { wsUrl = j.webSocketDebuggerUrl; break; } } catch {}
    await sleep(150);
  }
  await connect(wsUrl);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  let loaded = false;
  evHandlers.set('Page.loadEventFired', () => { loaded = true; });
  await S('Page.navigate', { url: `${BASE}/?chat=1` });
  for (let i = 0; i < 120 && !loaded; i++) await sleep(50);
  await sleep(800);

  // 注入演播脚本（不 await，让它自行推进）
  await S('Runtime.evaluate', { expression: DIRECTOR(QUESTIONS), returnByValue: true });

  // 实时采样循环
  const evalv = async (expr) => (await S('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
  let f = 0;
  const t0 = Date.now();
  let lastStatus = '';
  while (true) {
    const frameStart = Date.now();
    const { data } = await S('Page.captureScreenshot', {
      format: 'jpeg', quality: 90,
      clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, captureBeyondViewport: true,
    });
    f++;
    writeFileSync(join(framesDir, `f_${String(f).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64'));
    const done = await evalv('window.__demoDone === true');
    const status = await evalv('window.__demoStatus') || '';
    if (status !== lastStatus) { lastStatus = status; process.stdout.write(`\r  [${((Date.now()-t0)/1000).toFixed(0)}s] ${status} · ${f} 帧      `); }
    if (done) break;
    if (Date.now() - t0 > 15 * 60 * 1000) { console.log('\n达到时间上限，停止'); break; }
    const elapsed = Date.now() - frameStart;
    if (elapsed < CADENCE_MS) await sleep(CADENCE_MS - elapsed);
  }
  const totalSec = (Date.now() - t0) / 1000;
  const fps = Math.max(1, (f - 1) / totalSec);
  process.stdout.write('\n');
  console.log(`采样完成：${f} 帧 / ${totalSec.toFixed(1)}s → 实测 ${fps.toFixed(2)} fps，开始编码…`);

  await new Promise((res, rej) => {
    const ff = spawn('ffmpeg', [
      '-y', '-framerate', fps.toFixed(4), '-i', join(framesDir, 'f_%06d.jpg'),
      '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-r', '30', '-movflags', '+faststart', OUTPUT,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg 退出码 ' + c)));
  });
  console.log('✅ 已生成:', OUTPUT);
}

main().then(() => cleanup(0)).catch(e => { console.error('\n❌', e.message); cleanup(1); });
