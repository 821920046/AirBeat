<p align="center">
  <img src="public/airbeat_logo.png" alt="AirBeat" width="200" />
</p>

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

AI 驱动的智能音乐播放器。随时随地，免费听歌。

![AirBeat 主界面](docs/screenshots/pic_1.png)

![AirBeat 云端搜索](docs/screenshots/pic_2.png)

## Features

- **AI 对话交互** — 通过自然语言告诉 AI 你想听什么，智能搜索推荐
- **B站海量曲库** — 搜索 B站任意视频，一键转为音频
- **浏览器端转换** — 基于 ffmpeg.wasm，无需服务器，浏览器内完成 AAC→MP3 转换
- **弹幕叠加** — 播放 B站来源的音频时，同步显示原视频弹幕
- **复古终端 UI** — 赛博朋克风格界面，实时状态面板
- **全平台免费部署** — 基于 Cloudflare 免费服务，零成本运行

## Tech Stack

| 层 | 技术 |
|---|------|
| 前端 | Next.js 16 (Static Export) / React 19 / TypeScript 5 |
| 样式 | Tailwind CSS 4 + CSS Variables |
| 后端 | Cloudflare Pages Functions |
| 存储 | Cloudflare R2 (音频) + D1 (元数据) + KV (缓存) |
| AI | OpenRouter 免费模型 (function calling) |
| 转换 | ffmpeg.wasm (浏览器端 AAC→MP3) |

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
│   │   ├── atoms/
│   │   ├── molecules/
│   │   └── organisms/
│   ├── context/             # React Context
│   │   ├── PlayerContext    # 音频播放状态
│   │   ├── AgentContext     # AI 对话状态
│   │   ├── ConvertContext   # ffmpeg.wasm 转换状态
│   │   └── DanmakuContext   # 弹幕状态
│   ├── hooks/               # 自定义 Hooks
│   └── lib/                 # 类型定义 & 配置
├── functions/               # Cloudflare Pages Functions（API 后端）
│   ├── _middleware.ts        # 全局 CORS 中间件
│   ├── api/
│   │   ├── bili/            # B站相关 API
│   │   │   ├── search.ts    # GET /api/bili/search
│   │   │   ├── danmaku.ts   # GET /api/bili/danmaku
│   │   │   ├── audio-url.ts # GET /api/bili/audio-url
│   │   │   └── proxy.ts     # GET /api/bili/proxy
│   │   ├── chat.ts          # POST /api/chat（AI 对话 SSE）
│   │   ├── tracks.ts        # GET /api/tracks
│   │   └── upload.ts        # POST /api/upload
│   └── audio/
│       └── [[path]].ts      # GET /audio/*（R2 音频流）
├── worker/                  # Worker 源码（本地开发用）
│   ├── src/
│   ├── schema.sql           # D1 建表语句
│   └── wrangler.toml
├── wrangler.toml            # Pages 项目配置（D1/KV/R2 绑定）
├── docs/screenshots/        # 应用截图
├── public/                  # 静态资源
└── design/                  # 设计规范文档
```

## Architecture

```
浏览器 ──→ Cloudflare Pages
            ├── 静态文件（Next.js 导出的 HTML/CSS/JS）
            └── Functions（API 后端）
                 ├── /api/bili/*  → 调用 B站 API（WBI 签名）
                 ├── /api/chat   → OpenRouter AI 对话（SSE）
                 ├── /api/tracks → D1 数据库查询
                 ├── /api/upload → R2 音频上传 + D1 写入
                 └── /audio/*    → R2 音频流式播放
```

前端和 API 部署在同一个 Cloudflare Pages 项目，共享同一域名，无需跨域配置。

## Usage

1. 在聊天框输入你想听的内容（如"听周杰伦的晴天"）
2. AI 在 B站搜索并推荐相关结果
3. 点击 + ADD 按钮，浏览器自动下载、转换、上传音频
4. 转换完成后自动加入播放列表，即刻播放

## Platform

| 平台 | 支持情况 |
|------|---------|
| macOS | 完全支持 |
| Linux | 完全支持 |
| Windows | 完全支持（浏览器端转换，无 WSL 依赖） |

## License

本项目采用 [CC BY-NC-SA 4.0](LICENSE) 协议。

你可以自由地查看、修改和分享本项目代码，但 **禁止用于商业用途**。 衍生作品须以相同协议分发。
