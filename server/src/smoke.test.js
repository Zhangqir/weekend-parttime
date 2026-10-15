// 端到端冒烟测试：验证关键修复（越权、重复报名、满员、GPS 签到）
const BASE = process.env.BASE || 'http://localhost:3000';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const rnd = Math.random().toString(36).slice(2, 8);
const sPhone = `131${rnd}`;
const mPhone = `132${rnd}`;

async function main() {
  // 1. 注册学生与商家
  const s = await call('/api/auth/register', { method: 'POST', body: { phone: sPhone, password: '123456', role: 'student', realName: '测试生' } });
  ok('注册学生', s.status === 201, `got ${s.status}`);
  const m = await call('/api/auth/register', { method: 'POST', body: { phone: mPhone, password: '123456', role: 'merchant', shopName: '测试店' } });
  ok('注册商家', m.status === 201, `got ${m.status}`);
  const sToken = s.data.token, mToken = m.data.token, sId = s.data.user.id;

  // 2. 商家发布岗位
  const job = await call('/api/jobs', { method: 'POST', token: mToken, body: {
    title: '测试岗', category: 'catering', wage: 20, wageType: 'hourly', workDate: '2026-10-20',
    startTime: '09:00', endTime: '18:00', location: '大学城', latitude: 30.2741, longitude: 120.1551,
    headcount: 1, description: '冒烟测试岗位',
  }});
  ok('商家发布岗位(draft)', job.status === 201 && job.data.job.status === 'draft', `got ${job.status}`);
  const jobId = job.data.job.id;

  const pub = await call(`/api/jobs/${jobId}/publish`, { method: 'POST', token: mToken });
  ok('商家发布岗位(draft→published)', pub.status === 200 && pub.data.status === 'published');

  // 3. 学生报名
  const a1 = await call('/api/applications', { method: 'POST', token: sToken, body: { jobId, message: '我想来' } });
  ok('学生报名(pending)', a1.status === 201 && a1.data.status === 'pending', `got ${a1.status}`);
  const appId = a1.data.id;

  // 4. 重复报名被唯一约束拦截
  const a2 = await call('/api/applications', { method: 'POST', token: sToken, body: { jobId } });
  ok('重复报名拦截(409)', a2.status === 409, `got ${a2.status}`);

  // 5. 越权：学生尝试接受自己的报名 → 403
  const a3 = await call(`/api/applications/${appId}`, { method: 'PATCH', token: sToken, body: { action: 'accepted' } });
  ok('越权拦截(学生接受→403)', a3.status === 403, `got ${a3.status}`);

  // 6. 商家接受报名
  const a4 = await call(`/api/applications/${appId}`, { method: 'PATCH', token: mToken, body: { action: 'accepted' } });
  ok('商家接受报名(accepted)', a4.status === 200 && a4.data.status === 'accepted', `got ${a4.status}`);
  const jobAfter = await call(`/api/jobs/${jobId}`);
  ok('满员后岗位自动 matched', jobAfter.data.job.status === 'matched', `got ${jobAfter.data.job.status}`);

  // 7. 满员：再注册一个学生报名 → 409
  const s2 = await call('/api/auth/register', { method: 'POST', body: { phone: `133${rnd}`, password: '123456', role: 'student', realName: '测试生2' } });
  const a5 = await call('/api/applications', { method: 'POST', token: s2.data.token, body: { jobId } });
  ok('满员报名拦截(409)', a5.status === 409, `got ${a5.status}`);

  // 8. GPS 签到：距离过远 → 422
  const c1 = await call(`/api/applications/${appId}/checkin`, { method: 'POST', token: sToken, body: { latitude: 39.9, longitude: 116.4 } });
  ok('GPS 签到距离校验(过远→422)', c1.status === 422, `got ${c1.status}`);

  // 9. GPS 签到：在工作地点附近 → 200
  const c2 = await call(`/api/applications/${appId}/checkin`, { method: 'POST', token: sToken, body: { latitude: 30.2742, longitude: 120.1552 } });
  ok('GPS 签到成功(checked_in)', c2.status === 200 && c2.data.status === 'checked_in', `got ${c2.status}`);

  // 10. 商家标记完成 → finished + 学生 total_jobs 累加
  const f1 = await call(`/api/applications/${appId}`, { method: 'PATCH', token: mToken, body: { action: 'finish' } });
  ok('商家标记完成(finished)', f1.status === 200 && f1.data.status === 'finished', `got ${f1.status}`);

  // 11. 互评
  const r1 = await call('/api/reviews', { method: 'POST', token: sToken, body: { jobId, toUserId: m.data.user.id, rating: 5, comment: '老板人好' } });
  ok('学生评商家', r1.status === 201, `got ${r1.status}`);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
