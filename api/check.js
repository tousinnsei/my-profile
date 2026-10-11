/* ============================================================
   my-profile — Vercel Serverless 登录校验函数
   POST /api/check  { password }
   与 tools/server.mjs 的 /api/check 使用相同契约。
   服务端密码从环境变量 ADMIN_PASSWORD 读取，绝不进前端。
   ============================================================ */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: '仅支持 POST' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    return new Response(JSON.stringify({ ok: false, error: '服务器尚未配置 ADMIN_PASSWORD 环境变量，请先在 Vercel 控制台配置（见交付报告）。' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  let c;
  try { c = await req.json(); } catch { c = {}; }
  const ok = String(c.password || '') === adminPassword;
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 401, headers: { 'Content-Type': 'application/json' },
  });
}
