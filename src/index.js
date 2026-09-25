import { SCRIPT_NAME, SCRIPT_VERSION } from './config.js';
import { injectStyles } from './ui/styles.js';
import { initNetworkHooks } from './services/cache.js';
import { setupGlobalInterceptors } from './core/interceptor.js';
import { initLifecycle } from './core/lifecycle.js';

function main() {
  injectStyles();
  initNetworkHooks();
  setupGlobalInterceptors();
  initLifecycle();

  console.log(`[${SCRIPT_NAME}] v${SCRIPT_VERSION} 就绪：React Fiber 级绝对精准提取与全场景零死角拦截。`);
}

main();
