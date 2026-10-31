/**
 * 上传接口防护联调：登录校验 + 用户/IP 双维度限流。
 *
 * 覆盖：
 *   1. 匿名上传被 401 拦截（此前任何人都能往磁盘写文件）
 *   2. 登录后可正常上传
 *   3. 单账号高频上传触发 429，且带 Retry-After 头
 *   4. 换账号 + 换来源 IP 立即恢复（说明是按 key 分桶，不是全局熔断）
 *   5. 换账号但沿用已耗尽的来源 IP 仍被拒（说明 IP 维度独立生效）
 *
 * 第 4、5 条都通过伪造 X-Forwarded-For 实现。后端优先读该头的第一段，
 * 所以测试用的是 203.0.113.x（TEST-NET-3，专供文档示例，永远不会是真实地址），
 * 不会污染其它脚本使用真实 IP 的配额。
 *
 * 用法：
 *   ADMIN_PASSWORD=xxx node scripts/e2e-upload-guard.mjs
 *   BASE_URL=http://localhost:8080 node scripts/e2e-upload-guard.mjs
 */

const BASE = process.env.BASE_URL || 'http://localhost:8080';

const USER_BUCKET = Number(process.env.EXPECT_USER_PER_MIN || 30);
const IP_BUCKET = Number(process.env.EXPECT_IP_PER_MIN || 60);

/** 一次连打多少轮就能同时打穿两个桶 */
const BURST = IP_BUCKET + 2;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` -> ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function call(method, path, { token, body, form, ip } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text, retryAfter: res.headers.get('retry-after') };
}

/** 最小合法 PNG（1x1），能通过后缀白名单与魔数嗅探 */
function tinyPng() {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return Buffer.from(b64, 'base64');
}

function pngForm() {
  const fd = new FormData();
  fd.append('files', new Blob([tinyPng()], { type: 'image/png' }), 'guard.png');
  return fd;
}

async function register(label) {
  const email = `guard_${label}_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`;
  const r = await call('POST', '/api/auth/register', { body: { email, password: 'Test123456' } });
  return r.json?.data?.token || '';
}

async function main() {
  console.log(`\n[0] 服务可用性  ${BASE}`);
  {
    const r = await call('GET', '/api/payment/config');
    check('后端可访问', r.status === 200 && r.json?.success === true, `status=${r.status}`);
  }

  console.log('\n[1] 登录校验');
  {
    const anon = await call('POST', '/api/upload', { form: pngForm(), ip: '203.0.113.1' });
    check('匿名上传被拒绝（401）', anon.status === 401, `status=${anon.status} msg=${anon.json?.message || ''}`);
  }

  const tokenA = await register('a');
  const tokenB = await register('b');
  check('测试账号注册成功', !!tokenA && !!tokenB);

  console.log('\n[2] 登录后可正常上传');
  {
    const r = await call('POST', '/api/upload', { token: tokenA, form: pngForm(), ip: '203.0.113.10' });
    check(
      '登录用户上传成功',
      r.json?.success === true && /^\/uploads\/[a-f0-9]{64}\.png$/.test(r.json?.files?.[0]?.url || ''),
      r.json?.files?.[0]?.url || JSON.stringify(r.json),
    );
  }

  console.log(`\n[3] 单账号高频上传触发限流（用户桶 ${USER_BUCKET}/min，IP 桶 ${IP_BUCKET}/min）`);
  let rejected = 0;
  let accepted = 0;
  let sawRetryAfter = '';
  {
    for (let i = 0; i < BURST; i++) {
      const r = await call('POST', '/api/upload', { token: tokenA, form: pngForm(), ip: '203.0.113.10' });
      if (r.status === 429) {
        rejected++;
        if (!sawRetryAfter && r.retryAfter) sawRetryAfter = r.retryAfter;
      } else if (r.json?.success === true) {
        accepted++;
      }
    }
    check(`连续 ${BURST} 次上传出现 429 限流`, rejected > 0, `intercepted=${rejected} accepted=${accepted}`);
    check('放行次数不超过用户桶容量', accepted <= USER_BUCKET + 1, `accepted=${accepted}, 桶容量=${USER_BUCKET}`);
    check('429 响应带 Retry-After 头', !!sawRetryAfter, `Retry-After=${sawRetryAfter}s`);
  }

  console.log('\n[4] 限流按 key 分桶，不是全局熔断');
  {
    const fresh = await call('POST', '/api/upload', { token: tokenB, form: pngForm(), ip: '203.0.113.20' });
    check(
      '新账号 + 新来源 IP 立即可以上传',
      fresh.json?.success === true,
      `status=${fresh.status} msg=${fresh.json?.message || fresh.json?.error || ''}`,
    );
  }

  console.log('\n[5] IP 维度独立生效');
  {
    const sameIp = await call('POST', '/api/upload', { token: tokenB, form: pngForm(), ip: '203.0.113.10' });
    check(
      '新账号沿用已耗尽的上游 IP 仍被限流',
      sameIp.status === 429,
      `status=${sameIp.status} msg=${sameIp.json?.message || ''}`,
    );
  }

  console.log(`\n===== 结果：${passed} 通过 / ${failed} 失败 =====`);
  if (failed > 0) {
    console.log('失败项：');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('脚本异常：', err);
  process.exit(1);
});
