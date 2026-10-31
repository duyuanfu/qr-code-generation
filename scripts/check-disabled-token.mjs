/**
 * 安全自查：账号被禁用后，此前签发的 JWT 是否还有效？
 *
 * 预期（安全）：禁用后旧 token 立即失效，所有需要身份的接口都返回 401。
 * 实际行为以输出为准。
 *
 * 用法：ADMIN_PASSWORD=xxx node scripts/check-disabled-token.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'duyuanfu@yeah.net';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

async function j(method, path, { t, b } = {}) {
  const h = {};
  if (t) h.Authorization = `Bearer ${t}`;
  if (b !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method,
    headers: h,
    body: b !== undefined ? JSON.stringify(b) : undefined,
  });
  const text = await r.text();
  try {
    return { status: r.status, ...JSON.parse(text) };
  } catch {
    return { status: r.status };
  }
}

const pw = ADMIN_PASSWORD;
if (!pw) {
  console.error('缺少 ADMIN_PASSWORD');
  process.exit(1);
}

const email = `disabled_token_${Date.now()}@example.com`;
const reg = await j('POST', '/api/auth/register', { b: { email, password: 'Test123456' } });
const userToken = reg.data?.token;
const uid = reg.data?.user?.id;

const admin = await j('POST', '/api/auth/login', { b: { email: ADMIN_EMAIL, password: pw } });
const adminToken = admin.data?.token;

await j('POST', `/api/admin/users/${uid}/toggle-status`, { t: adminToken });
console.log(`账号 ${email} 已被管理员禁用\n`);

const me = await j('GET', '/api/auth/me', { t: userToken });
console.log(`1) GET  /api/auth/me          -> ${me.status} code=${me.code} ${me.message || ''}`);

const order = await j('POST', '/api/order/create', { t: userToken, b: { actionType: 'static_export' } });
console.log(`2) POST /api/order/create    -> ${order.status} success=${order.success} ${order.message || ''}`);

const qr = await j('POST', '/api/qr/dynamic', {
  t: userToken,
  b: { contentType: 'image', title: '禁用用户测试', mediaUrls: [] },
});
console.log(`3) POST /api/qr/dynamic      -> ${qr.status} success=${qr.success} ${qr.message || ''}`);

// 恢复
await j('POST', `/api/admin/users/${uid}/toggle-status`, { t: adminToken });

const leaked = order.success === true || qr.success === true;
console.log(
  `\n结论：${leaked ? '❌ 禁用后旧 token 仍可访问受保护接口（需修复）' : '✅ 禁用后旧 token 已被拦截'}`
);
