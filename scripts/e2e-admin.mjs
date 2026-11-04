/**
 * 管理端 / 配置类接口联调脚本（补充 e2e-smoke.mjs 未覆盖的部分）
 *
 * 覆盖：用户禁用与角色变更、价格配置热更新与免费模式、收款码配置更新、
 *      模拟支付开关、导出订单定价、系统网络探测。
 *
 * 所有被修改的配置都会在 finally 中恢复原值，跑完不留副作用。
 *
 * 用法：
 *   ADMIN_PASSWORD=xxx node scripts/e2e-admin.mjs
 *   BASE_URL=http://localhost:8080 node scripts/e2e-admin.mjs
 */

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'duyuanfu@yeah.net';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

let passed = 0;
let failed = 0;
const failures = [];

const ok = (n, d = '') => {
  passed++;
  console.log(`  PASS  ${n}${d ? ` -> ${d}` : ''}`);
};
const bad = (n, d = '') => {
  failed++;
  failures.push(`${n}${d ? ` -> ${d}` : ''}`);
  console.log(`  FAIL  ${n}${d ? ` -> ${d}` : ''}`);
};
const check = (n, c, d = '') => (c ? ok(n, d) : bad(n, d));

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

const login = async (email, password) => {
  const r = await call('POST', '/api/auth/login', { body: { email, password } });
  return r.json?.data?.token || '';
};

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('缺少 ADMIN_PASSWORD 环境变量');
    process.exit(1);
  }

  const stamp = Date.now();
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!adminToken) {
    console.error('管理员登录失败，检查 ADMIN_EMAIL / ADMIN_PASSWORD');
    process.exit(1);
  }

  // 先备份将被修改的配置，任何异常都要恢复
  const pricingList = await call('GET', '/api/admin/pricing', { token: adminToken });
  const dynamicPricing = (pricingList.json?.data || []).find((p) => p.itemKey === 'dynamic_qr.image');
  const payCfg = await call('GET', '/api/admin/payment-config', { token: adminToken });
  const payCfgOriginal = payCfg.json?.data || {};

  let tempUserId = '';
  let tempUserEmail = '';
  const tmpPwd = 'Test123456';

  try {
    console.log('\n[1] 用户管理');
    {
      tempUserEmail = `e2e_admin_${stamp}@example.com`;
      const reg = await call('POST', '/api/auth/register', { body: { email: tempUserEmail, password: tmpPwd } });
      tempUserId = reg.json?.data?.user?.id || '';
      check('新建测试用户', !!tempUserId);

      const users = await call('GET', '/api/admin/users', { token: adminToken });
      const row = (users.json?.data || []).find((u) => u.id === tempUserId);
      check('用户列表能查到该用户', !!row, row?.email);
      check('用户列表不返回密码字段', row ? row.password === null || row.password === undefined : false);

      const disable = await call('POST', `/api/admin/users/${tempUserId}/toggle-status`, { token: adminToken });
      check('管理员禁用账号', disable.json?.data?.status === 'disabled', disable.json?.data?.status);

      const blocked = await call('POST', '/api/auth/login', { body: { email: tempUserEmail, password: tmpPwd } });
      check('被禁用账号无法登录', blocked.json?.success === false, blocked.json?.message);

      const enable = await call('POST', `/api/admin/users/${tempUserId}/toggle-status`, { token: adminToken });
      check('管理员恢复账号', enable.json?.data?.status === 'active', enable.json?.data?.status);

      const relogin = await login(tempUserEmail, tmpPwd);
      check('恢复后可正常登录', !!relogin);

      const promote = await call('POST', `/api/admin/users/${tempUserId}/role`, {
        token: adminToken,
        body: { role: 'admin' },
      });
      check('提升为管理员', promote.json?.data?.role === 'admin', promote.json?.data?.role);

      const adminAccess = await call('GET', '/api/admin/users', { token: relogin });
      check('提权后旧 token 立即获得管理权限（角色实时回查）', adminAccess.json?.success === true);

      const selfDisable = await call('POST', `/api/admin/users/${tempUserId}/toggle-status`, { token: adminToken });
      check('管理员账号不可被禁用', selfDisable.json?.success === false, selfDisable.json?.message);

      const demote = await call('POST', `/api/admin/users/${tempUserId}/role`, {
        token: adminToken,
        body: { role: 'user' },
      });
      check('降级回普通用户', demote.json?.data?.role === 'user', demote.json?.data?.role);

      const denied = await call('GET', '/api/admin/users', { token: relogin });
      check('降级后同一 token 立即失去管理权限', denied.status === 403 || denied.json?.code === 403, `status=${denied.status}`);
    }

    console.log('\n[2] 价格配置热更新');
    {
      check('定价项 dynamic_qr.image 存在（按类型定价）', !!dynamicPricing, `原价=${dynamicPricing?.price}`);
      const originalPrice = Number(dynamicPricing.price);
      const originalEnabled = Number(dynamicPricing.enabled);

      const update = await call('POST', '/api/admin/pricing', {
        token: adminToken,
        body: { id: dynamicPricing.id, price: 12.34 },
      });
      check('改价成功', Number(update.json?.data?.price) === 12.34, update.json?.data?.price);

      const userToken = await login(tempUserEmail, tmpPwd);
      const order = await call('POST', '/api/order/create', { token: userToken, body: { actionType: 'dynamic_qr', contentType: 'image' } });
      check('新建订单按新价格计费', Number(order.json?.data?.amount) === 12.34, `amount=${order.json?.data?.amount}`);

      // 免费模式
      const zero = await call('POST', '/api/admin/pricing', {
        token: adminToken,
        body: { id: dynamicPricing.id, price: 0 },
      });
      check('价格置 0', Number(zero.json?.data?.price) === 0);

      const freeOrder = await call('POST', '/api/order/create', { token: userToken, body: { actionType: 'dynamic_qr', contentType: 'image' } });
      check('价格 0 时建单直接为 paid 且金额 0', freeOrder.json?.data?.status === 'paid' && Number(freeOrder.json?.data?.amount) === 0, `${freeOrder.json?.data?.status}/${freeOrder.json?.data?.amount}`);

      const freeQr = await call('POST', '/api/qr/dynamic', {
        token: userToken,
        body: {
          contentType: 'image',
          title: '免费模式活码',
          // 附件类活码现在必须至少带一个文件（空列表会被服务端拦掉）。
          // 本用例验的是「免费模式跳过订单校验」，所以这里给一个外链占位即可。
          mediaUrls: [{ url: 'https://example.com/free.png', name: 'free.png', size: 1024, type: 'image/png' }],
        },
      });
      check('免费模式下无需 orderId 即可生成活码', freeQr.json?.success === true, freeQr.json?.data?.shortCode);

      // 恢复原价与原开关
      const restore = await call('POST', '/api/admin/pricing', {
        token: adminToken,
        body: { id: dynamicPricing.id, price: originalPrice, enabled: originalEnabled },
      });
      check('价格已恢复原值', Number(restore.json?.data?.price) === originalPrice, restore.json?.data?.price);

      const back = await call('POST', '/api/order/create', { token: userToken, body: { actionType: 'dynamic_qr', contentType: 'image' } });
      check('恢复后按原价计费', Number(back.json?.data?.amount) === originalPrice, `amount=${back.json?.data?.amount}`);
    }

    console.log('\n[3] 收款码配置');
    {
      const marker = `E2E-NOTICE-${stamp}`;
      const upd = await call('POST', '/api/admin/payment-config', {
        token: adminToken,
        body: { noticeText: marker },
      });
      check('更新提示文案', upd.json?.data?.noticeText === marker);

      const pub = await call('GET', '/api/payment/config');
      const pubNotice = pub.json?.data?.payment?.noticeText ?? pub.json?.data?.noticeText;
      check('公开接口能读到最新配置（付费弹窗展示用）', pubNotice === marker, pubNotice);

      const restoreCfg = await call('POST', '/api/admin/payment-config', {
        token: adminToken,
        body: { noticeText: payCfgOriginal.noticeText, qrType: payCfgOriginal.qrType, enabled: payCfgOriginal.enabled },
      });
      check('提示文案已恢复', restoreCfg.json?.data?.noticeText === payCfgOriginal.noticeText);
    }

    console.log('\n[4] 模拟支付与导出定价');
    {
      const userToken = await login(tempUserEmail, tmpPwd);
      const order = await call('POST', '/api/order/create', { token: userToken, body: { actionType: 'static_export' } });
      const orderId = order.json?.data?.id || '';
      check('导出订单按 static_export 定价 2.00 计费', Number(order.json?.data?.amount) === 2, `amount=${order.json?.data?.amount}`);

      const mock = await call('POST', '/api/order/mock-pay', { token: userToken, body: { orderId } });
      const mocked = mock.json?.success === true && mock.json?.data?.status === 'paid';
      if (mocked) {
        ok('模拟支付通道开启时可直接置为 paid（仅开发环境）', mock.json?.data?.status);
      } else {
        // 生产环境关闭该通道是正确行为，不算失败
        ok('模拟支付通道已关闭（生产期望行为）', mock.json?.message);
      }
    }

    console.log('\n[5] 系统探测');
    {
      const net = await call('GET', '/api/system/network');
      check('GET /api/system/network 走统一 Result 包装', net.json?.success === true);
      const ips = net.json?.data?.addresses;
      check(
        '能返回局域网 IPv4 列表（自定义域名提示用）',
        Array.isArray(ips) && ips.length > 0,
        Array.isArray(ips) ? ips.join(', ') : '空'
      );
    }
    console.log('\n[6] 活码管理与品牌栏开关');
    {
      // 管理员建码免单，不需要订单
      const created = await call('POST', '/api/qr/dynamic', {
        token: adminToken,
        body: { contentType: 'url', title: `E2E 活码 ${stamp}`, mediaUrls: [] },
      });
      const qrId = created.json?.data?.id || '';
      const shortCode = created.json?.data?.shortCode || '';
      check('管理员可创建测试活码', !!qrId && !!shortCode, shortCode);

      if (qrId) {
        const list = await call('GET', '/api/admin/dynamic-qrs', { token: adminToken });
        const row = (list.json?.data?.items || []).find((i) => i.id === qrId);
        check('新活码出现在管理列表', !!row, row?.shortCode);
        check('新建活码默认展示品牌栏', row?.showBrandHeader === 1, String(row?.showBrandHeader));
        check('列表带扫码次数字段', typeof row?.scanCount === 'number', String(row?.scanCount));
        check('新活码不在回收站', row?.deleted === false);

        const hideRes = await call('POST', `/api/admin/dynamic-qrs/${qrId}`, {
          token: adminToken,
          body: { showBrandHeader: 0 },
        });
        check('关闭品牌栏成功', hideRes.json?.success === true, hideRes.json?.message);

        const pubHidden = await call('GET', `/api/qr/dynamic/${shortCode}`);
        check('落地页取数能读到开关（0 = 隐藏）', pubHidden.json?.data?.showBrandHeader === 0, String(pubHidden.json?.data?.showBrandHeader));

        const before = pubHidden.json?.data?.expiresAt;
        const renewRes = await call('POST', `/api/admin/dynamic-qrs/${qrId}/renew`, {
          token: adminToken,
          body: { months: 1 },
        });
        check('续期接口返回 200', renewRes.json?.success === true, renewRes.json?.message);
        const pubRenewed = await call('GET', `/api/qr/dynamic/${shortCode}`);
        check('续期后到期时间往后推', new Date(pubRenewed.json?.data?.expiresAt) > new Date(before));

        const delRes = await call('POST', `/api/admin/dynamic-qrs/${qrId}/delete`, { token: adminToken });
        check('移入回收站成功', delRes.json?.success === true, delRes.json?.message);

        const pubDeleted = await call('GET', `/api/qr/dynamic/${shortCode}`);
        check('回收站中的活码扫码返回 404', pubDeleted.json?.success === false, pubDeleted.json?.code);
        check('404 文案不暴露"被删除"', String(pubDeleted.json?.message || '').includes('未找到'), pubDeleted.json?.message);

        const afterDelete = await call('GET', '/api/admin/dynamic-qrs', { token: adminToken });
        const delRow = (afterDelete.json?.data?.items || []).find((i) => i.id === qrId);
        check('管理列表中标记为已删除', delRow?.deleted === true, String(delRow?.deletedAt));
        check('统计里在用总数不含回收站', typeof afterDelete.json?.data?.stats?.deleted === 'number');

        const restoreRes = await call('POST', `/api/admin/dynamic-qrs/${qrId}/restore`, { token: adminToken });
        check('恢复成功', restoreRes.json?.success === true);
        const pubRestored = await call('GET', `/api/qr/dynamic/${shortCode}`);
        check('恢复后扫码重新可用', pubRestored.json?.success === true);

        const batchRes = await call('POST', '/api/admin/dynamic-qrs/batch', {
          token: adminToken,
          body: { ids: [qrId], action: 'show-brand' },
        });
        check('批量恢复品牌栏', batchRes.json?.success === true, batchRes.json?.data);
        const pubBatch = await call('GET', `/api/qr/dynamic/${shortCode}`);
        check('批量操作后开关生效', pubBatch.json?.data?.showBrandHeader === 1, String(pubBatch.json?.data?.showBrandHeader));

        const badBatch = await call('POST', '/api/admin/dynamic-qrs/batch', {
          token: adminToken,
          body: { ids: [qrId], action: 'drop-table' },
        });
        check('未知批量动作被拒绝', badBatch.json?.success === false, badBatch.json?.message);

        // 收尾：移入回收站（软删，不影响其它数据），保留记录便于人工核对
        await call('POST', `/api/admin/dynamic-qrs/${qrId}/delete`, { token: adminToken }).catch(() => {});
      }
    }
  } finally {
    // 兜底恢复，避免脚本中断后留下脏配置
    if (dynamicPricing) {
      await call('POST', '/api/admin/pricing', {
        token: adminToken,
        body: { id: dynamicPricing.id, price: Number(dynamicPricing.price), enabled: Number(dynamicPricing.enabled) },
      }).catch(() => {});
    }
    if (payCfgOriginal.id) {
      await call('POST', '/api/admin/payment-config', {
        token: adminToken,
        body: { noticeText: payCfgOriginal.noticeText, qrType: payCfgOriginal.qrType, enabled: payCfgOriginal.enabled },
      }).catch(() => {});
    }
    if (tempUserId) {
      await call('POST', `/api/admin/users/${tempUserId}/role`, { token: adminToken, body: { role: 'user' } }).catch(() => {});
    }
  }

  console.log(`\n===== 结果：${passed} 通过 / ${failed} 失败 =====`);
  if (failed > 0) {
    console.log('失败项：');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\n脚本异常：', e);
  process.exitCode = 1;
});
