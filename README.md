# 夸克网盘极速直下助手 (Quark Download Helper)

> ⚡ **纯前端、零本地常驻进程 (No Daemon)**，一键突破夸克网盘网页端大文件下载限制与客户端强制绑定，获取官方真实高速 CDN 直链，支持浏览器原生直下与直链自动复制。

---

## ✨ 核心特性

* 🚀 **彻底突破客户端绑架拦截**：告别官方网页端 *“文件过大，请使用夸克网盘客户端”* 的强制弹窗限制，几百 MB、几十 GB 大文件直接在浏览器中下载。
* 🪶 **纯前端轻量化（免本地 Daemon）**：无需在本地终端启动任何后台服务、无需开启本地端口、无需安装额外的 CLI 工具，装上脚本即可使用。
* 📋 **直链自动同步剪贴板**：触发下载时自动将官方真实高速 CDN 直链写入系统剪贴板，方便直接粘贴至 IDM、Aria2、迅雷等外部专业多线程下载器。
* 🎯 **全场景原位接管**：
  * **顶部操作栏**：多选勾选文件后，原生【下载】按钮原位升级为【⚡ 极速直下】（自动带选中计数），平稳排队直下。
  * **单行悬浮快捷下载**：鼠标悬停单行文件，直接点击右侧下载图标即刻触发。
  * **右键菜单直下**：表格行右键菜单中的「下载」项同样无缝接管。
* 🛡️ **分享页不接管下载**：他人分享和归属不明时，下载、保存都交给夸克，页面只留一条说明。本人分享可在底栏「勾选后极速直下」。

* 📊 **透明可观测的交互体验**：内置 CDN 响应头 Range 预检探针过滤无效网页流，右下角提供卡片式 Toast 状态追踪，支持查看文件名、文件大小、状态诊断，并附带直链重试与手动复制动作。

---

## 🛠️ 安装与使用教程

### 第一步：安装脚本管理器扩展
如果您的浏览器尚未安装脚本管理器，请先安装以下任意一款常用扩展（主流浏览器应用商店均可免费安装）：
* **Tampermonkey (篡改猴)**：[Chrome 商店](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) / [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) / [官网](https://www.tampermonkey.net/)
* **ScriptCat (脚本猫)**：[官网](https://scriptcat.org/)
* **Violentmonkey (暴力猴)**

---

### 第二步：安装本脚本

#### 方式 A：一键在线安装（推荐）
点击下方直链，脚本管理器将自动拦截并弹出确认安装界面，点击 **【安装】** 即可：
👉 **[点击一键安装脚本 (quark-download-helper.user.js)](https://github.com/hyperlook/quark-helper/releases/latest/download/quark-download-helper.user.js)**

#### 方式 B：手动安装或本地构建
1. 前往本仓库的 **[Releases 最新发布页](https://github.com/hyperlook/quark-helper/releases/latest)** 下载 `quark-download-helper.user.js`；
2. 亦可克隆本项目后在本地运行 `bun run build` 编译产出脚本；
3. 将完整脚本代码复制粘贴进 Tampermonkey（篡改猴）新建脚本中保存。

---

### 第三步：推荐使用技巧（搭配浏览器设置或外部下载器）

1. **浏览器自动下载设置（免频繁弹窗另存为）**：
   * 打开 Chrome / Edge 设置：搜索 `下载` 或访问 `chrome://settings/downloads`。
   * **关闭【下载每个文件前都询问保存位置】**，浏览器即可自动将文件下载至系统默认下载路径。
2. **配合第三方极速下载工具（IDM / Aria2 / 迅雷 等）**：
   * 点击下载时，真实 CDN 高速直链已自动复制到系统剪贴板；
   * 直接在外部下载工具中新建任务（`Ctrl + V` 粘贴直链），即可享受多线程极速拉取；
   * 右下角下载卡片也随时提供【复制直链】与【重试】按钮。
3. **他人分享文件**：
   * 脚本不接管分享页上的下载按钮。
   * 需要极速直下时，用夸克自己的「保存到网盘」，转存后进入个人网盘再下。


---

## 📁 文件目录结构

```tree
quark-helper/
├── src/                            # 模块化源码目录
│   ├── config.js                   # 全局静态配置与客户端 UA
│   ├── utils/                      # 工具集 (React Fiber 遍历引擎、跨域请求)
│   ├── ui/                         # 界面增强、样式与卡片式 Toast 组件
│   ├── services/                   # 数据层 (元数据感知池、夸克 API、落盘调度与探针)
│   ├── core/                       # 核心业务 (选中文档解析、事件拦截、DOM 监听)
│   └── index.js                    # 脚本装配主入口
├── scripts/
│   ├── build.js                    # 基于 Bun 的打包构建管线 (支持 --watch)
│   └── preview.js                  # 基于 agent-browser 的无头真机端到端预览与契约测试
├── tests/                          # 自动化测试套件
│   ├── dom-stub.js                 # 轻量 DOM 运行环境模拟
│   ├── downloader.test.js          # 下载器调度与探针状态测试
│   ├── share.test.js               # 分享页收敛安全契约测试
│   └── toast.test.js               # Toast 交互与安全性测试
├── quark-download-helper.user.js   # 编译构建输出的单文件油猴脚本 (可直接安装/发布)
├── package.json                    # 工程信息与脚本定义
└── README.md                       # 详细使用指南与原理说明
```

---

## 🛠️ 本地开发与贡献 (Development)

本项目采用 **「模块化源码开发 + Bun 极速打包构建」** 的现代工程流：

1. **打包构建**：
   ```bash
   bun run build
   ```
2. **运行测试**：
   ```bash
   bun test
   ```
3. **实时监听开发**：
   ```bash
   bun run dev
   ```
4. **端到端真机验证与截图**：
   ```bash
   bun run preview
   ```
5. **免复制调试（热调试技巧）**：
   - 在 Chrome / Edge 扩展管理中找到 Tampermonkey，开启 **“允许访问文件网址”**（Allow access to file URLs）。
   - 在 Tampermonkey 中新建一个开发用脚本，内容仅需一行：
     ```javascript
     // ==UserScript==
     // @name         夸克助手 (Local Dev)
     // @match        https://pan.quark.cn/*
     // @require      file:///绝对路径/quark-helper/quark-download-helper.user.js
     // ==/UserScript==
     ```
   - 运行 `bun run dev`，在网盘页面刷新（`F5`）即可立即生效最新编译代码。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布。
