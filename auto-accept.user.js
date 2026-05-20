// ==UserScript==
// @name         五鮮級供應商自動接單
// @namespace    https://eip.5starlimitpot.com.tw/
// @version      1.0.0
// @description  自動點擊「查看並接單」→「確認接單」→「接受訂單」，批次處理所有待接訂單
// @author       wuxian-order
// @match        https://eip.5starlimitpot.com.tw/supplier/orders*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── 設定 ────────────────────────────────────────────────
  const STEP_DELAY = 800;   // 每次點擊後等待（毫秒）
  const SCAN_DELAY = 1200;  // 每筆訂單完成後等下一筆（毫秒）

  // ── 建立懸浮控制面板 ────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'autoAcceptPanel';
  panel.innerHTML = `
    <div id="aap-header">⚡ 自動接單</div>
    <div id="aap-status">就緒</div>
    <div id="aap-count"></div>
    <button id="aap-start">▶ 開始自動接單</button>
    <button id="aap-stop" disabled>⏹ 停止</button>
  `;
  Object.assign(panel.style, {
    position: 'fixed', top: '80px', right: '16px', zIndex: '99999',
    background: '#fff', border: '2px solid #1e6b3e', borderRadius: '12px',
    padding: '14px 16px', boxShadow: '0 4px 20px rgba(0,0,0,.18)',
    fontFamily: 'sans-serif', fontSize: '13px', minWidth: '160px',
    display: 'flex', flexDirection: 'column', gap: '8px'
  });

  const style = document.createElement('style');
  style.textContent = `
    #aap-header { font-weight: 700; color: #1e6b3e; font-size: 15px; text-align: center; }
    #aap-status { color: #555; font-size: 12px; text-align: center; min-height: 16px; }
    #aap-count  { color: #1e6b3e; font-size: 12px; text-align: center; min-height: 14px; font-weight: 600; }
    #aap-start  {
      background: #1e6b3e; color: #fff; border: none; border-radius: 8px;
      padding: 9px 0; cursor: pointer; font-size: 13px; font-weight: 700;
    }
    #aap-start:hover:not(:disabled) { background: #155230; }
    #aap-start:disabled { background: #aaa; cursor: not-allowed; }
    #aap-stop {
      background: #e8f5e9; color: #1e6b3e; border: 1.5px solid #1e6b3e;
      border-radius: 8px; padding: 7px 0; cursor: pointer; font-size: 13px; font-weight: 700;
    }
    #aap-stop:hover:not(:disabled) { background: #c8e6c9; }
    #aap-stop:disabled { opacity: .4; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(panel);

  const $status = () => document.getElementById('aap-status');
  const $count  = () => document.getElementById('aap-count');
  const $start  = () => document.getElementById('aap-start');
  const $stop   = () => document.getElementById('aap-stop');

  let running = false;
  let doneCount = 0;
  let skipCount = 0;

  // ── 工具：依文字尋找可見的按鈕 / 連結 / 元素 ────────────
  function findByText(texts, root) {
    const container = root || document;
    const sel = 'button, a, [role="button"], [class*="btn"], input[type="submit"], span[onclick], div[onclick]';
    const all = Array.from(container.querySelectorAll(sel));
    for (const text of texts) {
      const lower = text.toLowerCase();
      const found = all.find(el =>
        el.offsetParent !== null &&          // 可見
        !el.disabled &&
        el.textContent.trim().replace(/\s+/g, '').includes(text.replace(/\s+/g, ''))
      );
      if (found) return found;
    }
    return null;
  }

  // ── 工具：等待某元素出現 ─────────────────────────────────
  function waitFor(fn, timeout) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const id = setInterval(() => {
        if (!running) { clearInterval(id); reject(new Error('stopped')); return; }
        const el = fn();
        if (el) { clearInterval(id); resolve(el); return; }
        if (Date.now() - start > (timeout || 5000)) {
          clearInterval(id);
          reject(new Error('timeout'));
        }
      }, 200);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── 核心：處理單筆訂單（3 步驟流程）────────────────────
  async function processOneOrder() {
    // Step 1：找「查看並接單」按鈕
    const viewBtn = findByText(['查看並接單', '查看接單', '接單']);
    if (!viewBtn) return false;   // 沒有待處理訂單

    $status().textContent = '點擊「查看並接單」…';
    viewBtn.click();
    await sleep(STEP_DELAY);

    // Step 2：等待 modal/dialog 出現，找「確認接單」
    let confirmBtn;
    try {
      confirmBtn = await waitFor(() =>
        findByText(['確認接單', '確認', '接單確認'])
      , 5000);
    } catch {
      // modal 沒出現，嘗試按 ESC 關閉任何殘留 overlay
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(500);
      return true; // 算作嘗試過，繼續下一筆
    }

    $status().textContent = '點擊「確認接單」…';
    confirmBtn.click();
    await sleep(STEP_DELAY);

    // Step 3：找「接受訂單」（或「確認」最終按鈕）
    let acceptBtn;
    try {
      acceptBtn = await waitFor(() =>
        findByText(['接受訂單', '確認接受', '接受'])
      , 5000);
    } catch {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(500);
      return true;
    }

    $status().textContent = '點擊「接受訂單」…';
    acceptBtn.click();
    await sleep(SCAN_DELAY);

    return true;
  }

  // ── 主流程：批次接所有訂單 ───────────────────────────────
  async function runAll() {
    running = true;
    doneCount = 0;
    skipCount = 0;
    $start().disabled = true;
    $stop().disabled = false;
    $count().textContent = '';

    let consecutive_miss = 0;
    const MAX_MISS = 3;

    while (running) {
      try {
        const processed = await processOneOrder();
        if (processed) {
          consecutive_miss = 0;
          doneCount++;
          $count().textContent = `已接單：${doneCount} 筆`;
        } else {
          consecutive_miss++;
          if (consecutive_miss >= MAX_MISS) break;
          await sleep(SCAN_DELAY);
        }
      } catch (e) {
        if (e.message === 'stopped') break;
        skipCount++;
        await sleep(SCAN_DELAY);
      }
    }

    running = false;
    $start().disabled = false;
    $stop().disabled = true;
    if (doneCount > 0) {
      $status().textContent = `✅ 完成！共接 ${doneCount} 筆`;
    } else {
      $status().textContent = '沒有待接訂單';
    }
  }

  $start().addEventListener('click', () => { if (!running) runAll(); });
  $stop().addEventListener('click',  () => { running = false; $status().textContent = '已手動停止'; });

})();
