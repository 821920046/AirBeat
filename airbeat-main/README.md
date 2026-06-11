# AirBeat 在线音乐播放器

免费在线音乐播放器,基于 **Cloudflare Pages + Pages Functions + D1** 全家桶构建。

## 功能

- 多免费音源聚合搜索与播放:Jamendo / Audius / Internet Archive / iTunes(30s 试听)/ Deezer(30s 试听)/ Radio Browser 全球电台
- LRC 歌词同步(LRCLIB 自动匹配,逐行高亮 + 点击跳转)
- Web Audio 频谱可视化(柱状图 / 环形两种样式)
- 听歌识曲(麦克风录音,经 AudD 识别,需配置 AUDD_KEY)
- 自建用户鉴权(PBKDF2 加盐哈希 + JWT HttpOnly Cookie)
- 收藏、歌单(创建/重命名/删除/加歌/删歌)
- 未登录数据存 localStorage,登录后自动合并同步
- 玻璃拟态 UI,深色/浅色切换,移动端响应式

## 项目结构

```
public/                  前端静态站
functions/api/           Pages Functions 后端(/api/*)
migrations/0001_init.sql D1 建表
wrangler.toml            Pages + D1 配置
```

## 部署步骤(Cloudflare)

1. **创建 D1 数据库**
   ```bash
   npm i -g wrangler
   wrangler login
   wrangler d1 create airbeat-db
   ```
   把输出的 `database_id` 填入 `wrangler.toml`。

2. **执行建表迁移**
   ```bash
   wrangler d1 execute airbeat-db --remote --file=./migrations/0001_init.sql
   ```

3. **创建 Pages 项目**:Cloudflare Dashboard → Workers & Pages → Create → Pages → 连接 GitLab 选择本仓库。构建设置:无需构建命令,输出目录 `public`。

4. **绑定 D1**:Pages 项目 → Settings → Bindings → 添加 D1,变量名 `DB`,选择 `airbeat-db`。

5. **设置环境变量**(Settings → Variables and Secrets):
   | 变量 | 必填 | 说明 |
   |------|------|------|
   | `JWT_SECRET` | 是 | 随机长字符串,用于签发 JWT |
   | `JAMENDO_CLIENT_ID` | 推荐 | https://devportal.jamendo.com 免费申请 |
   | `AUDD_KEY` | 可选 | https://audd.io 免费申请,用于听歌识曲 |

6. **重新部署**(Deployments → Retry / 推送任意提交),访问 `https://<项目名>.pages.dev`。

> 听歌识曲需要 HTTPS 才能调用麦克风,Pages 默认 HTTPS,直接可用。

## 本地开发

```bash
wrangler d1 execute airbeat-db --local --file=./migrations/0001_init.sql
wrangler pages dev public
```

并在 `.dev.vars` 文件中写入 `JWT_SECRET=dev-secret` 等变量。

## 自定义音源

在站内「🧩 音源」页可以:

- 一键启用/停用任意内置音源
- 添加你自己的音乐源 API:填写搜索接口 URL(用 `{q}` 代表关键词)和返回 JSON 的字段映射(歌名/歌手/封面/音频直链等,嵌套字段用点号,如 `artist.name`)
- 自定义音源的接口请求与音频播放均经内置代理转发,自动解决 CORS 与混合内容问题
- 配置保存在浏览器 localStorage,增删改随时生效

## 版权说明

仅接入合法免费音源(CC 授权 / 公有领域 / 官方试听接口),请勿接入未授权的商业平台接口。
