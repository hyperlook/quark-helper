import { SCRIPT_NAME } from '../config.js';
import { showToast, formatBytes } from '../ui/toast.js';

// ==========================================
// 直下调度：只在可观测信号或明确降级后反馈
// ==========================================

export const OBSERVE_TIMEOUT_MS = 12000;
const IFRAME_TTL_MS = 120000;
const channelAttempts = new Map();

export function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return 'download_file';
  // 去除 Windows / Linux / macOS 禁止的路径保留字符
  let clean = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  // 避免以点开头或过长
  clean = clean.replace(/^\.+/, '');
  if (clean.length > 200) {
    const extMatch = clean.match(/(\.[a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    clean = clean.slice(0, 190) + ext;
  }
  return clean || 'download_file';
}

/**
 * 跨环境复制到系统剪贴板。只有调用方明确成功时才返回 true。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  if (typeof GM_setClipboard === 'function') {
    try {
      GM_setClipboard(text, 'text');
      return true;
    } catch (_) {}
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }

  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) return true;
    } catch (_) {}
  }

  return false;
}

function parseHeaders(raw) {
  const headers = Object.create(null);
  for (const line of String(raw || '').split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key || headers[key] != null) continue;
    headers[key] = value;
  }
  return headers;
}

function isAttachmentDisposition(value) {
  const type = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return type === 'attachment';
}

/**
 * 只根据状态码和响应头判定，不读取正文。
 * @returns {{ ok: boolean, definite: boolean, status?: number, error?: string }}
 */
export function classifyProbeHeaders(status, responseHeaders) {
  const code = Number(status) || 0;
  // 404/410 对任何客户端都是死链。其余 4xx/5xx 可能只是预检客户端被拒，不能拿来拦住 iframe。
  if (code === 404 || code === 410) {
    return {
      ok: false,
      definite: true,
      error: `CDN 响应状态异常 (HTTP ${code})`,
    };
  }
  if (code !== 200 && code !== 206) {
    return inconclusiveProbe(code ? `CDN 响应状态异常 (HTTP ${code})` : '未收到 CDN 状态码');
  }

  const raw = typeof responseHeaders === 'string' ? responseHeaders.trim() : '';
  if (!raw) return inconclusiveProbe('CDN 预检没有读到响应头');

  const headers = parseHeaders(raw);
  const disposition = headers['content-disposition'] || '';
  const contentType = (headers['content-type'] || '').toLowerCase();
  if (!isAttachmentDisposition(disposition)) {
    const isHtml = contentType.includes('text/html');
    return {
      ok: false,
      definite: true,
      error: isHtml ? 'CDN 返回网页或鉴权拦截页而非下载流' : 'CDN 响应不是附件下载',
    };
  }

  return { ok: true, definite: true, status: code };
}

function inconclusiveProbe(error) {
  return { ok: false, definite: false, error };
}

/**
 * 只读响应头的直链预检。忽略 Range 时会在首个进度包中止，避免把整文件缓冲进油猴。
 * 不发送页面 Cookie，也不伪装客户端 UA：这和 iframe 导航不是同一次请求。
 * @param {string} url
 */
export function probeDownloadUrl(url) {
  if (!url || typeof GM_xmlhttpRequest !== 'function') {
    return Promise.resolve(inconclusiveProbe('当前环境无法预检直链'));
  }

  return new Promise((resolve) => {
    let settled = false;
    let handle = null;
    const abort = () => {
      try {
        handle?.abort?.();
      } catch (_) {}
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      abort();
      resolve(result);
    };
    const consider = (res, final = false) => {
      if (settled || !res?.status || res.status < 200) return;
      if (res.status >= 300 && res.status < 400) return;
      const headers = res.responseHeaders;
      const headerReady = typeof headers === 'string' && headers.trim().length > 0;
      if ((res.status === 200 || res.status === 206) && !headerReady && !final) return;
      finish(classifyProbeHeaders(res.status, headers));
    };

    try {
      handle = GM_xmlhttpRequest({
        method: 'GET',
        url,
        anonymous: true,
        headers: {
          Range: 'bytes=0-0',
          Accept: '*/*',
          Referer: 'https://pan.quark.cn/',
        },
        timeout: 8000,
        onreadystatechange: (res) => {
          if (!res || res.readyState < 2) return;
          consider(res, res.readyState === 4);
        },
        onprogress: (res) => {
          if (settled) return;
          if (res?.status >= 200 && res.status < 300) consider(res, false);
          if (settled) return;
          if (res?.loaded > 1) {
            finish(inconclusiveProbe('CDN 预检未能在响应头阶段结束'));
          }
        },
        onload: (res) => consider(res, true),
        onerror: () => finish(inconclusiveProbe('CDN 预检网络错误')),
        ontimeout: () => finish(inconclusiveProbe('CDN 预检超时')),
      });
      if (settled) abort();
    } catch (err) {
      finish(inconclusiveProbe(err?.message || 'CDN 预检失败'));
    }
  });
}

function batchPrefix(batchInfo = {}) {
  const total = Number(batchInfo.total) || 1;
  const index = Number(batchInfo.index) || 0;
  return total > 1 ? `[${index + 1}/${total}] ` : '';
}

function clipboardClause(copied) {
  return copied ? '直链已复制。' : '剪贴板未写入，请用下方按钮复制直链。';
}

export function describeNativeFallback({
  copied,
  multi = false,
  probeError = '',
  mountError = '',
} = {}) {
  const parts = [clipboardClause(copied)];
  if (mountError) {
    parts.push(`浏览器未能接手下载，请用直链手动保存。`);
  } else {
    if (multi) {
      parts.push('批量下载时浏览器可能拦截部分文件，如未弹出保存请用直链手动下载。');
    } else {
      parts.push('如未弹出保存，请用直链手动下载。');
    }
  }
  return parts.join('');
}

function copyAction(url) {
  return {
    label: '复制直链',
    onClick: async (btn) => {
      const ok = await copyToClipboard(url);
      if (btn) btn.textContent = ok ? '已复制' : '复制失败';
    },
  };
}

function retryAction(url, fileName, size, batchInfo, toastId) {
  return {
    label: '重试',
    onClick: () => {
      triggerDownload(url, fileName, size, batchInfo, toastId);
    },
  };
}

function downloadActions(url, fileName, size, batchInfo, toastId) {
  return [copyAction(url), retryAction(url, fileName, size, batchInfo, toastId)];
}

function armTimer(fn, ms) {
  const timer = setTimeout(fn, ms);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

function canUseBrowserDownload() {
  return (
    typeof GM_info !== 'undefined' &&
    GM_info?.downloadMode === 'browser' &&
    typeof GM_download === 'function'
  );
}

function downloadErrorMessage(err) {
  if (!err) return '下载异常中断';
  if (typeof err === 'string') return err;
  return err.error || err.details || '下载异常中断';
}

/**
 * 隐藏 iframe 只负责尝试把 URL 交给浏览器。
 * 跨域附件的 load/error 不能区分「已接手」和「被拦截」，因此这里不监听、不据此报成败。
 */
export function attemptHiddenFrame(url) {
  if (typeof document === 'undefined' || !document.body) {
    return { ok: false, error: '当前页面无法挂载下载框架' };
  }

  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;opacity:0.01;pointer-events:none;border:none;';
    iframe.src = url;
    document.body.appendChild(iframe);
    armTimer(() => {
      try {
        iframe.remove();
      } catch (_) {}
    }, IFRAME_TTL_MS);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || '框架挂载失败' };
  }
}

function showBlockedToast({ id, prefix, fileName, displaySize, copied, error, actions }) {
  showToast({
    id,
    type: 'error',
    title: `${prefix}直链校验未通过`,
    message: `${fileName}${displaySize}: ${error}`,
    sub: `${clipboardClause(copied)}响应不是可下载附件，未发起保存。`,
    duration: 0,
    actions,
  });
}

function showNativeFallbackToast({
  id,
  prefix,
  fileName,
  displaySize,
  copied,
  multi,
  probeError,
  mountError,
  actions,
  url,
}) {
  const mountFailed = Boolean(mountError);
  showToast({
    id,
    type: mountFailed ? 'error' : 'success',
    title: `${prefix}${mountFailed ? '下载失败' : '已开始下载'}`,
    message: `${fileName}${displaySize}`,
    sub: describeNativeFallback({ copied, multi, probeError, mountError }),
    duration: mountFailed ? 0 : 5000,
    actions: mountFailed ? actions : (copied ? undefined : [copyAction(url)]),
  });
}

function startBrowserDownload(ctx) {
  let observed = false;
  const watchdog = armTimer(() => {
    if (!ctx.isCurrent() || observed) return;
    showToast({
      id: ctx.id,
      type: 'error',
      title: `${ctx.prefix}未观察到下载接手`,
      message: `${ctx.fileName}${ctx.displaySize}`,
      sub: `${clipboardClause(ctx.copied)}浏览器下载接口没有回报进度或下载编号。`,
      duration: 0,
      actions: ctx.actions,
    });
  }, OBSERVE_TIMEOUT_MS);

  const settle = () => {
    observed = true;
    clearTimeout(watchdog);
  };

  try {
    const handle = GM_download({
      url: ctx.url,
      name: ctx.safeName,
      saveAs: false,
      onprogress: () => {
        if (!ctx.isCurrent() || observed) return;
        settle();
        showToast({
          id: ctx.id,
          type: 'success',
          title: `${ctx.prefix}已开始下载`,
          message: `${ctx.safeName}${ctx.displaySize}`,
          sub: `浏览器下载引擎已接手。${clipboardClause(ctx.copied)}`,
          duration: ctx.copied ? 5000 : 0,
          actions: ctx.copied ? undefined : [copyAction(ctx.url)],
        });
      },
      onload: () => {
        if (!ctx.isCurrent()) return;
        settle();
        console.log(`[${SCRIPT_NAME}] GM_download 完成:`, ctx.safeName);
        showToast({
          id: ctx.id,
          type: 'success',
          title: `${ctx.prefix}下载完成`,
          message: `${ctx.safeName} 已由浏览器保存`,
          sub: '保存位置由浏览器下载目录决定，脚本未指定子目录。',
          duration: 4000,
        });
      },
      onerror: (err) => {
        if (!ctx.isCurrent()) return;
        settle();
        const errMsg = downloadErrorMessage(err);
        console.warn(`[${SCRIPT_NAME}] GM_download 错误:`, err);
        showToast({
          id: ctx.id,
          type: 'error',
          title: `${ctx.prefix}下载失败`,
          message: `${ctx.safeName}: ${errMsg}`,
          sub: `${clipboardClause(ctx.copied)}可改用直链自行保存。`,
          duration: 0,
          actions: ctx.actions,
        });
      },
      ontimeout: () => {
        if (!ctx.isCurrent()) return;
        settle();
        showToast({
          id: ctx.id,
          type: 'error',
          title: `${ctx.prefix}下载失败`,
          message: `${ctx.safeName}: 下载超时`,
          sub: `${clipboardClause(ctx.copied)}可改用直链自行保存。`,
          duration: 0,
          actions: ctx.actions,
        });
      },
    });
    if (handle && typeof handle.abort === 'function') {
      ctx.rememberHandle(handle);
    }
    return true;
  } catch (err) {
    clearTimeout(watchdog);
    console.warn(`[${SCRIPT_NAME}] 调用 GM_download 异常，降级为未确认通道:`, err);
    return false;
  }
}

/**
 * @param {string} url
 * @param {string} fileName
 * @param {number} size
 * @param {{ index?: number, total?: number }} batchInfo
 * @param {string} toastId 重试时复用同一张卡片
 * @returns {Promise<boolean>} false 表示在发起保存前已被明确阻断
 */
export async function triggerDownload(url, fileName, size = 0, batchInfo = { index: 0, total: 1 }, toastId = '') {
  const id = toastId || `qdh-dl-${Math.random().toString(36).slice(2, 9)}`;
  const attempt = (channelAttempts.get(id) || 0) + 1;
  channelAttempts.set(id, attempt);
  const isCurrent = () => channelAttempts.get(id) === attempt;
  const displayName = fileName || '未命名文件';
  const displaySize = size > 0 ? ` (${formatBytes(size)})` : '';
  const prefix = batchPrefix(batchInfo);
  const multi = (Number(batchInfo?.total) || 1) > 1;
  const actions = downloadActions(url, displayName, size, batchInfo, id);

  const previous = channelAttempts.get(`${id}:handle`);
  if (previous && typeof previous.abort === 'function') {
    try {
      previous.abort();
    } catch (_) {}
  }

  console.log(`[${SCRIPT_NAME}] 开始调度下载:`, displayName);

  if (!url) {
    showToast({
      id,
      type: 'error',
      title: `${prefix}没有可用直链`,
      message: displayName,
      duration: 0,
    });
    return false;
  }

  const copied = await copyToClipboard(url);
  if (!isCurrent()) return false;

  showToast({
    id,
    type: 'loading',
    title: `${prefix}正在校验直链`,
    message: `${displayName}${displaySize}`,
    sub: copied ? '直链已复制，正在核对是否为附件。' : '剪贴板未写入。正在核对是否为附件。',
    duration: 0,
  });

  const probe = await probeDownloadUrl(url);
  if (!isCurrent()) return false;

  if (probe.definite && !probe.ok) {
    showBlockedToast({
      id,
      prefix,
      fileName: displayName,
      displaySize,
      copied,
      error: probe.error,
      actions,
    });
    return false;
  }

  if (canUseBrowserDownload()) {
    const safeName = sanitizeFileName(displayName);
    const handed = startBrowserDownload({
      id,
      url,
      fileName: displayName,
      safeName,
      displaySize,
      prefix,
      copied,
      actions,
      isCurrent,
      rememberHandle: (handle) => channelAttempts.set(`${id}:handle`, handle),
    });
    if (handed) return true;
  }

  const frame = attemptHiddenFrame(url);
  showNativeFallbackToast({
    id,
    prefix,
    fileName: displayName,
    displaySize,
    copied,
    multi,
    probeError: probe.ok ? '' : probe.error || '',
    mountError: frame.ok ? '' : frame.error,
    actions,
    url,
  });
  return frame.ok;
}
