/**
 * QR Studio 端到端联调脚本（对应 openspec tasks.md 5.5）
 *
 * 前置：后端已启动（默认 http://localhost:8080），MySQL 可用。
 * 用法：
 *   node scripts/e2e-smoke.mjs
 *   ADMIN_PASSWORD=xxx node scripts/e2e-smoke.mjs      # 管理员口令，默认从 application.yml 之外的渠道传入
 *   BASE_URL=http://localhost:8080 node scripts/e2e-smoke.mjs
 *
 * 只使用公开 HTTP 接口，不直连数据库。
 */

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'duyuanfu@yeah.net';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` -> ${detail}` : ''}`);
}

function bad(name, detail = '') {
  failed++;
  failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
  console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
}

function check(name, cond, detail = '') {
  cond ? ok(name, detail) : bad(name, detail);
}

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
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
    /* 非 JSON 响应 */
  }
  return { status: res.status, json, text };
}

/** 构造一个最小合法 PNG（1x1），用于验证上传白名单通过 */
function tinyPng() {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return Buffer.from(b64, 'base64');
}

function multipart(fileName, buffer, mime) {
  const fd = new FormData();
  fd.append('files', new Blob([buffer], { type: mime }), fileName);
  return fd;
}

async function main() {
  const stamp = Date.now();
  const userAEmail = `e2e_user_a_${stamp}@example.com`;
  const userBEmail = `e2e_user_b_${stamp}@example.com`;
  const pwd = 'Test123456';

  console.log(`\n[0] 服务可用性  ${BASE}`);
  {
    const r = await call('GET', '/api/payment/config');
    check('GET /api/payment/config 返回 200', r.status === 200 && r.json?.success === true, `status=${r.status}`);
  }

  console.log('\n[1] 用户注册与登录态');
  let tokenA = '';
  {
    const r = await call('POST', '/api/auth/register', { body: { email: userAEmail, password: pwd } });
    tokenA = r.json?.data?.token || '';
    check('普通用户 A 注册成功并下发 token', r.json?.success === true && !!tokenA, `role=${r.json?.data?.user?.role}`);

    const me = await call('GET', '/api/auth/me', { token: tokenA });
    check('GET /api/auth/me 能识别登录身份', me.json?.data?.email === userAEmail, me.json?.data?.email);

    const dup = await call('POST', '/api/auth/register', { body: { email: userAEmail, password: pwd } });
    check('重复邮箱注册被拒绝', dup.json?.success === false, dup.json?.message);

    const weak = await call('POST', '/api/auth/register', { body: { email: `weak_${stamp}@example.com`, password: '123' } });
    check('弱密码（<6 位）被拒绝', weak.json?.success === false, weak.json?.message);

    const noAuth = await call('GET', '/api/admin/users');
    check('未登录访问 /api/admin/users 被拦截', noAuth.status === 401 || noAuth.json?.code === 401, `status=${noAuth.status}`);
  }

  console.log('\n[2] 上传安全防线');
  let uploadedUrl = '';
  {
    // 上传已强制登录（匿名 401），所以这里必须带 token；
    // 先断言匿名确实被拒，避免把「401」误当成「内容校验拦住了」
    const anon = await call('POST', '/api/upload', { form: multipart('pixel.png', tinyPng(), 'image/png') });
    check('匿名上传被拒绝（401）', anon.status === 401, `status=${anon.status}`);

    const exe = await call('POST', '/api/upload', {
      token: tokenA,
      form: multipart('evil.exe', Buffer.from('MZfake'), 'application/octet-stream'),
    });
    check('拒绝可执行文件 .exe', exe.json?.success === false, exe.json?.error);

    const fake = await call('POST', '/api/upload', {
      token: tokenA,
      form: multipart('fake.png', Buffer.from('this is definitely not a png'), 'image/png'),
    });
    check('拒绝伪装文件（后缀 png 但内容不符）', fake.json?.success === false, fake.json?.error);

    const good = await call('POST', '/api/upload', { token: tokenA, form: multipart('pixel.png', tinyPng(), 'image/png') });
    uploadedUrl = good.json?.files?.[0]?.url || '';
    check('合法 PNG 上传成功且按 SHA-256 命名', good.json?.success === true && /^\/uploads\/[a-f0-9]{64}\.png$/.test(uploadedUrl), uploadedUrl);

    const again = await call('POST', '/api/upload', { token: tokenA, form: multipart('pixel-copy.png', tinyPng(), 'image/png') });
    check('同内容文件秒传去重（URL 一致）', again.json?.files?.[0]?.url === uploadedUrl, again.json?.files?.[0]?.url);

    const ranged = await fetch(`${BASE}${uploadedUrl}`, { headers: { Range: 'bytes=0-3' } });
    check('上传文件可通过 /uploads/** 访问并支持 Range', [200, 206].includes(ranged.status), `status=${ranged.status}`);
  }

  console.log('\n[3] 收费墙：未付费必须被拦');
  let orderId = '';
  {
    const noOrder = await call('POST', '/api/qr/dynamic', {
      token: tokenA,
      body: { contentType: 'image', title: '未付费活码', mediaUrls: [{ id: '1', name: 'a.png', url: uploadedUrl }] },
    });
    check('无 orderId 创建活码返回 402', noOrder.json?.code === 402, noOrder.json?.message);

    const create = await call('POST', '/api/order/create', {
      token: tokenA,
      body: { actionType: 'dynamic_qr', contentType: 'image', mediaUrls: [{ url: uploadedUrl, size: 68 }] },
    });
    orderId = create.json?.data?.id || '';
    check(
      '创建订单成功且金额取「图片」基础价 4.00',
      create.json?.success === true && Number(create.json?.data?.amount) === 4,
      `amount=${create.json?.data?.amount}`
    );
    check('新订单状态为 pending', create.json?.data?.status === 'pending', create.json?.data?.status);

    const notPaid = await call('POST', '/api/qr/dynamic', {
      token: tokenA,
      body: { contentType: 'image', title: '待支付订单', orderId },
    });
    check('用未支付订单创建活码返回 402', notPaid.json?.code === 402, notPaid.json?.message);
  }

  console.log('\n[4] 提交支付凭据与管理员审核');
  {
    const confirm = await call('POST', '/api/order/confirm', { token: tokenA, body: { orderId, paymentVoucher: 'E2E-VOUCHER' } });
    check('提交「我已付款」后转为 pending_review', confirm.json?.data?.status === 'pending_review', confirm.json?.data?.status);

    if (!ADMIN_PASSWORD) {
      bad('管理员审核链路', '未提供 ADMIN_PASSWORD，跳过后续依赖管理员的操作');
      summary();
      return;
    }

    const admin = await call('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    const adminToken = admin.json?.data?.token || '';
    check('管理员登录成功', admin.json?.success === true && !!adminToken, `role=${admin.json?.data?.user?.role}`);

    const list = await call('GET', '/api/admin/orders', { token: adminToken });
    const found = (list.json?.data || []).find((o) => o.id === orderId);
    check('管理后台能看到该订单', !!found, `status=${found?.status}`);

    const approve = await call('POST', `/api/admin/orders/${orderId}/approve`, { token: adminToken });
    check('管理员审核通过，订单转为 paid', approve.json?.data?.status === 'paid', approve.json?.data?.status);

    const approveAgain = await call('POST', `/api/admin/orders/${orderId}/approve`, { token: adminToken });
    check('已支付订单不可重复审核', approveAgain.json?.success === false, approveAgain.json?.message);

    console.log('\n[5] 付费放行与活码生效');
    let shortCode = '';
    {
      const created = await call('POST', '/api/qr/dynamic', {
        token: tokenA,
        body: {
          contentType: 'image',
          title: 'E2E 联调活码',
          description: '由 scripts/e2e-smoke.mjs 创建',
          mediaUrls: [{ id: '1', name: 'pixel.png', url: uploadedUrl, size: 68, type: 'image/png' }],
        orderId,
        },
      });
      shortCode = created.json?.data?.shortCode || '';
      check('已支付订单可创建活码并返回 shortCode', created.json?.success === true && /^[a-z0-9]{6}$/.test(shortCode), shortCode);

      const detail = await call('GET', `/api/qr/dynamic/${shortCode}`);
      check('落地页接口能取回活码内容', detail.json?.data?.title === 'E2E 联调活码', detail.json?.data?.title);
      const mediaRaw = detail.json?.data?.mediaUrls;
      let mediaOk = false;
      try {
        const arr = typeof mediaRaw === 'string' ? JSON.parse(mediaRaw) : mediaRaw;
        mediaOk = Array.isArray(arr) && arr.length === 1 && arr[0].url === uploadedUrl;
      } catch {
        mediaOk = false;
      }
      check('mediaUrls 落库为 JSON 且可正确回读', mediaOk);

      const reused = await call('POST', '/api/qr/dynamic', {
        token: tokenA,
        body: { contentType: 'image', title: '复用订单', mediaUrls: [], orderId },
      });
      check('同一笔订单不能二次生成活码（已核销为 used）', reused.json?.code === 402, reused.json?.message);

      const status = await call('GET', `/api/order/status/${orderId}`, { token: tokenA });
      check('订单状态已变为 used', status.json?.data?.status === 'used', status.json?.data?.status);
    }

    console.log('\n[6] 越权与隔离');
    {
      const b = await call('POST', '/api/auth/register', { body: { email: userBEmail, password: pwd } });
      const tokenB = b.json?.data?.token || '';
      check('用户 B 注册成功', b.json?.success === true);

      const peek = await call('GET', `/api/order/status/${orderId}`, { token: tokenB });
      check('B 查看 A 的订单返回 403', peek.json?.code === 403, peek.json?.message);

      const steal = await call('POST', '/api/order/mock-pay', { token: tokenB, body: { orderId } });
      check('B 无法操作 A 的订单', steal.json?.code === 403, steal.json?.message);

      const adminWithUserToken = await call('GET', '/api/admin/users', { token: tokenB });
      check('普通用户访问管理接口返回 403', adminWithUserToken.status === 403 || adminWithUserToken.json?.code === 403, `status=${adminWithUserToken.status}`);

      const wrongType = await call('POST', '/api/order/create', { token: tokenB, body: { actionType: 'not_exist' } });
      check('非法 actionType 建单被拒绝', wrongType.json?.success === false, wrongType.json?.message);
    }

    console.log('\n[7] 内容合规拦截');
    {
      const sensitive = await call('POST', '/api/qr/dynamic', {
        token: tokenA,
        body: { contentType: 'image', title: '赌博推广活码', mediaUrls: [] },
      });
      check('标题命中敏感词被拦截', sensitive.json?.success === false, sensitive.json?.message);
    }
  }

  summary();

  function summary() {
    console.log(`\n===== 结果：${passed} 通过 / ${failed} 失败 =====`);
    if (failed > 0) {
      console.log('失败项：');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error('\n脚本异常：', e);
  process.exitCode = 1;
});
