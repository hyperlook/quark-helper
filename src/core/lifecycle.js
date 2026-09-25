import { hijackAndStyleButtons } from './interceptor.js';
import { syncFromDOMTable } from '../services/cache.js';

// ==========================================
// DOM 动态监听：持续就地接管与元数据感知
// ==========================================

export function startObserver() {
  hijackAndStyleButtons();
  syncFromDOMTable();

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      hijackAndStyleButtons();
      syncFromDOMTable();
    }, 150);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

export function initLifecycle() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
}
