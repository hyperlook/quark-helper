export const SCRIPT_NAME = '夸克极速直下';
export const SCRIPT_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const API_BASE = 'https://drive.quark.cn/1/clouddrive';

// 模拟夸克桌面客户端 PC UA（破除服务端 400 校验与 100MB 限制核心）
export const CLIENT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4 Safari/537.36 Channel/pckk_other_ch';

export const targetWin =
  typeof unsafeWindow !== 'undefined'
    ? unsafeWindow
    : typeof window !== 'undefined'
      ? window
      : globalThis;
