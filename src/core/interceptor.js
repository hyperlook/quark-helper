import { SCRIPT_NAME } from '../config.js';
import { showToast } from '../ui/toast.js';
import { getSelectedFiles } from './parser.js';
import { handleSharePageDownload, requestDownloadUrl } from '../services/quarkApi.js';
import { triggerDownload } from '../services/downloader.js';
import { extractShareContextFromFiber } from '../utils/fiber.js';

// ==========================================
// 执行入口：批量直下
// ==========================================

export async function handleFastDownload(triggerElement = null) {
  showToast('匹配目标中...', '正在拉取文件元数据...');

  const files = await getSelectedFiles(triggerElement);

  if (!files || files.length === 0) {
    showToast('未检测到选中的文件', '请在列表中勾选需要下载的文件', '', 4000);
    return;
  }

  const regularFiles = files.filter((f) => !f.isDir);
  const dirCount = files.length - regularFiles.length;

  console.log(
    `[${SCRIPT_NAME}] 提取汇总 -> 全部项: ${files.length}, 普通文件: ${regularFiles.length}, 文件夹: ${dirCount}`
  );

  if (regularFiles.length === 0) {
    showToast('无法直接下载文件夹', '请进入文件夹内勾选文件进行极速直下', '', 4000);
    return;
  }

  if (dirCount > 0) {
    showToast('跳过文件夹', `已跳过 ${dirCount} 个文件夹，开始下载 ${regularFiles.length} 个文件`, '', 3000);
  }

  // 分享页面通道
  const isSharePage = location.pathname.includes('/s/');
  if (isSharePage) {
    try {
      await handleSharePageDownload(regularFiles);
    } catch (err) {
      showToast('分享直下失败', err.message, '建议检查账号登录状态', 6000);
    }
    return;
  }

  // 个人网盘直下通道
  showToast(
    '正在请求高速 CDN',
    `正在为 ${regularFiles.length} 个文件获取高速直链...`,
    '已破除 100MB 限制与客户端强制绑定'
  );

  for (let i = 0; i < regularFiles.length; i++) {
    const file = regularFiles[i];
    try {
      const linkInfo = await requestDownloadUrl(file.fid);
      await triggerDownload(
        linkInfo.downloadUrl,
        linkInfo.fileName || file.fileName,
        linkInfo.size || file.size,
        { index: i, total: regularFiles.length }
      );
    } catch (err) {
      showToast({
        title: '直链解析失败',
        message: `[${file.fileName}]: ${err.message}`,
        type: 'error',
        duration: 6000,
      });
    }
    if (i < regularFiles.length - 1) {
      await new Promise((r) => setTimeout(r, 450));
    }
  }
}

// ==========================================
// 原位接管与 UI 增强 (零 DOM 破坏，无缝融合 React)
// ==========================================

export const SVG_BOLT =
  '<svg class="qdh-svg-bolt" viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8.5 1.5L2 9h5.5l-1 5.5L13.5 7H8l.5-5.5z"/></svg>';

const HINT_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM8 7a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 7zm0-1.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z"/></svg>';

function isSharePage() {
  return location.pathname.includes('/s/');
}

function shareHintCopy(isOwner) {
  if (isOwner === false) {
    return {
      mode: 'other',
      text: '他人分享不接管下载。保存进个人网盘后，再用极速直下。',
    };
  }
  return {
    mode: 'unknown',
    text: '未能确认归属，这里的下载仍由夸克处理。',
  };
}

function placeShareHint(host, hint) {
  const kids = Array.from(host.children || []);
  const info = kids.find((el) => el.classList?.contains('share-info-wrap'));
  const list = kids.find((el) => el.classList?.contains('file-list'));
  const before = info ? kids[kids.indexOf(info) + 1] : list;
  if (before && typeof host.insertBefore === 'function') {
    host.insertBefore(hint, before);
    return;
  }
  host.appendChild(hint);
}

function fillShareHint(hint, copy) {
  hint.setAttribute('data-qdh-share-mode', copy.mode);
  const icon = document.createElement('span');
  icon.className = 'qdh-share-hint-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = HINT_ICON;
  const text = document.createElement('span');
  text.className = 'qdh-share-hint-text';
  text.textContent = copy.text;
  if (typeof hint.replaceChildren === 'function') {
    hint.replaceChildren(icon, text);
  } else {
    hint.append(icon, text);
  }
}

// 分享页原生下载交还夸克。这里只挂一条不可点的说明，不改按钮、不拦点击。
function syncShareHint(isOwner) {
  const host =
    document.querySelector('.share-content') || document.querySelector('.share-detail-content');
  const ownerConfirmed =
    isOwner === true || Boolean(document.querySelector('.owner-tips, [class*="owner-tips"]'));
  const existing = document.querySelector('.qdh-share-hint');
  if (ownerConfirmed || !host) {
    existing?.remove();
    return;
  }
  const copy = shareHintCopy(isOwner);
  if (existing?.isConnected !== false && existing?.getAttribute('data-qdh-share-mode') === copy.mode) {
    return;
  }
  const hint = existing?.parentElement ? existing : document.createElement('div');
  hint.className = 'qdh-share-hint';
  hint.setAttribute('role', 'note');
  fillShareHint(hint, copy);
  if (!hint.parentElement) placeShareHint(host, hint);
}

function mountOwnerFastButton() {
  const shareOperWrap = document.querySelector('.share-operate .operate-wrap');
  if (!shareOperWrap || shareOperWrap.querySelector('.qdh-share-owner-btn')) return;
  if (!shareOperWrap.querySelector('.owner-tips')) return;
  const customBtn = document.createElement('button');
  customBtn.type = 'button';
  customBtn.className = 'ant-btn ant-btn-primary qdh-share-owner-btn qdh-hijacked-btn';
  customBtn.innerHTML = `<span>${SVG_BOLT}勾选后极速直下</span>`;
  customBtn.title = '请先勾选文件，再免转存直下';
  shareOperWrap.appendChild(customBtn);
}

function stylePersonalDownloadButtons() {
  // 1. 接管顶部操作栏下载按钮 (不破坏 React 节点结构)
  const normalBtns = document.querySelectorAll('button, .ant-btn, [role="button"]');
  for (const btn of normalBtns) {
    if (
      btn.classList.contains('share-download') ||
      btn.classList.contains('qdh-share-owner-btn') ||
      btn.closest('.share-download')
    ) {
      continue;
    }
    const text = (btn.innerText || btn.textContent || '').trim();
    if (
      (text === '下载' ||
        (text.startsWith('下载') && (text.includes('(') || text.includes('（') || text.length <= 8)) ||
        (btn.classList.contains('btn-file') && text.includes('下载'))) &&
      !text.includes('极速直下')
    ) {
      if (!btn.getAttribute('data-qdh-styled') || !btn.querySelector('.qdh-svg-bolt')) {
        btn.setAttribute('data-qdh-styled', 'true');
        btn.classList.add('qdh-hijacked-btn');
        btn.title = '夸克极速直下：解除 100MB 限制，免客户端直接静默下载至本地';

        const span = btn.querySelector('span') || btn;
        const countMatch = text.match(/[\(（](\d+)[\)）]/);
        const countSuffix = countMatch ? `(${countMatch[1]})` : '';
        span.innerHTML = `${SVG_BOLT}极速直下${countSuffix}`;
      }
    }
  }

  // 2. 接管行内悬浮下载按钮。分享页的图标不进这里，避免 position/尺寸把原生图标顶浮。
  const hoverBtns = document.querySelectorAll('.hover-oper-item.hoitem-down, [class*="hoitem-down"]');
  for (const hb of hoverBtns) {
    if (!hb.getAttribute('data-qdh-styled')) {
      hb.setAttribute('data-qdh-styled', 'true');
      hb.classList.add('qdh-hover-btn');
      hb.title = '夸克极速直下 (免客户端)';
    }
  }
}

export function hijackAndStyleButtons() {
  if (isSharePage()) {
    const isOwner = extractShareContextFromFiber()?.isOwner ?? null;
    syncShareHint(isOwner);
    mountOwnerFastButton();
    return;
  }
  stylePersonalDownloadButtons();
}

// ==========================================
// 全局捕获阶段拦截触发器 (全面覆盖操作栏、行内按钮、右键菜单)
// ==========================================

let lastContextMenuRow = null;

export function matchDownloadTrigger(target) {
  if (!target || typeof target.closest !== 'function') return null;

  // 本人分享的自有按钮才是动作。分享页其余下载入口交给夸克。
  const ownerBtn = target.closest('.qdh-share-owner-btn');
  if (ownerBtn) return { type: 'share_owner', trigger: ownerBtn };
  if (isSharePage()) return null;

  // 1. 行内悬浮下载按钮
  const hoverBtn = target.closest('.hover-oper-item.hoitem-down, [class*="hoitem-down"]');
  if (hoverBtn) {
    return { type: 'hover_row', trigger: hoverBtn, row: hoverBtn.closest('tr') };
  }

  // 2. 右键菜单“下载”项
  const menuItem = target.closest('.ant-dropdown-menu-item, [role="menuitem"]');
  if (menuItem) {
    const text = (menuItem.innerText || menuItem.textContent || '').trim();
    if (text.includes('下载') || text.includes('极速直下')) {
      return { type: 'context_menu', trigger: menuItem, row: lastContextMenuRow };
    }
  }

  // 3. 操作栏按钮
  const btn = target.closest('button, .ant-btn, [role="button"]');
  if (btn) {
    const text = (btn.innerText || btn.textContent || '').trim();
    if (
      text.includes('极速直下') ||
      text === '下载' ||
      (text.startsWith('下载') && (text.includes('(') || text.includes('（') || text.length <= 8)) ||
      (btn.classList.contains('btn-file') && text.includes('下载'))
    ) {
      return { type: 'toolbar', trigger: btn };
    }
  }

  return null;
}

export function setupGlobalInterceptors() {
  document.addEventListener(
    'contextmenu',
    (e) => {
      const row = e.target.closest('tr.ant-table-row, tr');
      if (row) {
        lastContextMenuRow = row;
      }
    },
    true
  );

  document.addEventListener(
    'click',
    function (e) {
      const match = matchDownloadTrigger(e.target);
      if (match) {
        console.log(`[${SCRIPT_NAME}] 全局捕获阶段成功拦截下载触发 (${match.type})，立即启动极速直下！`);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleFastDownload(match.row || match.trigger);
      }
    },
    true
  );
}
