import { SCRIPT_NAME, targetWin } from '../config.js';
import { extractTableDataSourceFromFiber } from '../utils/fiber.js';

// ==========================================
// 元数据感知池与主动同步
// ==========================================

export const fileCache = new Map(); // fid -> FileInfo
export const fileNameCache = new Map(); // fileName -> FileInfo

export function checkIsDir(item) {
  if (!item) return false;

  // 1. 服务端明确的目录/文件标识 (最权威)
  if (item.file_type !== undefined && item.file_type !== null) {
    if (String(item.file_type) === '0') return true;
    if (String(item.file_type) === '1') return false;
  }
  if (item.format_type === 'dir') return true;
  if (item.is_dir === true || item.is_dir === 1 || item.dir === true) return true;
  if (typeof item.file === 'boolean') return !item.file;

  // 2. 常见文件扩展名判别
  const name = item.file_name || item.name || item.fileName || '';
  if (/\.[a-zA-Z0-9]{1,10}$/.test(name)) {
    return false;
  }

  // 3. 如果包含非零字节大小，判定为文件
  if (Number(item.size || 0) > 0) {
    return false;
  }

  if (item.category === 0) return true;
  return false;
}

export function normalizeFileInfo(raw) {
  if (!raw) return null;
  const isDir = checkIsDir(raw);
  return {
    fid: raw.fid,
    fileName: raw.file_name || raw.name || raw.fileName || 'unknown_file',
    size: Number(raw.size || 0),
    isDir: isDir,
    raw: raw,
  };
}

export function cacheFiles(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  let count = 0;
  for (const item of list) {
    if (!item || !item.fid) continue;
    const info = normalizeFileInfo(item);
    fileCache.set(info.fid, info);
    fileNameCache.set(info.fileName, info);
    count++;
  }
  if (count > 0) {
    console.log(`[${SCRIPT_NAME}] 已索引 ${count} 个条目元数据 (当前缓存总数: ${fileCache.size})`);
  }
}

// 优先直接从页面渲染的 Ant Design Table Fiber 中瞬间同步数据
export function syncFromDOMTable() {
  const table = document.querySelector('.ant-table, table');
  if (table) {
    const data = extractTableDataSourceFromFiber(table);
    if (data && data.length > 0) {
      cacheFiles(data);
      return data;
    }
  }
  return [];
}

export function installFetchHook(win) {
  if (!win || !win.fetch || win.fetch.__qdh_hooked) return;
  const originalFetch = win.fetch;
  const hookedFetch = async function (...args) {
    const res = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (
        url.includes('/file/sort') ||
        url.includes('/file/list') ||
        url.includes('/file/search') ||
        url.includes('/share/sharepage/detail')
      ) {
        const clone = res.clone();
        clone.json().then((json) => {
          if (json?.data?.list) cacheFiles(json.data.list);
          else if (Array.isArray(json?.data)) cacheFiles(json.data);
        }).catch(() => {});
      }
    } catch (_) {}
    return res;
  };
  hookedFetch.__qdh_hooked = true;
  win.fetch = hookedFetch;
}

export function installXHRHook(win) {
  if (!win || !win.XMLHttpRequest || win.XMLHttpRequest.__qdh_hooked) return;
  const OriginalXHR = win.XMLHttpRequest;
  function HookedXHR() {
    const xhr = new OriginalXHR();
    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          const url = xhr.responseURL || '';
          if (
            url.includes('/file/sort') ||
            url.includes('/file/list') ||
            url.includes('/file/search') ||
            url.includes('/share/sharepage/detail')
          ) {
            const json = JSON.parse(xhr.responseText);
            if (json?.data?.list) cacheFiles(json.data.list);
            else if (Array.isArray(json?.data)) cacheFiles(json.data);
          }
        } catch (_) {}
      }
    });
    return xhr;
  }
  HookedXHR.prototype = OriginalXHR.prototype;
  HookedXHR.__qdh_hooked = true;
  win.XMLHttpRequest = HookedXHR;
}

export function initNetworkHooks() {
  installFetchHook(targetWin);
  installXHRHook(targetWin);
  if (targetWin !== window) {
    installFetchHook(window);
    installXHRHook(window);
  }
}
