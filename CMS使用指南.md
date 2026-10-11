# 个人官网 CMS — 使用与维护指南

> 本系统于 2026-10-11 上线，将原纯静态官网升级为「数据驱动 + 一键发布」的成果管理系统。
> 日常维护**无需再编辑 HTML / JavaScript**。

---

## 一、日常发布（推荐主路径）

```bash
cd C:\Users\31488\Desktop\myProject\my-profile
npm run serve
```

打开浏览器访问：**http://localhost:8123/admin.html**

1. 输入管理员密码登录（当前为测试密码 `TestAdmin2026`，请尽快重置，见下）。
2. 左侧切换「成果 / 动态 / 获奖 / 个人资料」四个视图。
3. 「新增」填写表单（标题、分类、简介、日期、四语内容、排序、是否公开等）。
4. 「保存草稿」仅存本地不公开；「发布」把数据写入仓库并推送到 GitHub `main`。
5. Vercel 自动部署（约 1–2 分钟），正式站 https://www.ybhtkj.cn/ 即更新。

> 删除 / 发布 / 覆盖均有确认弹窗；草稿不会出现在公开网站。

### 重置管理员密码

```bash
npm run set-password
```
按提示输入新密码（哈希写入 `tools/cms-config.local.json`，已被 git 忽略，不会上传）。

---

## 二、线上后台（可选，需配置环境变量）

线上地址：**https://www.ybhtkj.cn/admin.html**

要在任意浏览器（不启动本地服务）直接登录并发布，需在 Vercel 控制台
（Settings → Environment Variables，Production 环境）配置两个变量：

| 变量 | 说明 | 如何获得 |
|---|---|---|
| `ADMIN_PASSWORD` | 后台登录/发布密码 | 你自己设定 |
| `GH_TOKEN` | GitHub Personal Access Token（`repo` 权限） | GitHub → Settings → Developer settings → Personal access tokens 生成 |

配置后 **Redeploy** 一次生效。未配置时线上后台返回明确 500 提示（不会伪造成功）。

> 若不配这两个变量，**不影响**本地发布路径（本地用你已缓存的 git 凭据直接 push）。

---

## 三、数据结构（都在 `data/` 目录）

| 文件 | 用途 | 是否手工编辑 |
|---|---|---|
| `projects.json` | 43 项成果（论文/软著/课题/企业等），四语 | **不要**手改，用后台 |
| `projects.js` | 由上面文件自动生成，前端加载 | 禁止手改 |
| `updates.json` | 首页「最新动态」 | 后台维护 |
| `awards.json` | about 页「获奖/荣誉」 | 后台维护 |
| `profile.json` | 个人简介/联系方式 | 后台维护 |
| `images-manifest.json` | 171 张图片清单（供后台选图） | 自动生成 |

---

## 四、备份与回滚

- **后台导出**：备份按钮下载全部数据 JSON。
- **Git 回滚**：预 CMS 检查点标签为 `backup/pre-cms`。
  - 查看历史：`git log --oneline`
  - 回滚到上线前：`git checkout backup/pre-cms`（只读查看）或 `git revert <commit>`（安全撤销）。
  - **禁止**使用 `git reset --hard` / `git clean -fd`。

---

## 五、常见问题

- **发布失败但数据还在？** 发布是"先写临时、确认 GitHub 提交成功"才推送。失败时后台会显示具体错误（网络/凭据/冲突），数据不丢。
- **手机端能用吗？** 后台在 ≤860px 时侧栏自动折叠为图标、表单单列；前台响应式断点 900/600px。
- **四语切换**：成果标题/简介可分别填日/中/英/韩；缺译时回退到日语。
- **图片**：放入 `images/` 目录后，后台选图下拉会从 `images-manifest.json` 读取。

---

## 六、技术架构（简版）

- 纯静态站 + 零依赖 Node 本地服务（`tools/server.mjs`）。
- 发布双实现：本地服务（用本机 git 凭据 push）+ Vercel serverless（`api/publish.js` + `api/check.js`，GitHub API 原子提交 main，从不 force push）。
- 管理员密码哈希存本地，**绝不**进入前端代码或仓库；写权限 Token 只在服务端。
- 无数据库、无付费服务、无 Node 后端常驻进程。
