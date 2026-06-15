# AirBeat 在线音乐播放器

<p align="center">
  <img src="airbeat_logo.png" alt="AirBeat Logo" width="120" style="border-radius: 24px;">
</p>

免费在线音乐播放器，基于 **Cloudflare Pages + Pages Functions + D1** 全家桶构建，零服务器成本、零 npm 依赖。

## 功能特性

### 核心播放
- **多音源聚合搜索与播放**：Jamendo / Audius / Deezer / iTunes / Internet Archive / Radio Browser
- **同曲跨源回退**：播放失败或仅 30s 试听时，自动搜索其他音源的完整版无缝切换（学 Listen1）
- **LRC 歌词同步**：LRCLIB 自动匹配，逐行高亮 + 点击跳转
- **Web Audio 频谱可视化**：柱状图 / 环形两种样式
- **10 段均衡器**：流行 / 摇滚 / 人声 / 古典 / 电子 5 档预设 + 自定义调节
- **听歌识曲**：麦克风录音 → AudD 识别（需配置 `AUDD_KEY`）
- **三种播放模式**：列表循环 / 单曲循环 / 随机

### 系统集成
- **MediaSession API**：锁屏 / 蓝牙耳机 / 键盘媒体键控制，封面显示
- **键盘快捷键**：空格 = 播放暂停，←→ = 快进快退 5s，↑↓ = 音量 ±5%
- **PWA 支持**：可安装到桌面/手机，静态资源离线可用

### 个人数据
- **自建用户鉴权**：PBKDF2 加盐哈希 + JWT HttpOnly Cookie
- **收藏 / 歌单**：创建、重命名、删除、加歌、删歌
- **播放历史 + 最近播放**：localStorage 记录，为推荐打基础
- **每日推荐**：基于播放历史的歌手频次统计，发现页展示
- **歌单导入导出**：JSON 格式一键导出/导入，降低数据锁定顾虑
- **未登录 ↔ 登录数据同步**：未登录数据存 localStorage，登录后自动合并到服务端

### 高级音源
- **自定义音源**：URL 模板 + JSON 字段映射 + 请求头（API Key）+ 榜单 URL + 分页参数
- **Subsonic / Navidrome 支持**：自建曲库直接作为一个音源，含完整搜索和榜单
- **音源启用/停用**：一键开关任意音源

### UI
- 玻璃拟态设计（Glassmorphism）
- 深色 / 浅色主题切换
- 移动端响应式布局

---

## 项目结构

```
├── public/                       # 前端静态站
│   ├── index.html                # 入口 HTML
│   ├── manifest.json             # PWA 清单
│   ├── sw.js                     # Service Worker（离线缓存）
│   ├── css/
│   │   └── style.css             # 全局样式
│   └── js/
│       ├── app.js                # 主应用（路由、事件、UI 渲染）
│       ├── api.js                # 音源适配器、搜索、跨源回退、Subsonic
│       ├── player.js             # 播放器核心（队列、MediaSession、历史、回退）
│       ├── store.js              # 数据存储（localStorage ↔ D1 双模式）
│       ├── auth.js               # 登录/注册/登出 API
│       ├── visualizer.js         # Web Audio 可视化 + 10 段 EQ
│       └── lyrics.js             # LRC 歌词解析
├── functions/api/                # Cloudflare Pages Functions（后端）
│   ├── _middleware.js            # 全局中间件：解析 JWT → context.data.user
│   ├── _utils.js                 # 工具函数（JWT 签发/验证、PBKDF2 哈希、Cookie）
│   ├── auth/
│   │   ├── register.js           # POST 注册
│   │   ├── login.js              # POST 登录
│   │   ├── me.js                 # GET 当前用户
│   │   └── logout.js             # POST 登出（清除 Cookie）
│   ├── favorites.js              # GET/POST/DELETE 收藏
│   ├── playlists/
│   │   ├── index.js              # GET 列表 / POST 创建
│   │   ├── [id].js               # GET/PATCH/DELETE 单个歌单
│   │   └── [id]/songs.js         # POST/DELETE 歌单内歌曲
│   ├── proxy/[[route]].js        # 统一音源代理 + 边缘缓存
│   └── recognize.js              # POST 听歌识曲（→ AudD）
├── migrations/
│   └── 0001_init.sql             # D1 建表（users / favorites / playlists / playlist_songs）
└── wrangler.toml                 # Cloudflare Pages + D1 配置
```

---

## 架构一览

```
浏览器 (Vanilla JS SPA)
    │
    ├─ GET/POST  /api/auth/*        → JWT 鉴权 + D1 用户表
    ├─ GET/POST/DELETE /api/favorites → D1 收藏表
    ├─ GET/POST/PATCH/DELETE /api/playlists/* → D1 歌单表
    ├─ GET  /api/proxy/{source}/*   → 上游音源 API（走 Cache API 边缘缓存）
    ├─ GET  /api/proxy/stream?url=  → 音频/图片流代理（透传 Range 头）
    └─ POST /api/recognize          → AudD 听歌识曲
```

---

## 前置准备

1. 一个 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费套餐即可）
2. 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)：
   ```bash
   npm install -g wrangler
   ```
3. 用 Wrangler 登录 Cloudflare：
   ```bash
   wrangler login
   ```

---

## 方式一：Dashboard 部署（推荐，全程网页操作）

### 第一步：创建 D1 数据库

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **Workers & Pages** → 顶部切到 **D1** 标签
3. 点击 **Create database**
4. 数据库名称填 `airbeat-db`，点击 **Create**
5. 创建后，复制页面显示的 **Database ID**（类似 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）

### 第二步：执行建表 SQL

1. 在 D1 数据库详情页，点击 **Console** 标签
2. 将 `migrations/0001_init.sql` 的内容**完整粘贴**到 SQL 输入框
3. 点击 **Execute**（或按 `Ctrl+Enter`）
4. 看到 "✅ Success" 即完成。可以在左侧看到 `users`、`favorites`、`playlists`、`playlist_songs` 四张表

### 第三步：Fork 本仓库到你的 GitHub

1. 打开本仓库页面
2. 点击右上角 **Fork** → **Create fork**

### 第四步：创建 Pages 项目并连接仓库

1. Cloudflare Dashboard → **Workers & Pages** → 点击 **Create** → 选择 **Pages** 标签
2. 点击 **Connect to Git**
3. 连接你的 GitHub 账号，授权 Cloudflare Pages 访问仓库
4. 选择你 Fork 的 `AirBeat` 仓库，点击 **Begin setup**

### 第五步：构建设置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| **Production branch** | `main` | 主分支 |
| **Build command** | *留空* | 项目无需构建，纯静态文件 |
| **Build output directory** | `public` | 静态文件目录 |
| **Root directory** | *留空* | 如果仓库根目录就是 `public/functions/` 则留空；如果项目在子目录下则填写子目录名 |

点击 **Save and Deploy**。

### 第六步：绑定 D1 数据库

1. Pages 项目创建后，进入项目 → **Settings** → **Functions** 标签
2. 找到 **D1 database bindings**，点击 **Add binding**
3. 变量名填 `DB`，选择之前创建的 `airbeat-db`
4. 点击 **Save**

### 第七步：设置环境变量

1. 还是在 **Settings** → **Variables and Secrets** 标签
2. 点击 **Add** → **Secret**（敏感变量）或 **Plain text**（普通变量）

| 变量名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `JWT_SECRET` | Secret | **必填** | 随机长字符串，用于签发 JWT Token。建议用 `openssl rand -hex 32` 生成，或用任意 64 位以上随机字符 |
| `JAMENDO_CLIENT_ID` | Secret | 推荐 | [Jamendo 开发者门户](https://devportal.jamendo.com/) 免费注册应用获取，不填则 Jamendo 音源不可用 |
| `AUDD_KEY` | Secret | 可选 | [AudD](https://audd.io/) 免费申请，用于听歌识曲功能 |

### 第八步：重新部署

1. 进入 **Deployments** 标签
2. 点击最新部署右侧的 **⋮** → **Retry deployment**
3. 等待几十秒，看到 "✅ Success" 即部署完成
4. 访问 `https://<你的项目名>.pages.dev` 即可使用

> **为什么不直接用首次部署？** 首次部署时 D1 绑定和环境变量尚未配置，Functions 会因缺少 `JWT_SECRET` 报错。重新部署让配置生效。

### 后续更新

每次推送代码到 `main` 分支，Cloudflare Pages 自动构建部署，无需手动操作。

---

## 方式二：Wrangler CLI 部署（适合命令行用户）

### 第一步：克隆仓库

```bash
git clone https://github.com/821920046/AirBeat.git
cd AirBeat
```

### 第二步：安装依赖

本项目无 npm 依赖，只需安装 Wrangler CLI：

```bash
npm install -g wrangler
wrangler login
```

### 第三步：创建 D1 数据库

```bash
wrangler d1 create airbeat-db
```

输出示例：

```
✅ Successfully created DB 'airbeat-db' in region EEUR
Created a new database with the following ID: 3f8a9b2c-1d4e-5f6a-7b8c-9d0e1f2a3b4c
```

把输出的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "airbeat-db"
database_id = "3f8a9b2c-1d4e-5f6a-7b8c-9d0e1f2a3b4c"  # ← 替换为你的
```

### 第四步：建表

```bash
wrangler d1 execute airbeat-db --remote --file=./migrations/0001_init.sql
```

看到 `✅ Executed` 即完成。

### 第五步：设置环境变量

创建 `.dev.vars` 文件（本地开发用，不要提交到 Git）：

```bash
# .dev.vars
JWT_SECRET=your-random-secret-at-least-64-chars
JAMENDO_CLIENT_ID=your-jamendo-client-id
AUDD_KEY=your-audd-key
```

生产环境变量通过 Wrangler 推送：

```bash
echo "your-jwt-secret" | wrangler secret put JWT_SECRET
echo "your-jamendo-id" | wrangler secret put JAMENDO_CLIENT_ID
echo "your-audd-key" | wrangler secret put AUDD_KEY
```

### 第六步：部署

```bash
wrangler pages deploy public
```

部署完成后会输出 URL：`https://<项目名>.pages.dev`

---

## 本地开发

```bash
# 1. 创建本地 D1 数据库并建表（只需一次）
wrangler d1 execute airbeat-db --local --file=./migrations/0001_init.sql

# 2. 创建 .dev.vars（只需一次）
echo JWT_SECRET=dev-secret > .dev.vars
echo JAMENDO_CLIENT_ID=your-jamendo-id >> .dev.vars

# 3. 启动开发服务器
wrangler pages dev public
```

打开 `http://localhost:8788` 即可调试。

> - 本地 D1 数据存储在 `.wrangler/state/` 目录，已加入 `.gitignore`
> - 函数热更新：修改 `functions/api/` 下文件后自动加载
> - 前端热更新：修改 `public/` 下文件后刷新浏览器即可

---

## 自定义音源配置

### 普通 API 音源

在站内「🧩 音源」→「添加自定义音源」：

| 字段 | 必填 | 说明 |
|------|------|------|
| 音源名称 | 是 | 显示名称 |
| 搜索接口 URL | 是 | 用 `{q}` 代表搜索关键词，例：`https://api.example.com/search?keyword={q}` |
| 结果列表字段路径 | 否 | JSON 中结果数组的路径，如 `data.songs`（用 `.` 分隔嵌套），返回本身就是数组则留空 |
| ID 字段 | 否 | 歌曲唯一标识字段，如 `id` |
| 歌名字段 | 是 | 如 `name` |
| 歌手字段 | 否 | 如 `artist.name` |
| 封面字段 | 否 | 如 `album.coverUrl` |
| 音频直链字段 | 是 | 如 `url` |
| 时长字段 | 否 | 秒数，如 `duration` |
| 榜单 URL | 否 | 首页"发现"用 |
| 榜单列表字段路径 | 否 | 同上 |
| 自定义请求头 | 否 | 一行一个，格式 `Key: Value`，如 `Authorization: Bearer xxx` |
| 每页数量 | 否 | 支持 `{page}`/`{limit}`/`{offset}` 占位符 |

### Subsonic / Navidrome 音源

如果你的 NAS 或服务器上部署了 Navidrome / Airsonic / Gonic 等 Subsonic 兼容服务：

1. 音源类型填 `subsonic`
2. 填写 Subsonic 服务器地址（如 `https://music.your-domain.com`）
3. 填写用户名和密码
4. 保存后在发现/搜索页就能看到你的自建曲库

---

## 音源列表

| 音源 | 类型 | 说明 | 需要配置 |
|------|------|------|------------|
| Jamendo | CC 授权曲库 | 70 万+独立音乐人作品 | `JAMENDO_CLIENT_ID` |
| Audius | 独立音乐 | Web3 音乐平台 | 无 |
| Deezer | 30s 试听 | 全球最大流媒体之一 | 无 |
| Internet Archive | 公有领域 | 历史录音、古典等 | 无 |
| Radio Browser | 全球电台 | 3 万+在线广播电台 | 无 |
| **Spotify** | 全球流媒体（A类） | 全球最大流媒体，30s preview，无 preview 时自动跨源回退 | `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` |
| **Last.fm** | 音乐图谱（A类） | 全球最大音乐社交平台，元数据 + 跨源回退 | `LASTFM_API_KEY` |
| **MusicBrainz** | 开放数据库（A类） | 开放音乐数据库，无需 Key，用作元数据补全 | 无 |
| **JioSaavn** | 完整播放源（B类） | 提供完整音频直链，印度曲库为主 | 无 |
| **网易云音乐** | 中文曲库（B类，非官方） | 中文曲库丰富，无直链自动跨源回退 | 无 |
| **QQ音乐** | 中文曲库（B类，非官方） | 中文曲库最大，无直链自动跨源回退 | 无 |
| 自定义 API | 用户自定义 | 任何 REST API | 按需 |
| Subsonic | 自建曲库 | Navidrome/Airsonic/Gonic 等 | 服务端地址+账号 |

---

## 环境变量参考

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `JWT_SECRET` | **是** | — | JWT 签名密钥，至少 32 字符随机字符串 |
| `JAMENDO_CLIENT_ID` | 推荐 | — | Jamendo API 密钥，不填则 Jamendo 不可用 |
| `AUDD_KEY` | 可选 | — | AudD 听歌识曲 API 密钥 |
| `SPOTIFY_CLIENT_ID` | 可选 | — | Spotify App Client ID，[开发者控制台](https://developer.spotify.com/dashboard) 免费注册获取 |
| `SPOTIFY_CLIENT_SECRET` | 可选 | — | Spotify App Client Secret，与 Client ID 配套 |
| `LASTFM_API_KEY` | 可选 | — | Last.fm API Key，[申请地址](https://www.last.fm/api/account/create) 免费注册获取 |

---

## 常见问题

### 登录/注册报 500 错误？
检查 Cloudflare Dashboard → Settings → Variables 中 `JWT_SECRET` 是否已配置。如果刚添加，需要 **重新部署** 才能生效。

### 搜索没有结果？
- 检查 Jamendo 是否配置：如果配置了 `JAMENDO_CLIENT_ID` 但 Jamendo 仍不工作，确认密钥是否正确（Jamendo 免费注册即可）
- 尝试在「🧩 音源」页启用更多音源
- iTunes/Deezer 只有 30 秒试听，歌曲播放完毕后会自动触发跨源回退

### 听歌识曲不工作？
- 需要 HTTPS：Cloudflare Pages 默认支持
- 需要配置 `AUDD_KEY`：[AudD 官网](https://audd.io/) 免费注册
- 浏览器需要授权麦克风权限

### 如何让 PWA 生效？
- 确保用 HTTPS 访问（Pages 默认支持）
- 浏览器地址栏会显示安装图标（桌面 Chrome/Edge）或"添加到主屏幕"（手机 Safari）
- 静态资源（HTML/CSS/JS/图标）会被 Service Worker 缓存，离线也能打开

### 数据存储在哪里？
- **未登录**：收藏、歌单、播放历史、音源配置全部在浏览器 localStorage
- **已登录**：收藏、歌单存 Cloudflare D1；音源配置、播放历史仍在本地
- **登录时**：localStorage 数据自动合并到服务端（不会丢失）

### 怎么备份数据？
在「📚 我的歌单」页点击「📤 导出歌单」，所有歌单和歌曲信息导出为一个 JSON 文件。换设备或重装后点「📥 导入歌单」即可恢复。

---

## 版权说明

本项目仅接入**合法免费音源**（CC 授权 / 公有领域 / 官方免费 API / 官方试听接口）。

请勿接入未授权的商业平台接口。用户自接音源的责任自负。

AirBeat 本身为 MIT License。
