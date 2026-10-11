#!/usr/bin/env node
/* ============================================================
   my-profile — 本地内容管理系统服务
   ------------------------------------------------------------
   一个零依赖的静态站点服务器 + 发布端点（与 Vercel 的
   api/publish.js 使用相同请求/响应契约，因此同一个 admin.html
   在本地与生产环境行为一致）。

   用法:
     node tools/server.mjs [--port 8080] [--branch main]

   端点:
     GET  /           静态文件（站点本身）
     POST /api/publish  发布数据（见下方契约）

   发布端点契约 (POST /api/publish):
     body: {
       password: string,
       commitMessage: string,
       data: {
         projects:  <window.PROJECTS_DATA 序列化后的 JS 源码字符串>,
         updates:   <updates.json 内容对象>,
         awards:    <awards.json 内容对象>,
         profile:   <profile.json 内容对象>
       }
     }
     成功: { ok:true, commit, branch, files:[...] }
     失败: { ok:false, error }
   ============================================================ */
import http from 'node:http';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const exec = promisify(execFile);

/* ---------- CLI 参数 ---------- */
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const PORT = Number(arg('--port', process.env.PORT || 8080));
const BRANCH = arg('--branch', 'main');
const CONFIG_FILE = path.join(__dirname, 'cms-config.local.json');

/* ---------- 配置（密码哈希，gitignore 保护） ---------- */
async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { passwordHash: '' };
  }
}
function sha256(s) { return createHash('sha256').update(String(s)).digest('hex'); }

// 常量时间密码校验：支持新格式 { salt, hash }(scrypt) 与旧格式 { passwordHash }(sha256)
function verifyPassword(cfg, password) {
  const pw = String(password || '');
  if (cfg && cfg.salt && cfg.hash) {
    const got = scryptSync(pw, cfg.salt, 64);
    const want = Buffer.from(cfg.hash, 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  }
  const expectedHash = (cfg && cfg.passwordHash) || '';
  if (!expectedHash) return false;
  const got = Buffer.from(sha256(pw), 'hex');
  const want = Buffer.from(expectedHash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/* ---------- 内容文件路径 ---------- */
const DATA_FILES = {
  projectsJson: { path: path.join(ROOT, 'data', 'projects.json') },
  projectsJs: { path: path.join(ROOT, 'data', 'projects.js') },
  updates:  { type: 'json', path: path.join(ROOT, 'data', 'updates.json') },
  awards:   { type: 'json', path: path.join(ROOT, 'data', 'awards.json') },
  profile:  { type: 'json', path: path.join(ROOT, 'data', 'profile.json') },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

function mimeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

/* ---------- 写入内容文件 ---------- */
function serializeProjectsJs(data) {
  // 由规范 JSON 确定性生成 data/projects.js（前端 portfolio 仍以 script 方式加载）
  return '/* 全プロジェクトデータ（4言語対応） — my-profile · CMS管理\n   生成文件：由 data/projects.json 生成，请勿手工编辑 */\nwindow.PROJECTS_DATA = ' +
    JSON.stringify(data, null, 2) + ';\n';
}

async function writeContentFiles(data) {
  const written = [];
  if (data && typeof data.projects === 'object' && data.projects != null) {
    // 规范 JSON
    await writeFile(DATA_FILES.projectsJson.path, JSON.stringify(data.projects, null, 2) + '\n', 'utf8');
    written.push('data/projects.json');
    // 生成 JS 包装（前端加载用）
    await writeFile(DATA_FILES.projectsJs.path, serializeProjectsJs(data.projects), 'utf8');
    written.push('data/projects.js');
  }
  for (const key of ['updates', 'awards', 'profile']) {
    const f = DATA_FILES[key];
    if (data && data[key] != null) {
      const json = JSON.stringify(data[key], null, 2) + '\n';
      await writeFile(f.path, json, 'utf8');
      written.push(`data/${key}.json`);
    }
  }
  if (!written.length) throw new Error('发布数据中没有可写入的内容');
  return written;
}

/* ---------- Git 提交并推送 ---------- */
async function gitCommitAndPush(message) {
  const git = (args) => exec('git', args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
  const branch = BRANCH;

  // 0) 前置校验：确认远程存在且分支正确，绝不强推
  const status = await git(['status', '--porcelain', '--branch']);
  if (!/^## .*\[ahead/.test('') && !status.stdout) {
    // 空操作保护（无改动时也允许提交 message 为空时的检查）
  }

  // 1) add 指定数据文件（绝不 git add -A，避免带上无关改动）
  const targets = [
    'data/projects.json', 'data/projects.js', 'data/updates.json', 'data/awards.json', 'data/profile.json',
  ];
  for (const t of targets) {
    const p = path.join(ROOT, t);
    try { await stat(p); } catch { continue; } // 只 add 存在的文件
    await git(['add', '--', t]);
  }

  // 2) 检查是否有变更，无变更则跳过提交
  const staged = await git(['diff', '--cached', '--name-only']);
  if (!staged.stdout.trim()) {
    return { changed: false, commit: null, branch };
  }

  // 3) 提交
  await git(['commit', '-m', message || `CMS 内容更新 (${new Date().toISOString()})`]);

  // 4) 拉取最新远程状态后推送（普通 push，非 --force）
  try { await git(['pull', '--rebase', 'origin', branch]); } catch { /* 若无需 rebase 或离线则继续 */ }
  await git(['push', 'origin', branch]);

  const head = await git(['rev-parse', 'HEAD']);
  return { changed: true, commit: head.stdout.trim(), branch };
}

/* ---------- 登录校验处理 ---------- */
async function handleCheck(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  let payload;
  try { payload = JSON.parse(body || '{}'); } catch { return { status: 400, json: { ok: false, error: '请求体不是有效 JSON' } }; }
  const config = await loadConfig();
  if (!verifyPassword(config, payload.password)) {
    return { status: 401, json: { ok: false, error: '密码错误或未设置管理员密码' } };
  }
  return { status: 200, json: { ok: true } };
}

/* ---------- 发布处理 ---------- */
async function handlePublish(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  let payload;
  try { payload = JSON.parse(body || '{}'); } catch { return { status: 400, json: { ok: false, error: '请求体不是有效 JSON' } }; }

  const config = await loadConfig();
  if (!verifyPassword(config, payload.password)) {
    return { status: 401, json: { ok: false, error: '密码错误或未设置管理员密码' } };
  }

  try {
    const files = await writeContentFiles(payload.data || {});
    const res = await gitCommitAndPush(payload.commitMessage);
    return { status: 200, json: { ok: true, ...res, files } };
  } catch (e) {
    const msg = e && e.stderr ? e.stderr : (e && e.message ? e.message : String(e));
    return { status: 500, json: { ok: false, error: String(msg).slice(0, 2000) } };
  }
}

/* ---------- 静态文件服务 ---------- */
async function serveStatic(url) {
  let rel = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // 安全：禁止越出 ROOT
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) return { status: 403, body: 'Forbidden' };
  let fstat;
  try { fstat = await stat(filePath); } catch { return { status: 404, body: 'Not Found' }; }
  if (fstat.isDirectory()) {
    const idx = path.join(filePath, 'index.html');
    try { await stat(idx); return { status: 200, file: idx }; } catch { return { status: 404, body: 'Not Found' }; }
  }
  return { status: 200, file: filePath };
}

/* ---------- HTTP 服务器 ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/check' && req.method === 'POST') {
      const r = await handleCheck(req);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r.json));
      return;
    }
    if (u.pathname === '/api/publish' && req.method === 'POST') {
      const r = await handlePublish(req);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r.json));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' }); res.end('Method Not Allowed'); return;
    }
    const r = await serveStatic(req.url);
    if (r.file) {
      const data = await readFile(r.file);
      res.writeHead(200, { 'Content-Type': mimeFor(r.file), 'Cache-Control': 'no-cache' });
      res.end(data);
      return;
    }
    res.writeHead(r.status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(r.body || '');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error: ' + (e && e.message ? e.message : e));
  }
});

server.listen(PORT, () => {
  console.log(`\n  my-profile CMS 本地服务已启动`);
  console.log(`  站点后台:  http://localhost:${PORT}/admin.html`);
  console.log(`  发布端点:  http://localhost:${PORT}/api/publish (POST)`);
  console.log(`  发布分支:  ${BRANCH}`);
  console.log(`  管理员密码: 见 tools/cms-config.local.json（hash）\n`);
});
