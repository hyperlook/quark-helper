export const STYLES = `
  .qdh-svg-bolt {
    display: inline-block;
    vertical-align: -1.5px;
    margin-right: 4px;
    width: 13px;
    height: 13px;
    fill: currentColor;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }
  .qdh-hijacked-btn:hover .qdh-svg-bolt {
    transform: scale(1.15);
  }
  .qdh-hijacked-btn {
    cursor: pointer !important;
    user-select: none !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    background: #eefbf4 !important;
    border: 1px solid #8fe3b8 !important;
    color: #008a4f !important;
    font-weight: 500 !important;
    border-radius: 8px !important;
  }
  .qdh-hijacked-btn > span {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .qdh-hijacked-btn:hover {
    background: #e1f7ec !important;
    border-color: #00b96b !important;
    color: #00703e !important;
    box-shadow: 0 2px 8px rgba(0, 185, 107, 0.18) !important;
  }
  .qdh-hijacked-btn:active {
    background: #cbf2de !important;
    border-color: #009657 !important;
    transform: scale(0.98) !important;
  }

  /* 顶部操作栏按钮组原位接管与独立高亮 */
  .ant-btn-group > .qdh-hijacked-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    vertical-align: top !important;
    height: 36px !important;
    padding: 0 14px !important;
    font-size: 12px !important;
    line-height: 1 !important;
    margin-right: 8px !important;
    float: none !important;
    position: relative !important;
    z-index: 1 !important;
  }
  /* 统一接管后方兄弟按钮的垂直对齐，防止 inline-block baseline 塌陷 */
  .ant-btn-group > .qdh-hijacked-btn ~ .ant-btn {
    vertical-align: top !important;
  }
  /* 恢复接管按钮后方兄弟按钮的左侧圆角与独立边框 */
  .ant-btn-group > .qdh-hijacked-btn + .ant-btn {
    border-top-left-radius: 8px !important;
    border-bottom-left-radius: 8px !important;
    margin-left: 0 !important;
  }

  /* 行内悬浮下载按钮微动效 */
  .qdh-hover-btn {
    cursor: pointer !important;
    position: relative !important;
    transition: transform 0.15s ease !important;
  }
  .qdh-hover-btn:hover {
    transform: scale(1.15) !important;
    filter: drop-shadow(0 0 3px rgba(0, 185, 107, 0.5)) !important;
  }

  /* 分享页说明条：不是按钮，不参与点击，也不改原生下载图标的尺寸。 */
  .qdh-share-hint {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 4px 16px 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: #f4f6f8;
    color: #5c6570;
    font-size: 12px;
    line-height: 1.45;
    pointer-events: none;
    user-select: none;
    cursor: default;
  }
  .qdh-share-hint-icon {
    display: inline-flex;
    flex: none;
    margin-top: 1px;
    color: #8b95a1;
  }
  .qdh-share-hint-icon svg {
    display: block;
    width: 14px;
    height: 14px;
    fill: currentColor;
  }
  .qdh-share-hint-text {
    min-width: 0;
  }

  /* 分享页自定义直下按钮 */
  .qdh-share-owner-btn {
    margin-left: 16px !important;
    padding: 0 18px !important;
    height: 36px !important;
    border-radius: 18px !important;
  }

  #qdh-toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: min(440px, calc(100vw - 48px));
    max-height: min(70vh, 640px);
    overflow-y: auto;
    overscroll-behavior: contain;
    z-index: 9999999;
    display: flex;
    flex-direction: column-reverse;
    gap: 10px;
    pointer-events: auto;
  }
  .qdh-toast-item {
    pointer-events: auto;
    background: rgba(26, 32, 44, 0.96);
    backdrop-filter: blur(14px);
    color: #ffffff;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.38);
    font-size: 13px;
    line-height: 1.5;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    opacity: 0;
    transform: translateY(16px);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    border-left: 4px solid #00b96b;
  }
  .qdh-toast-item.show {
    opacity: 1;
    transform: translateY(0);
  }
  .qdh-toast-item.hiding {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  .qdh-toast-item.qdh-toast-info {
    border-left-color: #00b96b;
  }
  .qdh-toast-item.qdh-toast-success {
    border-left-color: #00b96b;
  }
  .qdh-toast-item.qdh-toast-warning {
    border-left-color: #faad14;
  }
  .qdh-toast-item.qdh-toast-error {
    border-left-color: #ff4d4f;
  }
  .qdh-toast-item.qdh-toast-loading {
    border-left-color: #1890ff;
  }

  .qdh-toast-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .qdh-toast-title {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    min-width: 0;
  }
  .qdh-toast-icon {
    display: inline-flex;
    flex: none;
  }
  .qdh-toast-title-text {
    min-width: 0;
    word-break: break-all;
  }
  .qdh-toast-info .qdh-toast-title,
  .qdh-toast-success .qdh-toast-title {
    color: #00e084;
  }
  .qdh-toast-warning .qdh-toast-title {
    color: #faad14;
  }
  .qdh-toast-error .qdh-toast-title {
    color: #ff4d4f;
  }
  .qdh-toast-loading .qdh-toast-title {
    color: #40a9ff;
  }

  .qdh-toast-close {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.15s ease;
  }
  .qdh-toast-close:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  .qdh-toast-body {
    color: #e2e8f0;
    word-break: break-all;
    font-size: 12px;
  }
  .qdh-toast-sub {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
  }
  .qdh-toast-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  .qdh-toast-action-btn {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .qdh-toast-action-btn:hover {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.35);
  }

  @keyframes qdh-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .qdh-toast-spin {
    animation: qdh-spin 1s linear infinite;
  }
`;

export function injectStyles() {
  if (typeof GM_addStyle !== 'undefined') {
    GM_addStyle(STYLES);
  } else {
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    (document.head || document.documentElement).appendChild(styleEl);
  }
}
