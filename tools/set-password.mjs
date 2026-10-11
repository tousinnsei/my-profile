#!/usr/bin/env node
/* ============================================================
   my-profile — 设置本地 CMS 管理员密码
   生成 cms-config.local.json（含密码 SHA-256 哈希，已被 gitignore）。
   用法:  node tools/set-password.mjs
   ============================================================ */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'cms-config.local.json');

function sha256(s) { return createHash('sha256').update(String(s)).digest('hex'); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function main() {
  process.stdout.write('\n  设置本地 CMS 管理员密码（用于 admin.html 登录与 /api/publish 发布授权）\n\n');
  let p1 = await ask('  请输入新密码: ');
  if (!p1) { console.log('  密码不能为空，已取消。'); process.exit(1); }
  let p2 = await ask('  再次输入确认: ');
  if (p1 !== p2) { console.log('  两次输入不一致，已取消。'); process.exit(1); }
  await mkdir(__dirname, { recursive: true });
  const cfg = { passwordHash: sha256(p1), updatedAt: new Date().toISOString() };
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log(`\n  已写入 ${path.relative(process.cwd(), CONFIG_FILE)}`);
  console.log('  此文件已被 .gitignore 忽略，不会被提交到仓库。\n');
  rl.close();
}
main();
