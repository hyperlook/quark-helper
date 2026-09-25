// ==========================================
// UI 交互与多实例 Toast 提示组件
// ==========================================

export const MAX_TOASTS = 20;
const activeToasts = new Map();
const EVICT_RANK = { success: 0, info: 1, loading: 2, warning: 3, error: 4 };

const ICONS = {
  info: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm0-9a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM7.25 7a.75.75 0 0 1 1.5 0v4a.75.75 0 0 1-1.5 0V7z"/></svg>',
  success:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm3.22-8.78a.75.75 0 0 0-1.06-1.06L7 8.32 5.84 7.16a.75.75 0 0 0-1.06 1.06l1.7 1.7a.75.75 0 0 0 1.06 0l3.68-3.7z"/></svg>',
  error:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4A.75.75 0 0 1 8 4zm0 7.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z"/></svg>',
  warning:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7.14 2.27a1 1 0 0 1 1.72 0l5.85 10.12A1 1 0 0 1 13.85 14H2.15a1 1 0 0 1-.86-1.61L7.14 2.27zm.86 3.23a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-.75-.75zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"/></svg>',
  loading:
    '<svg class="qdh-toast-spin" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5.75.75 0 0 1 1.5 0A8 8 0 1 1 8 0a.75.75 0 0 1 0 1.5z"/></svg>',
  close:
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/></svg>',
};

function getOrCreateContainer() {
  if (typeof document === 'undefined') return null;
  let container = document.getElementById('qdh-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'qdh-toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function setTrustedIcon(el, svg) {
  // 仅写入本文件常量 SVG，用户文件名不得进入 innerHTML
  el.innerHTML = svg;
}

function fillTitle(titleEl, toastType, title) {
  titleEl.replaceChildren();
  const icon = document.createElement('span');
  icon.className = 'qdh-toast-icon';
  setTrustedIcon(icon, ICONS[toastType] || ICONS.info);
  const text = document.createElement('span');
  text.className = 'qdh-toast-title-text';
  text.textContent = title || '';
  titleEl.append(icon, text);
}

function buildActions(actions) {
  const wrap = document.createElement('div');
  wrap.className = 'qdh-toast-actions';
  for (const act of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qdh-toast-action-btn';
    btn.textContent = act.label || '';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (typeof act.onClick === 'function') act.onClick(btn);
    });
    wrap.append(btn);
  }
  return wrap;
}

function paint(el, opts, toastType, id, visible) {
  el.className = `qdh-toast-item qdh-toast-${toastType}${visible ? ' show' : ''}`;
  el.replaceChildren();

  const header = document.createElement('div');
  header.className = 'qdh-toast-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'qdh-toast-title';
  fillTitle(titleEl, toastType, opts.title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'qdh-toast-close';
  closeBtn.title = '关闭';
  setTrustedIcon(closeBtn, ICONS.close);
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    removeToast(id);
  });

  header.append(titleEl, closeBtn);

  const body = document.createElement('div');
  body.className = 'qdh-toast-body';
  body.textContent = opts.message || '';

  el.append(header, body);

  if (opts.sub) {
    const sub = document.createElement('div');
    sub.className = 'qdh-toast-sub';
    sub.textContent = opts.sub;
    el.append(sub);
  }

  if (opts.actions?.length) {
    el.append(buildActions(opts.actions));
  }
}

function evictIfNeeded() {
  if (activeToasts.size < MAX_TOASTS) return;
  let targetId = null;
  let targetRank = Infinity;
  for (const [id, item] of activeToasts) {
    const rank = EVICT_RANK[item.type] ?? 1;
    if (rank < targetRank) {
      targetRank = rank;
      targetId = id;
    }
  }
  if (targetId) removeToast(targetId);
}

export function removeToast(id) {
  const item = activeToasts.get(id);
  if (!item) return;

  if (item.timer) clearTimeout(item.timer);
  activeToasts.delete(id);

  if (item.el) {
    item.el.classList.remove('show');
    item.el.classList.add('hiding');
    setTimeout(() => {
      try {
        item.el.remove();
      } catch (_) {}
    }, 260);
  }
}

export function resetToasts() {
  for (const id of [...activeToasts.keys()]) removeToast(id);
  activeToasts.clear();
}

export function updateToast(id, opts) {
  return showToast({ id, ...opts });
}

export function showToast(titleOrOpts, message = '', sub = '', duration = 4500, type = '') {
  let opts = {};
  if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
    opts = { ...titleOrOpts };
  } else {
    const rawTitle = String(titleOrOpts || '');
    let resolvedType = type;
    if (!resolvedType) {
      if (rawTitle.includes('失败') || rawTitle.includes('异常') || rawTitle.includes('拦截')) {
        resolvedType = 'error';
      } else if (rawTitle.includes('成功') || rawTitle.includes('完成')) {
        resolvedType = 'success';
      } else if (rawTitle.includes('跳过') || rawTitle.includes('未检测')) {
        resolvedType = 'warning';
      } else {
        resolvedType = 'info';
      }
    }
    opts = {
      title: rawTitle,
      message,
      sub,
      duration,
      type: resolvedType,
    };
  }

  const container = getOrCreateContainer();
  if (!container) return '';

  const id = opts.id || `qdh-toast-${Math.random().toString(36).slice(2, 9)}`;
  const toastType = opts.type || 'info';
  const toastDuration = opts.duration !== undefined ? opts.duration : 4500;
  const existing = activeToasts.get(id);

  if (existing?.el) {
    if (existing.timer) {
      clearTimeout(existing.timer);
      existing.timer = null;
    }
    paint(existing.el, opts, toastType, id, true);
    existing.type = toastType;
    if (toastDuration > 0) {
      existing.timer = setTimeout(() => removeToast(id), toastDuration);
    }
    return id;
  }

  evictIfNeeded();

  const itemEl = document.createElement('div');
  itemEl.setAttribute('data-toast-id', id);
  paint(itemEl, opts, toastType, id, false);
  container.appendChild(itemEl);
  requestAnimationFrame(() => {
    itemEl.classList.add('show');
  });

  const entry = { el: itemEl, timer: null, type: toastType };
  if (toastDuration > 0) {
    entry.timer = setTimeout(() => removeToast(id), toastDuration);
  }
  activeToasts.set(id, entry);
  return id;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}
