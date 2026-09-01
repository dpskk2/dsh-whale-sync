/**
 * dsh-whale-sync —— DeepSeek Harness 一键同步插件(开源版主入口)
 *
 * 安装(一行命令):
 *   dsh plugin --profile web add dsh-whale-sync
 * 装完重启 dsh,页面左下角出现「⟳ 同步」按钮,点一下即完成全量同步。
 * 鲸鱼娘余额挂件(dsh-whale-widget)作为依赖自动一并装好。
 *
 * 配置:读 DSH home 下的 dsh-sync.json(remote 为 GitHub 私有仓库地址);
 *       mode=manual(默认,纯手动)/ auto(自动同步);改动配置即时生效。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SyncEngine, DEFAULT_CONFIG } from './sync.js';

const name = 'whale-sync';
const inject = ['webServer'];

/** 推断 DSH home:环境变量 → 用户主目录下的 .dsh */
function resolveHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME;
  return path.join(os.homedir(), '.dsh');
}

function readConfigFile(home) {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, 'dsh-sync.json'), 'utf8')) || {};
  } catch {
    return {};
  }
}

function makeLogger(ctx) {
  return (level, msg) => {
    const line = `[whale-sync] ${msg}`;
    try {
      const l = ctx.logger;
      if (typeof l === 'function') { l(line); return; }
      if (l && typeof l[level] === 'function') { l[level](line); return; }
    } catch { /* 落到 console */ }
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
}

/** 把一次同步结果压成一句话 */
function summarize(r) {
  const parts = [];
  if (r.committed) parts.push('已提交本地快照');
  if (r.pulled === 'ff') parts.push('已拉取远端新数据');
  if (r.pulled === 'merge') parts.push(r.unrelated ? '已并入远端历史' : '已合并双方数据');
  if (r.pulled === 'reset') parts.push('已整体取回远端');
  if (r.pushed) parts.push('已推送到远端');
  if (r.conflicts && r.conflicts.length) parts.push(r.conflicts.length + ' 个冲突保留本机');
  if (r.backupBranch) parts.push('远端备份: ' + r.backupBranch);
  if (r.skipped) parts.push('跳过(' + r.skipped + ')');
  if (r.error) parts.push('错误: ' + r.error);
  if (!parts.length) parts.push('已是最新,无需变更');
  return parts.join(';');
}

/** 页面按钮脚本(左下角悬浮;注意:内部只用单引号,不含模板串) */
const BUTTON_JS = `(function () {
  if (window.__DSH_SYNC_BUTTON__) return
  window.__DSH_SYNC_BUTTON__ = true
  var style = document.createElement('style')
  style.textContent = '#dsh-sync-btn{position:fixed;left:16px;bottom:60px;z-index:2147483000;padding:7px 14px;border-radius:16px;background:rgba(28,28,32,.85);color:#e8e8ec;border:1px solid rgba(255,255,255,.16);font-size:12px;line-height:1;cursor:pointer;backdrop-filter:blur(6px);box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:inherit}#dsh-sync-btn:hover{background:rgba(46,46,52,.95)}#dsh-sync-btn:disabled{opacity:.6;cursor:default}#dsh-sync-toast{position:fixed;left:16px;bottom:110px;z-index:2147483000;max-width:340px;padding:8px 12px;border-radius:10px;background:rgba(28,28,32,.94);color:#e8e8ec;border:1px solid rgba(255,255,255,.16);font-size:12px;line-height:1.55;backdrop-filter:blur(6px);box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s;font-family:inherit;white-space:pre-wrap}#dsh-sync-toast.show{opacity:1;transform:none}'
  document.head.appendChild(style)
  var btn = document.createElement('button')
  btn.id = 'dsh-sync-btn'
  btn.textContent = '⟳ 同步'
  btn.title = '同步会话/设置/密钥到远端(一键全量:提交 + 推送 + 拉取)'
  var toastEl = null
  var toastTimer = null
  function toast(msg, ok) {
    if (!toastEl) {
      toastEl = document.createElement('div')
      toastEl.id = 'dsh-sync-toast'
      document.body.appendChild(toastEl)
    }
    toastEl.textContent = msg
    toastEl.style.color = ok ? '#b8f5c8' : '#f5b8b8'
    toastEl.classList.add('show')
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toastEl.classList.remove('show') }, 6000)
  }
  btn.onclick = function () {
    btn.disabled = true
    btn.textContent = '⟳ 同步中…'
    fetch('/dsh-sync/api/run', { method: 'POST' })
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data && data.ok) toast('✓ ' + (data.summary || '同步完成'), true)
        else toast('✗ ' + ((data && (data.error || data.summary)) || '同步失败'), false)
      })
      .catch(function (err) { toast('✗ 同步失败: ' + ((err && err.message) || err), false) })
      .finally(function () { btn.disabled = false; btn.textContent = '⟳ 同步' })
  }
  document.body.appendChild(btn)
})()`;

function apply(ctx, config = {}) {
  const home = config.home || resolveHome();
  const fileCfg = readConfigFile(home);
  const overrides = { ...config };
  delete overrides.home;
  const cfg = { ...DEFAULT_CONFIG, ...fileCfg, ...overrides };
  const log = makeLogger(ctx);

  const engine = new SyncEngine(home, overrides, log);
  const disposers = [];
  const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const json = (res, code, payload) => {
    res.writeHead(code, jsonHeaders);
    res.end(JSON.stringify(payload));
  };

  // —— 页面按钮:API 路由 + 注入脚本(小鲸鱼同款机制)——
  try {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-sync/api/run',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        try {
          const r = await engine.syncOnce('web-button');
          json(res, 200, { ok: !r.error, summary: summarize(r), detail: r });
        } catch (e) {
          json(res, 200, { ok: false, error: String((e && e.message) || e) });
        }
      },
    }));
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-sync/api/status',
      handler: (req, res) => {
        const c = engine.loadConfig();
        json(res, 200, { ok: true, remote: c.remote || '', branch: c.branch, gitMissing: engine.gitMissing });
      },
    }));
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-sync/button.js',
      handler: (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(BUTTON_JS);
      },
    }));
    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf('/dsh-sync/button.js') !== -1) return html;
      const tag = '<script defer src="/dsh-sync/button.js"></script>';
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>');
      return html + tag;
    }));
  } catch (err) {
    log('warn', 'webServer 不可用,页面按钮未注册(命令行同步仍可用): ' + String((err && err.message) || err));
  }

  // —— 自动模式才有的定时/事件钩子 ——
  const autoWanted = cfg.mode === 'auto' && cfg.enabled !== false;
  if (autoWanted) {
    if (cfg.autoPullOnStart !== false) {
      engine.syncOnce('startup').catch((e) => log('warn', `启动同步失败: ${e?.message || e}`));
    }
    const intervalMs = Math.max(30, Number(cfg.intervalSeconds) || 300) * 1000;
    const timer = setInterval(() => {
      engine.syncOnce('interval').catch((e) => log('warn', `定时同步失败: ${e?.message || e}`));
    }, intervalMs);
    timer.unref?.();
    let debounceTimer = null;
    try {
      disposers.push(ctx.on('session/event', () => {
        if (debounceTimer) return;
        const delayMs = Math.max(5, Number(cfg.eventDebounceSeconds) || 15) * 1000;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          engine.syncOnce('activity').catch((e) => log('warn', '活动同步失败: ' + (e?.message || e)));
        }, delayMs);
        debounceTimer.unref?.();
      }));
    } catch {
      log('info', 'ctx.on(session/event) 不可用,仅按周期同步');
    }
    ctx.effect(() => () => {
      clearInterval(timer);
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const d of disposers) {
        try { d(); } catch { /* ignore */ }
      }
      if (cfg.autoPushOnExit !== false) {
        try {
          engine.flushSync();
          log('info', '退出冲刷完成');
        } catch (e) {
          log('warn', `退出冲刷失败: ${e?.message || e}`);
        }
      }
    });
  } else {
    // 手动模式:退出时把 disposers 清掉即可
    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d(); } catch { /* ignore */ }
      }
    });
  }

  if (!cfg.remote) {
    log('info', `未配置 remote —— 同步只做本地快照提交。编辑 ${path.join(home, 'dsh-sync.json')} 填入 GitHub 私有仓库地址后启用云同步`);
  }
  log('info', `whale-sync 已启动(mode=${cfg.mode || 'manual'}, home=${home}, 分支=${cfg.branch}, remote=${cfg.remote || '(未配置,仅本地快照)'}, 页面按钮=左下角「⟳ 同步」)`);
}

export { name, inject, apply };
