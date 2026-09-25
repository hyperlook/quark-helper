import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { collectText, installDom } from './dom-stub.js';
import { hijackAndStyleButtons, matchDownloadTrigger } from '../src/core/interceptor.js';
import { getSelectedFiles } from '../src/core/parser.js';
import { handleSharePageDownload } from '../src/services/quarkApi.js';
import { fileCache, fileNameCache } from '../src/services/cache.js';

let dom;
let originalLocation;
let originalGMRequest;
let originalFetch;

const SINGLE_FILE = {
  fid: 'only_fid',
  file_name: 'only.pdf',
  file_type: 1,
  dir: false,
  size: 12,
};

function setupShareFiber(dom, shareData) {
  dom.body['__reactFiber$test'] = {
    memoizedProps: {
      stoken: shareData.stoken || '',
      pwdid: shareData.pwd_id || '',
      isOwer: Boolean(shareData.is_owner),
      detailInfo: {
        is_owner: shareData.is_owner || 0,
        list: shareData.fileList || [],
        share: {
          pwd_id: shareData.pwd_id || '',
          is_owner: shareData.is_owner || 0,
        },
      },
    },
    child: null,
    sibling: null,
    return: null,
  };
}

function attachShareProps(props) {
  dom.body['__reactFiber$test'] = {
    memoizedProps: props,
    child: null,
    sibling: null,
    return: null,
  };
}

function attachRowRecord(row, record) {
  row['__reactFiber$test'] = {
    memoizedProps: { record },
    return: null,
  };
}

function shareRow(record = SINGLE_FILE) {
  const row = dom.document.createElement('tr');
  row.className = 'ant-table-row';
  attachRowRecord(row, record);
  dom.body.append(row);
  return row;
}

function toastText() {
  const container = dom.document.getElementById('qdh-toast-container');
  return container ? collectText(container) : '';
}

beforeEach(() => {
  dom = installDom();
  originalLocation = globalThis.location;
  originalGMRequest = globalThis.GM_xmlhttpRequest;
  originalFetch = globalThis.fetch;
  fileCache.clear();
  fileNameCache.clear();
  globalThis.GM_xmlhttpRequest = (opt) => {
    opt.onload?.({ status: 200, responseText: JSON.stringify({ code: 0, data: { list: [] } }) });
  };
});

afterEach(() => {
  dom?.restore();
  dom = null;
  globalThis.location = originalLocation;
  globalThis.GM_xmlhttpRequest = originalGMRequest;
  globalThis.fetch = originalFetch;
  fileCache.clear();
  fileNameCache.clear();
});

describe('分享页收敛机制 (issue 02)', () => {
  test('分享页面未显式勾选任何文件时，getSelectedFiles() 坚决返回空列表，禁止静默全选', async () => {
    globalThis.location = {
      pathname: '/s/some_share_id',
      search: '',
      hash: '',
    };

    // 模拟表格行，但没有被选中 (.ant-table-row-selected)
    const row = dom.document.createElement('tr');
    row.className = 'ant-table-row';
    const textSpan = dom.document.createElement('span');
    textSpan.className = 'filename-text';
    textSpan.textContent = 'unselected-doc.pdf';
    row.append(textSpan);
    dom.body.append(row);

    setupShareFiber(dom, {
      pwd_id: 'some_share_id',
      stoken: 'valid_stoken',
      is_owner: 0,
      fileList: [
        { fid: 'fid_1', file_name: 'file1.pdf', share_fid_token: 'tok1', dir: false },
        { fid: 'fid_2', file_name: 'file2.pdf', share_fid_token: 'tok2', dir: false },
      ],
    });

    const selected = await getSelectedFiles();
    expect(selected).toEqual([]);
  });

  test('单文件视口：分享页即使行上有非目录记录也不接管，个人盘必须返回该文件', async () => {
    globalThis.location = {
      pathname: '/s/single_file_share',
      search: '',
      hash: '',
    };
    shareRow();

    expect(await getSelectedFiles()).toEqual([]);

    globalThis.location = {
      pathname: '/list',
      search: '',
      hash: '#/list/all',
    };
    const selected = await getSelectedFiles();
    expect(selected.map((file) => ({ fid: file.fid, fileName: file.fileName, isDir: file.isDir }))).toEqual([
      { fid: 'only_fid', fileName: 'only.pdf', isDir: false },
    ]);
  });

  test('他人分享不发转存或直链请求，也不再用 Toast 假装成按钮', async () => {
    globalThis.location = {
      pathname: '/s/other_share',
      search: '',
      hash: '',
    };

    const requestedUrls = [];
    globalThis.GM_xmlhttpRequest = (opt) => {
      requestedUrls.push(opt.url);
      opt.onload?.({ status: 200, responseText: '{}' });
    };

    setupShareFiber(dom, {
      pwd_id: 'other_share',
      stoken: 'stoken_123',
      is_owner: 0,
      fileList: [{ fid: 'fid_other', file_name: 'other.mp4', share_fid_token: 'tok' }],
    });

    await handleSharePageDownload([{ fid: 'fid_other', fileName: 'other.mp4', size: 1024 }]);

    // 不是排除几个 URL。偷偷打 token、task 或根目录列表也要失败。说明不走 Toast。
    expect(requestedUrls).toEqual([]);
    expect(toastText()).toBe('');
  });

  test('本人分享 (isOwner === 1) 保持免转存直接获取直链下载', async () => {
    globalThis.location = {
      pathname: '/s/my_own_share',
      search: '',
      hash: '',
    };

    const requestedUrls = [];
    globalThis.GM_xmlhttpRequest = (opt) => {
      requestedUrls.push(opt.url);
      if (opt.url.includes('/file/download')) {
        opt.onload({
          status: 200,
          responseText: JSON.stringify({
            code: 0,
            data: [{ download_url: 'https://cdn.quark.cn/my.pdf', file_name: 'my.pdf', size: 100 }],
          }),
        });
        return;
      }
      opt.onload({ status: 200, responseText: '{}' });
    };

    setupShareFiber(dom, {
      pwd_id: 'my_own_share',
      stoken: 'my_tok',
      is_owner: 1,
      fileList: [{ fid: 'my_fid', file_name: 'my.pdf' }],
    });

    await handleSharePageDownload([{ fid: 'my_fid', fileName: 'my.pdf', size: 100 }]);

    // 断言直接调用 /file/download，不发起任何转存请求
    expect(requestedUrls.some((u) => u.includes('/file/download'))).toBe(true);
    expect(requestedUrls.some((u) => u.includes('/share/sharepage/save'))).toBe(false);
    expect(requestedUrls.some((u) => u.includes('/share/sharepage/token'))).toBe(false);
    expect(toastText()).not.toContain('他人分享请先保存到网盘');
    expect(toastText()).not.toContain('无法确认文件归属');
  });

  test('认不出归属时不当成他人分享，也不发起任何请求', async () => {
    globalThis.location = {
      pathname: '/s/unknown_share',
      search: '',
      hash: '',
    };

    const requestedUrls = [];
    globalThis.GM_xmlhttpRequest = (opt) => {
      requestedUrls.push(opt.url);
      opt.onload?.({ status: 200, responseText: '{}' });
    };

    await handleSharePageDownload([{ fid: 'fid_unknown', fileName: 'unknown.pdf', size: 10 }]);

    expect(requestedUrls).toEqual([]);
    expect(toastText()).toBe('');
  });

  test('Fiber 命中但没有所有者字段时，仍然是识别失败而不是他人分享', async () => {
    globalThis.location = {
      pathname: '/s/partial_share',
      search: '',
      hash: '',
    };

    const requestedUrls = [];
    globalThis.GM_xmlhttpRequest = (opt) => {
      requestedUrls.push(opt.url);
      opt.onload?.({ status: 200, responseText: '{}' });
    };
    attachShareProps({
      stoken: 'only_stoken',
      pwdid: 'partial_share',
      detailInfo: {
        list: [{ fid: 'fid_partial', file_name: 'partial.pdf' }],
        share: { pwd_id: 'partial_share' },
      },
    });

    await handleSharePageDownload([{ fid: 'fid_partial', fileName: 'partial.pdf', size: 10 }]);

    expect(requestedUrls).toEqual([]);
    expect(toastText()).toBe('');
  });

  function mountShareChrome(downloadText = '下载') {
    const content = dom.document.createElement('div');
    content.className = 'share-content';
    const info = dom.document.createElement('div');
    info.className = 'share-info-wrap';
    const list = dom.document.createElement('div');
    list.className = 'file-list';
    const shareBtn = dom.document.createElement('button');
    shareBtn.className = 'share-download';
    const shareText = dom.document.createElement('span');
    shareText.className = 'share-download-text';
    shareText.textContent = downloadText;
    const icon = dom.document.createElement('i');
    icon.className = 'share-download-ico';
    shareBtn.append(icon, shareText);
    const hover = dom.document.createElement('div');
    hover.className = 'share-hover-menu-download';
    content.append(info, list, shareBtn, hover);
    dom.body.append(content);
    // 提取器会优先从 .file-list 往下走，不会回到 body。归属必须挂在它能读到的节点上。
    const fiber = dom.body['__reactFiber$test'];
    if (fiber) {
      content['__reactFiber$test'] = fiber;
      list['__reactFiber$test'] = fiber;
    }
    return { content, shareBtn, shareText, icon, hover };
  }

  test('他人分享不改原生下载，只留不可点击的指示牌', () => {
    globalThis.location = {
      pathname: '/s/other_share',
      search: '',
      hash: '',
    };
    setupShareFiber(dom, { pwd_id: 'other_share', is_owner: 0 });
    const { shareBtn, shareText, icon, hover } = mountShareChrome();

    hijackAndStyleButtons();

    expect(shareText.textContent).toBe('下载');
    expect(shareBtn.className).not.toContain('qdh-hijacked-btn');
    expect(shareBtn.title).toBe('');
    expect(icon.className).toBe('share-download-ico');
    expect(hover.className).not.toContain('qdh-hover-btn');
    expect(matchDownloadTrigger(shareBtn)).toBeNull();
    expect(matchDownloadTrigger(hover)).toBeNull();

    const hint = dom.document.querySelector('.qdh-share-hint');
    expect(hint).not.toBeNull();
    expect(hint.tagName).toBe('DIV');
    expect(hint.getAttribute('role')).toBe('note');
    expect(hint.className).not.toContain('qdh-hijacked-btn');
    const hintText = collectText(hint);
    expect(hintText).toContain('他人分享不接管下载');
    expect(hintText).toContain('保存进个人网盘后');
    expect(hintText).not.toContain('请先点击');
    expect(hintText).not.toContain('保存后下载');
    expect(hintText).not.toContain('上方');
    expect(hintText).not.toContain('右边');

    shareText.textContent = '下载';
    hijackAndStyleButtons();
    expect(shareText.textContent).toBe('下载');
    expect(dom.document.querySelectorAll('.qdh-share-hint').length).toBe(1);
  });

  test('本人分享保留真按钮，原生下载图标不动', () => {
    globalThis.location = {
      pathname: '/s/my_own_share',
      search: '',
      hash: '',
    };
    setupShareFiber(dom, { pwd_id: 'my_own_share', is_owner: 1 });
    const { shareBtn, shareText } = mountShareChrome();

    const wrap = dom.document.createElement('div');
    wrap.className = 'operate-wrap';
    const tips = dom.document.createElement('div');
    tips.className = 'owner-tips';
    wrap.append(tips);
    const operate = dom.document.createElement('div');
    operate.className = 'share-operate';
    operate.append(wrap);
    dom.body.append(operate);

    hijackAndStyleButtons();

    expect(shareText.textContent).toBe('下载');
    expect(shareBtn.className).not.toContain('qdh-hijacked-btn');
    expect(dom.document.querySelector('.qdh-share-hint')).toBeNull();
    expect(matchDownloadTrigger(shareBtn)).toBeNull();

    const ownerBtn = dom.document.querySelector('.qdh-share-owner-btn');
    expect(ownerBtn).not.toBeNull();
    expect(ownerBtn.tagName).toBe('BUTTON');
    expect(ownerBtn.innerHTML).toContain('勾选后极速直下');
    expect(ownerBtn.innerHTML).not.toContain('所有文件');
    expect(ownerBtn.title).toBe('请先勾选文件，再免转存直下');
    expect(matchDownloadTrigger(ownerBtn)?.type).toBe('share_owner');
  });

  test('认不出归属时，指示牌不下结论，也不改下载按钮', () => {
    globalThis.location = {
      pathname: '/s/unknown_share',
      search: '',
      hash: '',
    };
    const { shareBtn, shareText } = mountShareChrome();

    hijackAndStyleButtons();

    expect(shareText.textContent).toBe('下载');
    expect(shareBtn.className).not.toContain('qdh-hijacked-btn');
    expect(matchDownloadTrigger(shareBtn)).toBeNull();
    const hintText = collectText(dom.document.querySelector('.qdh-share-hint'));
    expect(hintText).toContain('未能确认归属');
    expect(hintText).toContain('仍由夸克处理');
    expect(hintText).not.toContain('他人分享');
    expect(hintText).not.toContain('请先点击');
    expect(hintText).not.toContain('确认后下载');
  });
});
