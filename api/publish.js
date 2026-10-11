/* ============================================================
   my-profile — Vercel Serverless 发布函数（经典 (req,res) 风格，兼容全部 Vercel Node 运行时）
   ------------------------------------------------------------
   与 tools/server.mjs 的 /api/publish 使用相同请求/响应契约。
   通过 GitHub API（Git Database）在 main 分支上原子提交多个
   数据文件，触发 Vercel 自动部署。

   安全：
   - 管理员密码从环境变量 ADMIN_PASSWORD 读取（服务端校验）
   - GitHub 写入令牌从环境变量 GH_TOKEN 读取（服务端，绝不进前端）
   - 从不使用 --force 覆盖远程；仅追加提交

   部署后环境变量（Vercel Dashboard → Settings → Environment）:
     ADMIN_PASSWORD = 管理员登录/发布密码
     GH_TOKEN       = GitHub Personal Access Token（repo 权限）

   调用契约（POST /api/publish）:
     { password, commitMessage, data: { projects, updates, awards, profile } }
   ============================================================ */

const REPO = 'tousinnsei/my-profile';
const BRANCH = 'main';
const BASE = 'https://api.github.com';

// 简单失败限速：每实例最佳努力
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { fails: 0, first: now };
  if (now - rec.first > 60000) { rec.fails = 0; rec.first = now; }
  rec.fails += 1;
  attempts.set(ip, rec);
  return rec.fails > 10;
}

const DATA_TARGETS = {
  projects: { path: 'data/projects.json', type: 'json' },
  updates:  { path: 'data/updates.json', type: 'json' },
  awards:   { path: 'data/awards.json', type: 'json' },
  profile:  { path: 'data/profile.json', type: 'json' },
};

function serializeProjectsJs(data) {
  // 由规范 JSON 确定性生成 data/projects.js（前端仍以 script 加载）
  return '/* \u5168\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u30c7\u30fc\u30bf\uff084\u8a00\u8a9e\u5bfe\u5fdc\uff09 \u2014 my-profile \u00b7 CMS\u7ba1\u7406\n   \u751f\u6210\u6587\u4ef6\uff1a\u7531 data/projects.json \u751f\u6210\uff0c\u8bf7\u52ff\u624b\u5de5\u7f16\u8f91 */\nwindow.PROJECTS_DATA = ' +
    JSON.stringify(data, null, 2) + ';\n';
}

async function gh(token, url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'my-profile-cms',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text || res.statusText;
    throw new Error(`GitHub API ${res.status}: ${msg}`);
  }
  return json;
}

function prepareDataFiles(data) {
  const entries = [];
  for (const key of Object.keys(DATA_TARGETS)) {
    if (data && data[key] == null) continue;
    const target = DATA_TARGETS[key];
    entries.push({ path: target.path, content: JSON.stringify(data[key], null, 2) + '\n' });
  }
  if (!entries.length) throw new Error('发布数据中没有可写入的内容');

  // 若包含 projects，追加生成 data/projects.js（前端 script 加载）
  if (data && data.projects != null) {
    entries.push({ path: 'data/projects.js', content: serializeProjectsJs(data.projects) });
  }
  return entries;
}

function json(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json').json(obj);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: '仅支持 POST' });
  }

  const token = process.env.GH_TOKEN || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  // /api/check — 登录校验（与发布共用同一密码）
  // （独立 /api/check 函数见 api/check.js；此处保留以兼容本地 server.mjs 单入口路由）
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/api/check') {
    if (!adminPassword) {
      return json(res, 500, { ok: false, error: '服务器尚未配置 ADMIN_PASSWORD 环境变量，请先在 Vercel 控制台配置（见交付报告）。' });
    }
    let c;
    try { c = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch { c = {}; }
    const ok = String(c.password || '') === adminPassword;
    return json(res, ok ? 200 : 401, { ok });
  }

  if (!token || !adminPassword) {
    return json(res, 500, {
      ok: false,
      error: '服务器尚未配置 GH_TOKEN / ADMIN_PASSWORD 环境变量，请先在 Vercel 控制台配置（见交付报告）。',
    });
  }

  let payload;
  try { payload = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch {
    return json(res, 400, { ok: false, error: '请求体不是有效 JSON' });
  }

  // 密码校验（服务端，常量时间比较）
  const safe = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };
  if (!safe(String(payload.password || ''), adminPassword)) {
    const ip = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'unknown';
    if (rateLimited(ip)) {
      return json(res, 429, { ok: false, error: '尝试过于频繁，请稍后再试' });
    }
    return json(res, 401, { ok: false, error: '密码错误' });
  }

  try {
    const entries = prepareDataFiles(payload.data || {});
    const message = String(payload.commitMessage || `CMS \u5185\u5bb9\u66f4\u65b0 (${new Date().toISOString()})`);

    // 1) 取 main 分支当前引用
    const ref = await gh(token, `${BASE}/repos/${REPO}/git/ref/heads/${BRANCH}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await gh(token, `${BASE}/repos/${REPO}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    // 2) 为每个文件创建 blob
    const treeEntries = [];
    for (const e of entries) {
      const blob = await gh(token, `${BASE}/repos/${REPO}/git/blobs`, {
        method: 'POST',
        body: { content: Buffer.from(e.content, 'utf8').toString('base64'), encoding: 'base64' },
      });
      treeEntries.push({ path: e.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // 3) 创建新 tree
    const tree = await gh(token, `${BASE}/repos/${REPO}/git/trees`, {
      method: 'POST',
      body: { base_tree: baseTreeSha, tree: treeEntries },
    });

    // 4) 创建 commit
    const commit = await gh(token, `${BASE}/repos/${REPO}/git/commits`, {
      method: 'POST',
      body: { message, tree: tree.sha, parents: [baseCommitSha] },
    });

    // 5) 更新 main 分支引用（普通更新，非 force）
    await gh(token, `${BASE}/repos/${REPO}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      body: { sha: commit.sha, force: false },
    });

    return json(res, 200, {
      ok: true,
      commit: commit.sha,
      branch: BRANCH,
      files: entries.map((e) => e.path),
      deployTriggered: true,
      message,
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
  }
}
