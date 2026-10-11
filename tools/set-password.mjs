#!/usr/bin/env node
/* ============================================================
   my-profile — 设置本地 CMS 管理员密码
   生成 cms-config.local.json（scrypt+salt 哈希，已被 gitignore）。
   用法:
     交互式:  node tools/set-password.mjs
     非交互:  CMS_ADMIN_NEW_PASSWORD='xxx' node tools/set-password.mjs
   ============================================================ */
import { scryptSync, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'cms-config.local.json');

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

async function main() {
  // 非交互模式：从环境变量读取（供脚本安全设置，不回显到日志）
  let p1 = process.env.CMS_ADMIN_NEW_PASSWORD || '';
  if (p1) {
    if (p1.length < 12) { console.error('非交互密码长度必须 >= 12 位，已取消。'); process.exit(1); }
  } else {
    process.stdout.write('\n  设置本地 CMS 管理员密码（用于 admin.html 登录与 /api/publish 发布授权）\n\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((r) => rl.question(q, r));
    p1 = await ask('  请输入新密码（至少 12 位）: ');
    if (!p1) { console.log('  密码不能为空，已取消。'); process.exit(1); }
    const p2 = await ask('  再次输入确认: ');
    rl.close();
    if (p1 !== p2) { console.log('  两次输入不一致，已取消。'); process.exit(1); }
  }

  const { salt, hash } = hashPassword(p1);
  const cfg = { salt, hash, updatedAt: new Date().toISOString() };
  await mkdir(__dirname, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log(`\n  已写入 ${path.relative(process.cwd(), CONFIG_FILE)}（scrypt+salt，已被 .gitignore 忽略）`);
}
main();
