import { SCRIPT_NAME } from '../config.js';
import { getReactFiber, extractRecordFromFiber } from '../utils/fiber.js';
import { fileNameCache, normalizeFileInfo } from '../services/cache.js';
import { syncCurrentFolderFiles } from '../services/quarkApi.js';

// ==========================================
// 智能提取选中的文件 (React Fiber 级绝对精准提取 + 多级兜底)
// ==========================================

export function cleanFileNameText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/上传到同级目录/g, '')
    .replace(/上传到当前目录/g, '')
    .replace(/⚡\s*极速直下/g, '')
    .replace(/极速直下/g, '')
    .replace(/下载/g, '')
    .replace(/分享/g, '')
    .replace(/移动/g, '')
    .replace(/复制/g, '')
    .replace(/重命名/g, '')
    .replace(/删除/g, '')
    .trim();
}

export function findBestMatchFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const cleanText = cleanFileNameText(text);
  if (!cleanText) return null;

  // 1. 完全精确匹配
  if (fileNameCache.has(cleanText)) {
    return fileNameCache.get(cleanText);
  }

  // 2. 去除前后空格/常见标点后的精确匹配
  const trimmed = cleanText.toLowerCase();
  for (const [name, info] of fileNameCache.entries()) {
    if (!name) continue;
    if (name.toLowerCase() === trimmed) {
      return info;
    }
  }

  // 3. 同扩展名同主名匹配 (拒绝文件夹短名对文件的误匹配)
  for (const [name, info] of fileNameCache.entries()) {
    if (!name || info.isDir) continue; // 坚决不使用文件夹模糊匹配
    if (trimmed.startsWith(name.toLowerCase()) || name.toLowerCase().startsWith(trimmed)) {
      return info;
    }
  }
  return null;
}

export async function getSelectedFiles(triggerElement = null) {
  // 确保当前页面元数据被索引
  await syncCurrentFolderFiles();

  const selectedFiles = [];

  // ── 优先扫描所有被显式选中的表格行 (tr.ant-table-row.ant-table-row-selected) ──
  const selectedRowElements = document.querySelectorAll(
    'tr.ant-table-row.ant-table-row-selected, tr[class*="selected"], [class*="table-row"][class*="selected"]'
  );

  for (const row of selectedRowElements) {
    const rec = extractRecordFromFiber(getReactFiber(row));
    if (rec && (rec.fid || rec.file_name)) {
      const info = normalizeFileInfo(rec);
      if (!selectedFiles.some((f) => f.fid === info.fid)) {
        selectedFiles.push(info);
        continue;
      }
    }

    const nameEl = row.querySelector('.filename-text, div.filename, [class*="filename"]');
    const nameText = nameEl?.getAttribute('title') || nameEl?.innerText || '';
    const match = findBestMatchFromText(nameText);
    if (match && !selectedFiles.some((f) => f.fid === match.fid)) {
      selectedFiles.push(match);
    }
  }

  // ── 其次扫描被勾选的复选框 (勾选态兜底) ──
  const checkedBoxes = document.querySelectorAll('input[type="checkbox"]:checked, .ant-checkbox-checked');
  for (const box of checkedBoxes) {
    if (box.closest('thead') || box.closest('[class*="header"]')) continue;
    const row = box.closest('tr.ant-table-row, tr, [class*="row"]');
    if (!row) continue;

    const rec = extractRecordFromFiber(getReactFiber(row));
    if (rec && (rec.fid || rec.file_name)) {
      const info = normalizeFileInfo(rec);
      if (!selectedFiles.some((f) => f.fid === info.fid)) {
        selectedFiles.push(info);
        continue;
      }
    }

    const nameEl = row.querySelector('.filename-text, div.filename, [class*="filename"]');
    const nameText = nameEl?.getAttribute('title') || nameEl?.innerText || '';
    const match = findBestMatchFromText(nameText);
    if (match && !selectedFiles.some((f) => f.fid === match.fid)) {
      selectedFiles.push(match);
    }
  }

  if (selectedFiles.length > 0) {
    console.log(`[${SCRIPT_NAME}] 从选中项精准识别到 ${selectedFiles.length} 项:`, selectedFiles.map((f) => f.fileName));
    return selectedFiles;
  }

  // ── 如果页面没有勾选多项，且是由单行特定操作触发（如点击行内下载按钮或单行右键菜单） ──
  if (triggerElement) {
    const row = triggerElement.closest('tr.ant-table-row, tr, [class*="file-item"], [class*="row"]');
    if (row) {
      const rec = extractRecordFromFiber(getReactFiber(row));
      if (rec && (rec.fid || rec.file_name)) {
        const info = normalizeFileInfo(rec);
        console.log(`[${SCRIPT_NAME}] 从单行触发节点精准锁定:`, info.fileName);
        return [info];
      }

      const titleEl = row.querySelector('.filename-text, [class*="filename"], [title]');
      const title = titleEl?.getAttribute('title') || titleEl?.innerText;
      const match = findBestMatchFromText(title);
      if (match) return [match];
    }
  }

  // ── 深层目录/单文件视图兜底：如果当前表格视口仅有 1 个文件且非文件夹，自动接管 (仅限非分享页) ──
  if (!location.pathname.includes('/s/')) {
    const currentRows = document.querySelectorAll('tr.ant-table-row');
    if (currentRows.length === 1) {
      const rec = extractRecordFromFiber(getReactFiber(currentRows[0]));
      if (rec && (rec.fid || rec.file_name)) {
        const info = normalizeFileInfo(rec);
        if (!info.isDir) {
          console.log(`[${SCRIPT_NAME}] 当前视图仅有 1 个单文件，自动精准匹配:`, info.fileName);
          return [info];
        }
      }
    }
  }

  return selectedFiles;
}
