/* ============================================================
   my-profile — Vercel Serverless 发布函数
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

const DATA_TARGETS = {
  projects: { path: 'data/projects.json', type: 'json' },
  updates:  { path: 'data/updates.json', type: 'json' },
  awards:   { path: 'data/awards.json', type: 'json' },
  profile:  { path: 'data/profile.json', type: 'json' },
};

function serializeProjectsJs(data) {
  // 由规范 JSON 确定性生成 data/projects.js（前端仍以 script 加载）
  return '/* 全プロジェクトデータ（4言語対応） — my-profile · CMS管理\n   生成文件：由 data/projects.json 生成，请勿手工编辑 */\nwindow.PROJECTS_DATA = ' +
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

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: '仅支持 POST' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = process.env.GH_TOKEN || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  // /api/check — 登录校验（与发布共用同一密码）
  if (new URL(req.url, 'http://localhost').pathname === '/api/check') {
    let c;
    try { c = await req.json(); } catch { c = {}; }
    if (!token || !adminPassword) {
      return new Response(JSON.stringify({ ok: false, error: '服务器尚未配置 GH_TOKEN / ADMIN_PASSWORD' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
    const ok = String(c.password || '') === adminPassword;
    return new Response(JSON.stringify({ ok }), {
      status: ok ? 200 : 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!token || !adminPassword) {
    return new Response(JSON.stringify({
      ok: false,
      error: '服务器尚未配置 GH_TOKEN / ADMIN_PASSWORD 环境变量，请先在 Vercel 控制台配置（见交付报告）。',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let payload;
  try { payload = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: '请求体不是有效 JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 密码校验（服务端，防时序用简单字符串比较即可——hash 比对更好）
  const safe = (a, b) => { // 常量时间比较
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };
  if (!safe(String(payload.password || ''), adminPassword)) {
    return new Response(JSON.stringify({ ok: false, error: '密码错误' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const entries = prepareDataFiles(payload.data || {});
    const message = String(payload.commitMessage || `CMS 内容更新 (${new Date().toISOString()})`);

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

    return new Response(JSON.stringify({
      ok: true,
      commit: commit.sha,
      branch: BRANCH,
      files: entries.map((e) => e.path),
      deployTriggered: true,
      message,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
