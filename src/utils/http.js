import { CLIENT_UA } from '../config.js';

// ==========================================
// 特权跨域网络请求包装器 (GM_xmlhttpRequest)
// ==========================================
export function gmRequest(options) {
  return new Promise((resolve, reject) => {
    const currentCookie = typeof document !== 'undefined' ? document.cookie : '';

    if (typeof GM_xmlhttpRequest === 'function') {
      const headers = {
        'User-Agent': CLIENT_UA,
        Referer: 'https://pan.quark.cn/',
        Origin: 'https://pan.quark.cn',
        Accept: 'application/json, text/plain, */*',
        ...options.headers,
      };

      if (currentCookie && !headers.Cookie && !headers.cookie) {
        headers.Cookie = currentCookie;
      }

      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: options.url,
        headers,
        data: options.data,
        responseType: options.responseType || undefined,
        anonymous: false,
        timeout: options.timeout || 25000,
        onload: (res) => resolve(res),
        onerror: (err) => reject(new Error(err?.statusText || '网络请求异常')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    } else {
      const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        ...options.headers,
      };

      fetch(options.url, {
        method: options.method || 'GET',
        headers,
        credentials: 'include',
        body: options.data,
      })
        .then(async (res) => {
          const text = await res.text();
          const responseHeaders = Array.from(res.headers.entries())
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n');
          resolve({ status: res.status, statusText: res.statusText, responseHeaders, responseText: text });
        })
        .catch(reject);
    }
  });
}
