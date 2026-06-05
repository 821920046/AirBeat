<p align="center">
  <img src="public/airbeat_logo.png" alt="AirBeat" width="200" />
</p>

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC-SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

AI 驱动的智能音乐播放器。随时随地，免费听歌。

![AirBeat 主界面](docs/screenshots/pic_1.png)

![AirBeat 云端搜索](docs/screenshots/pic_2.png)

## Features

- **AI 对话交互** — 通过自然语言告诉 AI 你想听什么，智能搜索推荐
- **B站海量曲库** — 搜索 B站任意视频，一键下载音频
- **原始音频直传** — 浏览器下载 B站 DASH AAC/M4A 音频流，直接上传 R2 存储，不做客户端转码，节省 CPU 和内存
- **弹幕叠加** — 播放 B站来源的音频时，同步显示原视频弹幕（JS 驱动匀速滚动）
- **SSE 流式 + 断线重连** — AI 对话实时流式输出，网络断开自动重连
- **多轮 Tool Calling** — AI 可连续调用多次搜索工具，扩展搜索范围
- **复古终端 UI** — 赛博朋克风格界面，CRT 扫描线、点阵背景、实时状态面板
- **全平台免费部署** — 基于 Cloudflare 免费服务，零成本运行

## Tech Stack

| 层 | 技术 |
|---|------|
| 前端 | Next.js 16 (Static Export) / React 19 / TypeScript 5 |
| 样式 | Tailwind CSS 4 + CSS Variables + Material Symbols |
| 后端 | Cloudflare Pages Functions |
| 存储 | Cloudflare R2 (音频) + D1 (元数据) + KV (缓存) |
| AI | OpenRouter 免费模型 (function calling, key pool + 模型降级) |
| 音频 | B站 DASH 流 (AAC-in-MP4 容器)，浏览器原生 `<audio>` 播放 |

## Getting Started

### 前置条件

- Node.js >= 20
- npm
- Cloudflare 账号（免费）
- OpenRouter API Key（免费注册：https://openrouter.ai）

### 安装

```bash
git clone https://github.com/821920046/AirBeat.git
cd AirBeat
npm install
```

### 创建 Cloudflare 资源

```bash
# 创建 D1 数据库
npx wrangler d1 create airbeat
# 记下输出的 database_id，填入根目录 wrangler.toml

# 创建 R2 存储桶
npx wrangler r2 bucket create airbeat-audio

# 创建 KV 命名空间
npx wrangler kv namespace create CACHE
# 记下输出的 id，填入根目录 wrangler.toml

# 初始化数据库表结构
npx wrangler d1 execute airbeat --file=worker/schema.sql --remote

# 设置 OpenRouter API Key（Pages 项目 secret）
npx wrangler pages secret put OPENROUTER_API_KEY --project-name=airbeat
```

### 本地开发

```bash
npm run dev
```

打开 http://localhost:3000 即可使用。

> 本地开发时 API 请求需要 Worker 支持，可通过 `npx wrangler dev` 在另一个终端启动 Worker：
> ```bash
> cd worker && npx wrangler dev
> ```
> 然后设置环境变量 `NEXT_PUBLIC_API_BASE=http://localhost:8787`。

### 部署

#### 自动部署（推荐）

Push 到 `main` 分支后，GitHub Actions 自动构建并部署到 Cloudflare Pages。

**首次配置步骤：**

1. **获取 Cloudflare API Token**
   - 打开 https://dash.cloudflare.com/profile/api-tokens
   - 点击 **Create Token**，选择 **Cloudflare Pages - Edit** 模板
   - 额外勾选以下权限：Workers KV Storage (Edit)、D1 (Edit)、R2 Storage (Edit)、Workers Scripts (Edit)
   - 创建后复制 token

2. **获取 Cloudflare Account ID**
   - 打开 https://dash.cloudflare.com → 右侧栏可见 **Account ID**

3. **在 GitHub 添加 Secrets**
   - 打开 https://github.com/821920046/AirBeat/settings/secrets/actions
   - 添加：

   | Secret Name | 值 |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | 上面的 token |
   | `CLOUDFLARE_ACCOUNT_ID` | 上面的 account ID |

4. **创建 Cloudflare 资源**（只需一次，命令见上方「创建 Cloudflare 资源」）

配置完成后，每次 `git push` 到 main 即自动部署前端 + API。

#### 手动部署

```bash
# 构建前端
npm run build

# 部署到 Cloudflare Pages（包含 Functions）
npx wrangler pages deploy
```

## Project Structure

```
AirBeat/
├── app/                     # Next.js 前端（静态导出）
│   ├── components/          # UI 组件（Atomic Design）
│   │   ├── atoms/           # DanmakuOverlay, GlowDot, Badge 等基础组件
│   │   ├── molecules/       # ControlBar, SeekBar, TrackInfo, ChatMessage 等
│   │   └── organisms/       # Player, AgentChat, Playlist, ClockPanel 等
│   ├── context/             # React Context 状态管理
│   │   ├── PlayerContext    # 音频播放状态 + 播放列表操作
│   │   ├── AgentContext     # AI 对话状态 + 本地意图检测
│   │   ├── ConvertContext   # B站 DASH 音频下载 → 上传 R2 转换流程
│   │   └── DanmakuContext   # 弹幕数据获取 & 开关
│   ├── hooks/               # useAudioPlayer, useSSE, useClock
│   └── lib/                 # B站 API 客户端、类型定义、配置
├── functions/               # Cloudflare Pages Functions（API 后端）
│   ├── _middleware.ts        # 全局 CORS
│   ├── api/
│   │   ├── bili/            # B站 API 代理（search + 媒体流代理）
│   │   ├── chat.ts          # AI 对话 SSE (key pool, 模型降级, 多轮 tool_call)
│   │   ├── tracks.ts        # 本地曲库搜索
│   │   ├── upload.ts        # 音频上传 (R2 + D1)
│   │   └── keys.ts          # API key 池管理
│   └── audio/
│       └── [[path]].ts      # R2 音频流（支持 Range 请求）
├── worker/                  # 独立 Worker 源码（本地开发/备用）
├── wrangler.toml            # Cloudflare Pages 配置（D1/KV/R2 绑定）
├── design/                  # 设计规范文档
└── docs/screenshots/        # 应用截图
```

## Architecture

```
浏览器 ──→ Cloudflare Pages
            ├── 静态文件（Next.js 导出的 HTML/CSS/JS）
            ├── Functions（API 后端）
            │    ├── /api/bili/*  → B站 API（前端直连外部代理，绕过 CF IP 封锁）
            │    ├── /api/chat   → OpenRouter AI 对话 SSE
            │    ├── /api/tracks → D1 数据库查询
            │    ├── /api/upload → R2 音频上传 + D1 写入
            │    └── /audio/*    → R2 音频流（Range + 正确 Content-Type）
            ├── D1 Database     → tracks 表（id, title, author, bvid, r2_key, ...）
            ├── R2 Bucket       → 音频文件（AAC/M4A, 少量遗留 WAV）
            └── KV Namespace    → WBI keys, buvid3, API key pool 缓存
```

## Usage

1. 在聊天框输入你想听的内容（如"听周杰伦的晴天"）
2. AI 在 B站搜索并推荐相关结果，或直接 `/search 关键词` 快速搜索
3. 点击 **+ ADD** 按钮，浏览器下载 B站 DASH 原始音频 → 直接上传 R2
4. 音频加入播放列表自动播放，支持上一首/下一首/暂停/进度拖拽/音量调节
5. 点击弹幕开关可显示/隐藏同步弹幕

## Platform

| 平台 | 支持情况 |
|------|---------|
| macOS | 完全支持 |
| Linux | 完全支持 |
| Windows | 完全支持 |
| Mobile (iOS/Android) | 支持（不做客户端转码，内存安全） |

## Key Dependencies

| 库 | 用途 |
|---|------|
| Next.js 16 | 前端框架（静态导出） |
| React 19 | UI 框架 |
| Tailwind CSS 4 | 样式系统 |
| ts-md5 | B站 WBI 签名 |
| wrangler | Cloudflare 部署 CLI |

## Author

**Windwalker** — 独立开发者，自媒体 & 电商创业者

GitHub: [@821920046](https://github.com/821920046)

## License

本项目采用 [CC BY-NC-SA 4.0](LICENSE) 协议。

你可以自由地查看、修改和分享本项目代码，但 **禁止用于商业用途**。衍生作品须以相同协议分发。
