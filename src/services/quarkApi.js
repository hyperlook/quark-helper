import { SCRIPT_NAME, API_BASE } from '../config.js';
import { gmRequest } from '../utils/http.js';
import {
  getReactFiber,
  extractRecordFromFiber,
  extractShareContextFromFiber,
} from '../utils/fiber.js';
import { cacheFiles, syncFromDOMTable } from './cache.js';
import { showToast } from '../ui/toast.js';
import { triggerDownload } from './downloader.js';

// ==========================================
// 动态获取当前目录 FID 与接口主动拉取兜底
// ==========================================

export function getCurrentPdirFid() {
  // 优先从表格中的第一行 React Fiber 读取实际的 pdir_fid
  const firstRow = document.querySelector('tr.ant-table-row');
  if (firstRow) {
    const rec = extractRecordFromFiber(getReactFiber(firstRow));
    if (rec && rec.pdir_fid !== undefined) {
      return rec.pdir_fid;
    }
  }

  const rawHash = location.hash || '';
  const cleanHash = decodeURIComponent(rawHash).split('?')[0];
  const segments = cleanHash.split('/').filter(Boolean);

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (['list', 'all', 'dir', 'search', 'share'].includes(seg)) {
      continue;
    }
    const fidMatch = seg.match(/^([a-zA-Z0-9]{16,64})/);
    if (fidMatch) {
      return fidMatch[1];
    }
  }

  return '0';
}

export async function syncCurrentFolderFiles() {
  // 1. 优先从当前 DOM Table 提取 (0 耗时)
  const domFiles = syncFromDOMTable();
  if (domFiles.length > 0) return domFiles;

  // 2. 如果处于分享页面
  if (location.pathname.includes('/s/')) {
    const shareCtx = extractShareContextFromFiber();
    if (shareCtx && shareCtx.fileList.length > 0) {
      cacheFiles(shareCtx.fileList);
      return shareCtx.fileList;
    }
  }

  // 3. API 请求兜底
  const pdirFid = getCurrentPdirFid();
  try {
    const res = await gmRequest({
      url: `${API_BASE}/file/sort?pr=ucpro&fr=pc&pdir_fid=${pdirFid}&_page=1&_size=100`,
      method: 'GET',
    });
    if (res.status === 200) {
      const json = JSON.parse(res.responseText);
      if (json?.data?.list) {
        cacheFiles(json.data.list);
        return json.data.list;
      }
    }
  } catch (err) {
    console.warn(`[${SCRIPT_NAME}] 网盘目录主动同步异常:`, err);
  }
  return [];
}

// ==========================================
// 夸克私有下载接口与直链获取 (PC 客户端私有通道)
// ==========================================

export async function requestDownloadUrl(fid) {
  const url = `${API_BASE}/file/download?pr=ucpro&fr=pc`;

  const candidatePayloads = [
    {
      fids: [fid],
      parse_mode: 'speedup_download',
      support_error_code: ['41060'],
    },
    {
      fids: [fid],
    },
  ];

  let lastError = null;

  for (let i = 0; i < candidatePayloads.length; i++) {
    const payload = candidatePayloads[i];
    try {
      console.log(`[${SCRIPT_NAME}] 请求直链通道 (${i + 1}/${candidatePayloads.length}):`, payload);
      const res = await gmRequest({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
        },
        data: JSON.stringify(payload),
      });

      let json = null;
      try {
        json = JSON.parse(res.responseText);
      } catch (_) {}

      if (res.status === 200 && json?.code === 0 && json?.data?.[0]?.download_url) {
        const item = json.data[0];
        return {
          downloadUrl: item.download_url,
          fileName: item.file_name,
          size: Number(item.size || 0),
        };
      }

      const msg = json?.message || json?.msg || `HTTP ${res.status}: ${res.responseText?.slice(0, 80)}`;
      lastError = new Error(msg);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('获取下载直链失败');
}

// ==========================================
// 分享页面直下处理
// 只有确认本人分享才走直链。他人分享和归属不明不发请求，说明由页面指示牌承担。
// ==========================================

export async function handleSharePageDownload(files) {
  if (!files || files.length === 0) return;

  const shareCtx = extractShareContextFromFiber();
  if (!shareCtx || shareCtx.isOwner !== true) return;

  showToast('检测为自有文件', '该分享属于您自己的网盘，免转存直接调取高速直链...');
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const linkInfo = await requestDownloadUrl(f.fid);
    await triggerDownload(
      linkInfo.downloadUrl,
      linkInfo.fileName || f.fileName,
      linkInfo.size || f.size,
      { index: i, total: files.length }
    );
    if (i < files.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}
