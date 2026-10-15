// jobService：岗位业务逻辑（list / detail / create / publish / 状态流转）
import { db, now, withTx } from '../db.js';

const PUBLIC_STATUSES = ['published', 'matched', 'completed', 'settled'];

const JOB_COLS = `j.id, j.merchant_id, j.title, j.category, j.description, j.wage, j.wage_type,
  j.work_date, j.start_time, j.end_time, j.location, j.latitude, j.longitude, j.headcount,
  j.requirements, j.status, j.created_at`;

const ACCEPTED_COUNT = `(SELECT COUNT(*) FROM applications a
  WHERE a.job_id = j.id AND a.status IN ('accepted','checked_in','finished'))`;

const JOB_SELECT = `SELECT ${JOB_COLS}, m.shop_name, m.latitude AS merchant_lat, m.longitude AS merchant_lng,
  ${ACCEPTED_COUNT} AS accepted_count
  FROM jobs j JOIN merchants m ON m.user_id = j.merchant_id`;

function rowToJob(r) {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    shopName: r.shop_name,
    title: r.title,
    category: r.category,
    description: r.description,
    wage: r.wage,
    wageType: r.wage_type,
    workDate: r.work_date,
    startTime: r.start_time,
    endTime: r.end_time,
    location: r.location,
    latitude: r.latitude,
    longitude: r.longitude,
    merchantLat: r.merchant_lat,
    merchantLng: r.merchant_lng,
    headcount: r.headcount,
    acceptedCount: r.accepted_count,
    requirements: r.requirements,
    status: r.status,
    createdAt: r.created_at,
  };
}

// 列表（含筛选：分类 / 关键词 / 状态 / 排序）
export function list({ status = 'published', category, q, sort } = {}) {
  let sql = `${JOB_SELECT} WHERE j.status = ?`;
  const params = [status];

  if (category && category !== 'all') {
    sql += ' AND j.category = ?';
    params.push(category);
  }
  if (q) {
    sql += ' AND (j.title LIKE ? OR j.description LIKE ? OR j.location LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  if (sort === 'wage') sql += ' ORDER BY j.wage DESC';
  else if (sort === 'date') sql += ' ORDER BY j.work_date ASC';
  else sql += ' ORDER BY j.created_at DESC';

  return db.prepare(sql).all(...params).map(rowToJob);
}

export function detail(id) {
  const r = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id);
  return r ? rowToJob(r) : null;
}

export function create(merchantId, data) {
  const id = crypto.randomUUID();
  const job = {
    id,
    merchant_id: merchantId,
    title: data.title,
    category: data.category || 'other',
    description: data.description || '',
    wage: data.wage,
    wage_type: data.wageType || 'hourly',
    work_date: data.workDate,
    start_time: data.startTime,
    end_time: data.endTime,
    location: data.location,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    headcount: data.headcount,
    requirements: data.requirements || '',
    status: 'draft',
    created_at: now(),
  };
  db.prepare(`INSERT INTO jobs (id, merchant_id, title, category, description, wage, wage_type,
    work_date, start_time, end_time, location, latitude, longitude, headcount, requirements, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    job.id, job.merchant_id, job.title, job.category, job.description, job.wage, job.wage_type,
    job.work_date, job.start_time, job.end_time, job.location, job.latitude, job.longitude,
    job.headcount, job.requirements, job.status, job.created_at,
  );
  return job;
}

export function myJobs(merchantId) {
  return db.prepare(`${JOB_SELECT} WHERE j.merchant_id = ? ORDER BY j.created_at DESC`)
    .all(merchantId).map(rowToJob);
}

const JOB_TRANSITIONS = {
  draft: ['published', 'cancelled'],
  published: ['matched', 'completed', 'cancelled'],
  matched: ['completed', 'cancelled'],
  completed: ['settled'],
  settled: [],
  cancelled: [],
};

// 状态流转（仅商家，且校验合法迁移）
export function transition(id, merchantId, to) {
  return withTx(() => {
    const j = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!j) throw httpError(404, '岗位不存在');
    if (j.merchant_id !== merchantId) throw httpError(403, '只能操作自己发布的岗位');
    if (!JOB_TRANSITIONS[j.status]?.includes(to)) {
      throw httpError(409, `非法状态流转：${j.status} → ${to}`);
    }
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(to, id);
    return { id, status: to };
  });
}

export function publish(id, merchantId) {
  return transition(id, merchantId, 'published');
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
