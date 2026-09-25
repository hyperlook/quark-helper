import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const ROOT_DIR = resolve(import.meta.dir, '..');
const SCRIPT_PATH = resolve(ROOT_DIR, 'quark-download-helper.user.js');
const AUTH_PATH = resolve(ROOT_DIR, 'quark-auth.json');
const NORMAL_SHOT = resolve(ROOT_DIR, 'debug-preview.png');
const HOVER_SHOT = resolve(ROOT_DIR, 'debug-preview-hover.png');

if (!existsSync(SCRIPT_PATH)) {
  console.error('❌ 未找到构建产物 quark-download-helper.user.js，请先执行 bun run build');
  process.exit(1);
}

const userScript = readFileSync(SCRIPT_PATH, 'utf-8');

// ==========================================
// 回退保险：只拦已删除的代转存指纹 (issue 02)
// 行为契约在 tests/share.test.js。不要用裸的 pdir_fid=0&，
// 否则个人盘根目录的字面量列表 URL 会在打开浏览器前误杀流水线。
// ==========================================
console.log(' 正在断言分享页路径安全收敛契约...');

const bannedFingerprints = [
  ['/share/sharepage/save', '分享页转存接口'],
  ['to_pdir_fid: "0"', '转存目标固定为根目录'],
  ["to_pdir_fid: '0'", '转存目标固定为根目录'],
  ['pdir_fid=0&_page=1&_size=100&_sort=updated_at', '按更新时间回查根目录猜文件名'],
];

for (const [needle, reason] of bannedFingerprints) {
  if (userScript.includes(needle)) {
    console.error(`❌ 契约断言失败: 检测到已删除的代转存指纹（${reason}）`);
    process.exit(1);
  }
}

// 4. 执行分享页行为测试断言
console.log(' 正在执行分享页专属行为测试 (tests/share.test.js)...');
const testProc = Bun.spawnSync(['bun', 'test', 'tests/share.test.js'], {
  cwd: ROOT_DIR,
  stdout: 'pipe',
  stderr: 'pipe',
});

if (testProc.exitCode !== 0) {
  console.error('❌ 分享页路径单元测试断言失败:');
  console.error(new TextDecoder().decode(testProc.stderr));
  console.log(new TextDecoder().decode(testProc.stdout));
  process.exit(1);
}

console.log('✅ 分享页安全契约与行为测试断言通过！');

console.log('🚀 启动夸克网盘无头环境验证流水线...');

const batchCommands = [
  ['open', 'https://pan.quark.cn'],
  ['wait', '3000'],
  // 勾选列表中的项唤出操作栏 ButtonGroup
  ['click', '.ant-table-row:nth-child(3) .ant-checkbox-input'],
  ['wait', '500'],
  // 注入最新构建的油猴脚本
  ['eval', userScript],
  ['wait', '600'],
  // 截图常规状态
  ['screenshot', NORMAL_SHOT],
  // 悬停在接管按钮上
  ['hover', '.qdh-hijacked-btn'],
  ['wait', '400'],
  // 截图悬停状态
  ['screenshot', HOVER_SHOT],
  // 检查控制台异常
  ['errors'],
  ['close'],
];

const proc = Bun.spawn(['agent-browser', '--state', AUTH_PATH, 'batch'], {
  cwd: ROOT_DIR,
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'pipe',
});

proc.stdin.write(JSON.stringify(batchCommands));
proc.stdin.end();

const [stdout, stderr] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
]);

const exitCode = await proc.exited;

if (exitCode !== 0) {
  console.error('❌ 预览流水线执行异常 (exit code:', exitCode, ')');
  if (stderr) console.error(stderr.trim());
  if (stdout) console.log(stdout.trim());
  process.exit(exitCode);
}

console.log('✅ 预览与热注入验证完成！');
console.log(`📸 常规状态截图: ${NORMAL_SHOT}`);
console.log(`📸 悬停状态截图: ${HOVER_SHOT}`);

// 过滤输出中的错误日志
const lines = stdout.split('\n');
const errorLines = lines.filter((l) => l.startsWith('[error]') || l.includes('Error:'));
if (errorLines.length > 0) {
  console.log(`⚠️ 检测到 ${errorLines.length} 条浏览器/页面日志信息（详情可查看控制台）`);
} else {
  console.log('✨ 页面无未捕获异常。');
}
