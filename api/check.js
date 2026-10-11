/* ============================================================
   my-profile — Vercel Serverless 登录校验函数（经典 (req,res) 风格）
   POST /api/check  { password }
   服务端密码从环境变量 ADMIN_PASSWORD 读取，绝不进前端。
   安全：常量时间比较 + 失败限速（每实例最佳努力）。
   ============================================================ */

// 简单失败限速：同一来源短时间内多次失败则拒绝（Vercel 多实例下为每实例最佳努力）
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { fails: 0, first: now };
  if (now - rec.first > 60000) { rec.fails = 0; rec.first = now; }
  rec.fails += 1;
  attempts.set(ip, rec);
  return rec.fails > 10; // 每分钟同来源失败 >10 次则临时拒绝
}

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Content-Type', 'application/json').json({ ok: false, error: '仅支持 POST' });
    return;
  }
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    res.status(500).setHeader('Content-Type', 'application/json').json({
      ok: false, error: '服务器尚未配置 ADMIN_PASSWORD 环境变量，请先在 Vercel 控制台配置。',
    });
    return;
  }
  const ip = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'unknown';
  let c;
  try { c = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch { c = {}; }
  const ok = safeEqual(c.password, adminPassword);
  if (!ok && rateLimited(ip)) {
    res.status(429).setHeader('Content-Type', 'application/json').json({ ok: false, error: '尝试过于频繁，请稍后再试' });
    return;
  }
  res.status(ok ? 200 : 401).setHeader('Content-Type', 'application/json').json({ ok });
}
