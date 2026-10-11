/* ============================================================
   my-profile — Vercel Serverless 登录校验函数（经典 (req,res) 风格）
   POST /api/check  { password }
   服务端密码从环境变量 ADMIN_PASSWORD 读取，绝不进前端。
   ============================================================ */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Content-Type', 'application/json').json({ ok: false, error: '仅支持 POST' });
    return;
  }
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    res.status(500).setHeader('Content-Type', 'application/json').json({
      ok: false, error: '服务器尚未配置 ADMIN_PASSWORD 环境变量，请先在 Vercel 控制台配置（见交付报告）。',
    });
    return;
  }
  let c;
  try { c = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch { c = {}; }
  const ok = String(c.password || '') === adminPassword;
  res.status(ok ? 200 : 401).setHeader('Content-Type', 'application/json').json({ ok });
}
