# 周末兼职 · 大学生周末兼职撮合平台

轻量级本地化周末兼职撮合平台：大学生按距离/时间筛选岗位一键报名，商家直接发布周末班次快速招人。

## 技术栈

- 后端：Node.js + Express + **内置 SQLite（`node:sqlite`，零原生依赖）**
- 认证：Node 内置 `crypto`（scrypt 密码哈希 + HMAC 签名令牌）
- 前端：无构建静态 SPA（原生 ES Module，命名链路与后端一一对应）
- 部署：单容器，一键部署（Render / Railway / 任何支持 Docker 的平台）

> 说明：原方案推荐 Vercel + Railway 双部署。但本项目已收敛为**单体服务 + 文件型 SQLite**，Vercel 是无状态 Serverless、不持久化磁盘，不适合承载 SQLite。因此推荐 **Render / Railway / Fly.io** 这类「常驻进程 + 可挂载持久盘」的平台，一个 URL 同时托管 API 与前端。

## 命名转化链路（核心）

| 中文 | 实体 | 表名 | 前端 Store | 状态机 |
| --- | --- | --- | --- | --- |
| 学生 | Student | `students` | `useAuthStore` | — |
| 商家 | Merchant | `merchants` | `useAuthStore` | — |
| 岗位 | Job | `jobs` | `useJobStore` | draft→published→matched→completed→settled / cancelled |
| 报名 | Application | `applications` | `useApplicationStore` | pending→accepted→checked_in→finished / rejected / no_show / cancelled |
| 评价 | Review | `reviews` | `useReviewStore` | — |

调用链：`页面 → api/ 层 → 路由 → service → SQL`，全程命名一致。

## 已修复的架构 bug（要点）

1. 越权漏洞：`PATCH /api/applications` 加 RBAC（`authRequired` + `roleRequired`），学生不能给自己改状态。
2. 超卖竞态：满员判断改为事务内 `BEGIN IMMEDIATE` 原子校验 accepted 人数。
3. 重复报名：`applications` 加 `UNIQUE(job_id, student_id)`。
4. 登录无凭证：补 `passwordHash`（scrypt）+ 签名 token。
5. 签到无法校验：补 `checked_in_at / checkin_lat / checkin_lng` + Haversine 距离校验。
6. `JobStatus` 补回 `settled`；`blacklisted` 从 Application 移到 `students.blacklisted_at`。
7. 补全缺失的 `Review` 实体与评分聚合。
8. `GET /api/jobs` 补分类/关键词/排序筛选参数。
9. `checkinService` 补对应路由 `POST /api/applications/:id/checkin`。

## 本地运行

```bash
npm install
npm start          # 或 npm run dev（--watch 热重载）
# 打开 http://localhost:3000
```

冒烟测试（覆盖越权/重复报名/满员/GPS 等关键修复）：

```bash
npm start          # 先起服务
node server/src/smoke.test.js
```

演示账号（首次启动自动注入）：

| 角色 | 手机号 | 密码 |
| --- | --- | --- |
| 学生 | 13800000001 | 123456 |
| 商家 | 13800000002 | 123456 |

## 部署

### Render（推荐，免费）

1. 把本项目推到 GitHub（参考下方「推送到 GitHub」）。
2. 打开 [render.com](https://render.com) → 用 GitHub 登录 → New → **Blueprint** → 连接你的仓库。
3. Render 自动读取 `render.yaml`（Docker + 健康检查 + 自动生成 `SECRET`），点 Create 即可。
4. 部署完成后得到永久地址 `https://weekend-parttime.onrender.com`，`git push` 即可自动更新。

> ⚠️ **免费版数据说明**：Render 免费实例**没有持久磁盘**，容器文件系统是临时的，SQLite 会在「重新部署 / 实例休眠唤醒」时被清空。本应用会在空库启动时**自动注入演示数据**，所以每次打开都能看到内容，但**用户新产生的数据不长期保留**。
>
> 需要真实持久化时二选一：
> - 升级 Render 实例并挂 1GB 持久盘（约 $0.25/月），在环境变量加 `DB_PATH=/data/data.db`；
> - 或改用 Railway（免费 Volume）挂 `/data`。

### 推送到 GitHub

```bash
git init   # 若尚未初始化
git add -A
git commit -m "feat: 大学生周末兼职撮合平台"
git branch -M main
git remote add origin https://github.com/<你的用户名>/weekend-parttime.git
git push -u origin main
```

> 首次提交若提示缺少 git 身份，先执行：
> `git config --global user.name "你的名字"`、`git config --global user.email "你的邮箱"`。

### Railway（备选）

1. Railway → New Project → Deploy from GitHub repo，自动识别 `Dockerfile`。
2. 环境变量设 `SECRET`；挂一个 Volume 到 `/data` 并设 `DB_PATH=/data/data.db` 即可持久化。

### 环境变量

见 `.env.example`。生产环境务必设置 `SECRET` 为随机长字符串。
