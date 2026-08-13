# REP 进销存 —— 多端共享后端部署指南

本系统的"真正多人共用"由 `server/index.mjs` 实现：**一个 Node 服务同时托管前端页面和后端 API（同源）**，所有登录用户读写同一份中央数据库。无需 ICP 备案，部署到境外免费 Node 平台即可。

---

## 一、架构一句话
- 前端（React 构建产物 `dist/`）由 Node 服务直接托管。
- 业务数据（供应商/购买方/产品/零部件/订单/日志）通过 `/api/sync` 增量拉取+推送，所有端共享同一份数据。
- 登录与账号管理由服务端校验（密码 SHA-256 哈希，不存明文），首次启动自动写入两个管理员账号。
- 数据默认存于服务端文件 `data/db.json`（JSON，零依赖）。

默认管理员账号（可在「设置→账号管理」里改密码/增删）：
- `wanghuizhen` / `wanghuizhen123`
- `jinhuaqiang` / `jinhuaqiang123`

---

## 二、本地运行（验证用）
```bash
npm install
npm run build        # 产出 dist/
npm run server       # 启动后端+前端，默认端口 8787
# 浏览器打开 http://localhost:8787
```
登录即走服务端校验。任意一端改数据，其他端约 15 秒自动同步（或「设置→立即同步」）。

---

## 三、部署到 Render（境外免费，推荐）
> 前置：一个 GitHub 账号，把本目录推送到一个仓库。

1. 把整个项目推到 GitHub 仓库（含 `src/`、`server/`、`dist/`、`render.yaml`、`package.json`、`vite.config.ts`）。
2. 打开 https://render.com → 注册/登录（可用 GitHub 登录）。
3. New → **Blueprint** → 连接你的仓库 → Render 会自动读取 `render.yaml`。
4. 确认配置（Web 服务，免费档，区域选 `oregon` 等境外节点）→ 点 Create。
5. 等待构建完成（Build: `npm install && npm run build`；Start: `node server/index.mjs`）。
6. 得到形如 `https://rep-erp-xxxx.onrender.com` 的地址，**直接发给员工即可**。

首次访问说明：免费实例一段时间无访问会休眠，首次打开需等几秒唤醒。

### 数据持久化（重要）
免费实例的文件系统在重建/重启后会被清空，数据会丢失。两个办法：
- **A（最简单）**：在 Render 控制台给该服务挂载一个 **Disk（持久磁盘）**，并把环境变量 `DATA_DIR` 指向磁盘挂载路径（如 `/data`），服务器会把 `db.json` 写在那里，重启不丢。
- **B（兜底）**：定期在「设置→数据备份」导出 JSON 备份，重建后导入。

---

## 四、部署到 Railway（备选）
1. https://railway.app 用 GitHub 登录。
2. New Project → Deploy from GitHub repo。
3. 在 Settings 里把 Start Command 设为 `node server/index.mjs`，Build Command 设为 `npm install && npm run build`。
4. 生成域名后即可访问。

---

## 五、环境变量
| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 监听端口（平台自动注入） | 8787 |
| `DATA_DIR` | 数据存放目录 | `./data` |
| `CORS_ORIGIN` | 允许的前端来源，逗号分隔 | `*` |

前端无需单独配置后端地址：因为后端同源托管，前端直接访问 `/api/*`。若你把前后端分开部署（不同域名），可在「设置」右上角齿轮里填后端地址。

---

## 六、日常使用
- 任何人打开网址 → 用账号登录 → 看到的是同一套数据。
- 新增/修改/删除会自动同步给所有在线用户（约 15 秒）或手动「立即同步」。
- 「设置→账号管理」：新增员工账号、改密码、设管理员/只读、删除（需管理员）。
- 「设置→数据备份」：导出全量 JSON/Excel，灾备与迁移。

---

## 七、安全提示
- 登录态为 7 天有效 token，重启服务端会要求重新登录。
- 密码服务端哈希存储，不在客户端或数据库存明文。
- 传输层建议走 HTTPS（Render/Railway 默认提供）。
- 若要更强隔离（多企业/多门店独立数据），后续可把存储换成 Postgres（修改 `server/index.mjs` 的存储层即可，API 不变）。
