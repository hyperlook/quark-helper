import { afterEach, describe, expect, test } from 'bun:test';
import { collectText, iframes, installDom, toastItems } from './dom-stub.js';
import { resetToasts } from '../src/ui/toast.js';
import {
  OBSERVE_TIMEOUT_MS,
  classifyProbeHeaders,
  copyToClipboard,
  describeNativeFallback,
  probeDownloadUrl,
  sanitizeFileName,
  triggerDownload,
} from '../src/services/downloader.js';
import { formatBytes } from '../src/ui/toast.js';

const globals = ['GM_setClipboard', 'GM_xmlhttpRequest', 'GM_info', 'GM_download', 'navigator'];

afterEach(() => {
  resetToasts();
  for (const key of globals) delete globalThis[key];
});

function attachmentHeaders() {
  return 'Content-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="test.zip"';
}

function mockProbe(response, capture = {}) {
  globalThis.GM_xmlhttpRequest = (opts) => {
    capture.opts = opts;
    const handle = {
      aborted: false,
      abort() {
        handle.aborted = true;
        capture.aborted = true;
      },
    };
    if (response.onload) opts.onload(response.onload);
    if (response.readyState) opts.onreadystatechange?.(response.readyState);
    if (response.onerror) opts.onerror({});
    if (response.onprogress) opts.onprogress(response.onprogress);
    return handle;
  };
}

describe('formatBytes', () => {
  test('formats byte sizes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.50 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 1.2)).toBe('1.20 GB');
  });
});

describe('sanitizeFileName', () => {
  test('cleans illegal path characters', () => {
    expect(sanitizeFileName('file/with:invalid*chars?.txt')).toBe('file_with_invalid_chars_.txt');
  });

  test('trims leading dots', () => {
    expect(sanitizeFileName('...hidden.file')).toBe('hidden.file');
  });

  test('truncates overly long filenames while preserving extension', () => {
    const longName = 'a'.repeat(250) + '.mp4';
    const clean = sanitizeFileName(longName);
    expect(clean.length).toBeLessThanOrEqual(200);
    expect(clean.endsWith('.mp4')).toBe(true);
  });

  test('handles null or empty names', () => {
    expect(sanitizeFileName(null)).toBe('download_file');
    expect(sanitizeFileName('')).toBe('download_file');
  });
});

describe('copyToClipboard', () => {
  test('uses GM_setClipboard if available and reports success', async () => {
    let called = null;
    globalThis.GM_setClipboard = (...args) => {
      called = args;
    };
    const res = await copyToClipboard('https://example.com/file');
    expect(res).toBe(true);
    expect(called).toEqual(['https://example.com/file', 'text']);
  });

  test('returns false when every clipboard path fails', async () => {
    globalThis.GM_setClipboard = () => {
      throw new Error('Clipboard denied');
    };
    globalThis.navigator = { clipboard: { writeText: async () => { throw new Error('no'); } } };
    const res = await copyToClipboard('https://example.com/file');
    expect(res).toBe(false);
  });
});

describe('classifyProbeHeaders', () => {
  test('rejects a successful response that is not an attachment', () => {
    const result = classifyProbeHeaders(200, 'Content-Type: application/octet-stream');
    expect(result.ok).toBe(false);
    expect(result.definite).toBe(true);
    expect(result.error).toContain('不是附件');
  });

  test('does not treat the word attachment inside a filename as a download', () => {
    const result = classifyProbeHeaders(200, 'Content-Disposition: inline; filename="attachment.zip"');
    expect(result.ok).toBe(false);
    expect(result.definite).toBe(true);
  });

  test('rejects html without attachment', () => {
    const result = classifyProbeHeaders(200, 'Content-Type: text/html; charset=utf-8');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('网页');
  });

  test('accepts attachment responses', () => {
    expect(classifyProbeHeaders(200, attachmentHeaders()).ok).toBe(true);
    expect(classifyProbeHeaders(206, 'Content-Disposition: attachment').ok).toBe(true);
  });

  test('blocks dead links but not probe-client 403s', () => {
    expect(classifyProbeHeaders(404, '').definite).toBe(true);
    expect(classifyProbeHeaders(410, '').definite).toBe(true);
    expect(classifyProbeHeaders(403, 'Content-Type: text/html').definite).toBe(false);
  });

  test('missing headers are inconclusive', () => {
    expect(classifyProbeHeaders(200, '').definite).toBe(false);
    expect(classifyProbeHeaders(206, '   ').ok).toBe(false);
  });
});

describe('probeDownloadUrl', () => {
  test('aborts after headers and does not send page cookies', async () => {
    const capture = {};
    mockProbe(
      {
        readyState: {
          readyState: 2,
          status: 206,
          responseHeaders: 'Content-Disposition: attachment\r\nContent-Type: application/octet-stream',
        },
      },
      capture
    );

    const result = await probeDownloadUrl('https://cdn.example/file');
    expect(result.ok).toBe(true);
    expect(capture.aborted).toBe(true);
    expect(capture.opts.anonymous).toBe(true);
    expect(capture.opts.headers.Range).toBe('bytes=0-0');
    expect(capture.opts.headers.Accept).toBe('*/*');
    expect(capture.opts.headers.Cookie).toBeUndefined();
    expect(capture.opts.headers['User-Agent']).toBeUndefined();
  });

  test('stops a body that ignores Range', async () => {
    const capture = {};
    mockProbe({ onprogress: { loaded: 4096, status: 200 } }, capture);
    const result = await probeDownloadUrl('https://cdn.example/file');
    expect(result.definite).toBe(false);
    expect(capture.aborted).toBe(true);
  });

  test('waits through redirects before classifying', async () => {
    const capture = {};
    globalThis.GM_xmlhttpRequest = (opts) => {
      capture.opts = opts;
      const handle = {
        abort() {
          capture.aborted = true;
        },
      };
      opts.onreadystatechange({ readyState: 2, status: 302, responseHeaders: 'Location: https://cdn/file' });
      opts.onreadystatechange({
        readyState: 2,
        status: 200,
        responseHeaders: attachmentHeaders(),
      });
      return handle;
    };

    const result = await probeDownloadUrl('https://cdn.example/file');
    expect(result.ok).toBe(true);
    expect(capture.aborted).toBe(true);
  });

  test('network errors stay inconclusive', async () => {
    mockProbe({ onerror: true });
    const result = await probeDownloadUrl('https://cdn.example/file');
    expect(result.ok).toBe(false);
    expect(result.definite).toBe(false);
  });
});

describe('describeNativeFallback', () => {
  test('uses concise user-friendly language', () => {
    for (const copied of [true, false]) {
      const text = describeNativeFallback({ copied, multi: true, probeError: 'CDN 预检超时' });
      expect(text).not.toContain('已同步复制');
      expect(text).not.toContain('成功');
      expect(text).not.toContain('Downloads');
      expect(text).not.toContain('Quark');
      // 不再泄露技术细节
      expect(text).not.toContain('预检');
      expect(text).not.toContain('CDN');
      expect(text).not.toContain('脚本未指定');
    }
    expect(describeNativeFallback({ copied: false })).toContain('剪贴板未写入');
    expect(describeNativeFallback({ copied: true })).toContain('直链已复制');
    // 批量提示
    expect(describeNativeFallback({ copied: true, multi: true })).toContain('拦截');
    // mountError 时提示手动保存
    expect(describeNativeFallback({ copied: true, mountError: '框架挂载失败' })).toContain('手动保存');
  });
});

describe('triggerDownload', () => {
  test('does not open a frame when the response is not an attachment', async () => {
    const dom = installDom();
    mockProbe({
      onload: { status: 200, responseHeaders: 'Content-Type: application/octet-stream' },
    });

    const res = await triggerDownload('https://cdn.example/file', 'a/b:c.zip', 1024);
    expect(res).toBe(false);
    expect(iframes(dom.body)).toHaveLength(0);
    const text = collectText(dom.body);
    expect(text).toContain('直链校验未通过');
    expect(text).toContain('不是附件');
    expect(text).toContain('a/b:c.zip');
    expect(text).not.toContain('a_b_c.zip');
    expect(text).not.toContain('已同步复制');
    expect(text).not.toContain('已开始下载');
    dom.restore();
  });

  test('default channel stays unverified and does not sanitize the visible name', async () => {
    const dom = installDom();
    mockProbe({ onload: { status: 200, responseHeaders: attachmentHeaders() } });

    const res = await triggerDownload('https://cdn.example/file', 'a/b:c.zip', 2048, { index: 1, total: 3 });
    expect(res).toBe(true);
    const frame = iframes(dom.body)[0];
    expect(frame.src).toBe('https://cdn.example/file');
    expect(frame.onload).toBeUndefined();
    expect(frame.onerror).toBeUndefined();

    const item = toastItems(dom.body).at(-1);
    expect(item.className).toContain('qdh-toast-success');
    const text = collectText(item);
    expect(text).toContain('[2/3] 已开始下载');
    expect(text).toContain('a/b:c.zip');
    expect(text).not.toContain('a_b_c.zip');
    expect(text).not.toContain('已同步复制');
    expect(text).toContain('拦截');
    dom.restore();
  });

  test('an inconclusive probe still attempts the frame and does not report success', async () => {
    const dom = installDom();
    mockProbe({ onerror: true });

    await triggerDownload('https://cdn.example/file', 'note.txt');
    expect(iframes(dom.body)).toHaveLength(1);
    const text = collectText(dom.body);
    expect(text).toContain('已开始下载');
    expect(text).not.toContain('预检');
    dom.restore();
  });

  test('clipboard failure is visible and the copy button reports its own failure', async () => {
    const dom = installDom();
    globalThis.GM_setClipboard = () => {
      throw new Error('denied');
    };
    mockProbe({ onload: { status: 200, responseHeaders: attachmentHeaders() } });

    await triggerDownload('https://cdn.example/file', 'note.txt');
    const text = collectText(dom.body);
    expect(text).toContain('剪贴板未写入');
    expect(text).not.toContain('已同步复制');

    const button = toastItems(dom.body)
      .at(-1)
      .children.flatMap((node) => node.children || [node])
      .find((node) => node.textContent === '复制直链');
    await button.listeners.click({ stopPropagation() {} });
    expect(button.textContent).toBe('复制失败');
    dom.restore();
  });

  test('uses GM_download only after a progress signal and keeps the sanitized name there', async () => {
    const dom = installDom();
    mockProbe({ onload: { status: 200, responseHeaders: attachmentHeaders() } });
    let downloadArg = null;
    globalThis.GM_info = { downloadMode: 'browser' };
    globalThis.GM_download = (arg) => {
      downloadArg = arg;
      arg.onprogress();
      arg.onload();
    };

    const res = await triggerDownload('https://cdn.example/good', 'test/name.zip');
    expect(res).toBe(true);
    expect(downloadArg.name).toBe('test_name.zip');
    expect(iframes(dom.body)).toHaveLength(0);
    const text = collectText(dom.body);
    expect(text).toContain('下载完成');
    expect(text).toContain('test_name.zip');
    expect(text).not.toContain('✅');
    expect(text).not.toContain('Downloads/Quark');
    dom.restore();
  });

  test('reports failure when browser mode never observes a handoff', async () => {
    const dom = installDom();
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...args) => {
      if (ms === OBSERVE_TIMEOUT_MS) {
        fn(...args);
        return 0;
      }
      return realSetTimeout(fn, ms, ...args);
    };
    mockProbe({ onload: { status: 200, responseHeaders: attachmentHeaders() } });
    globalThis.GM_info = { downloadMode: 'browser' };
    globalThis.GM_download = () => ({ abort() {} });

    try {
      await triggerDownload('https://cdn.example/good', 'slow.bin');
      const text = collectText(dom.body);
      expect(text).toContain('未观察到下载接手');
      expect(text).not.toContain('已开始下载');
      expect(iframes(dom.body)).toHaveLength(0);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      dom.restore();
    }
  });

  test('falls back to the unverified channel when GM_download throws', async () => {
    const dom = installDom();
    mockProbe({ onload: { status: 200, responseHeaders: attachmentHeaders() } });
    globalThis.GM_info = { downloadMode: 'browser' };
    globalThis.GM_download = () => {
      throw new Error('unsupported');
    };

    const res = await triggerDownload('https://cdn.example/good', 'name.zip');
    expect(res).toBe(true);
    expect(iframes(dom.body)).toHaveLength(1);
    expect(collectText(dom.body)).toContain('已开始下载');
    dom.restore();
  });
});
