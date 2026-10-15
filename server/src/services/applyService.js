// applyService：报名业务逻辑（含并发安全：事务 + 满员校验 + 唯一约束）
import { db, now, withTx } from '../db.js';
import { httpError } from './jobService.js';

const APP_COLS = `a.id, a.job_id, a.student_id, a.status, a.message, a.applied_at, a.updated_at,
  a.checked_in_at, a.checkin_lat, a.checkin_lng,
  s.real_name AS student_name, s.school, j.title AS job_title, j.work_date, j.start_time, j.end_time, j.location`;

const APP_SELECT = `SELECT ${APP_COLS}
  FROM applications a
  JOIN students s ON s.user_id = a.student_id
  JOIN jobs j ON j.id = a.job_id`;

function rowToApp(r) {
  return {
    id: r.id,
    jobId: r.job_id,
    studentId: r.student_id,
    studentName: r.student_name,
    school: r.school,
    jobTitle: r.job_title,
    workDate: r.work_date,
    startTime: r.start_time,
    endTime: r.end_time,
    location: r.location,
    status: r.status,
    message: r.message,
    appliedAt: r.applied_at,
    updatedAt: r.updated_at,
    checkedInAt: r.checked_in_at,
    checkinLat: r.checkin_lat,
    checkinLng: r.checkin_lng,
  };
}

function acceptedCount(jobId) {
  return db.prepare(`SELECT COUNT(*) AS c FROM applications
    WHERE job_id = ? AND status IN ('accepted','checked_in','finished')`).get(jobId).c;
}

// 学生报名
export function create(jobId, studentId, message) {
  return withTx(() => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) throw httpError(404, '岗位不存在');
    if (job.status !== 'published') throw httpError(409, '该岗位当前不可报名');

    const student = db.prepare('SELECT blacklisted_at FROM students WHERE user_id = ?').get(studentId);
    if (!student) throw httpError(403, '只有学生可以报名');
    if (student.blacklisted_at) throw httpError(403, '你已被限制报名，请联系平台');

    const existing = db.prepare('SELECT id FROM applications WHERE job_id = ? AND student_id = ?')
      .get(jobId, studentId);
    if (existing) throw httpError(409, '你已报名该岗位，请勿重复报名');

    if (acceptedCount(jobId) >= job.headcount) throw httpError(409, '该岗位已满员');

    const id = crypto.randomUUID();
    const ts = now();
    db.prepare(`INSERT INTO applications (id, job_id, student_id, status, message, applied_at, updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(id, jobId, studentId, 'pending', message || '', ts, ts);
    return { id, jobId, status: 'pending' };
  });
}

// 学生：我的报名
export function listMine(studentId) {
  return db.prepare(`${APP_SELECT} WHERE a.student_id = ? ORDER BY a.applied_at DESC`)
    .all(studentId).map(rowToApp);
}

// 商家：某岗位的报名列表
export function listForJob(jobId, merchantId) {
  const job = db.prepare('SELECT merchant_id FROM jobs WHERE id = ?').get(jobId);
  if (!job) throw httpError(404, '岗位不存在');
  if (job.merchant_id !== merchantId) throw httpError(403, '无权查看该岗位的报名');
  return db.prepare(`${APP_SELECT} WHERE a.job_id = ? ORDER BY a.applied_at ASC`)
    .all(jobId).map(rowToApp);
}

// 报名状态流转：pending → accepted/rejected/cancelled；accepted → no_show；checked_in → finished
const TRANSITIONS = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['no_show'],
  checked_in: ['finished'],
};

// 商家处理报名（accept/reject/no_show）——在事务内原子判断满员，修复超卖
export function merchantUpdate(id, merchantId, action) {
  return withTx(() => {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    if (!app) throw httpError(404, '报名不存在');

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(app.job_id);
    if (job.merchant_id !== merchantId) throw httpError(403, '只能处理自己岗位的报名');
    if (!TRANSITIONS[app.status]?.includes(action)) {
      throw httpError(409, `非法状态流转：${app.status} → ${action}`);
    }

    // 接受：原子校验是否满员，满员则拒绝并触发岗位 matched
    if (action === 'accepted') {
      const ac = acceptedCount(job.id);
      if (ac >= job.headcount) throw httpError(409, '岗位已满员，无法继续接受');
      db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
        .run('accepted', now(), id);
      if (ac + 1 >= job.headcount) {
        db.prepare("UPDATE jobs SET status = 'matched' WHERE id = ? AND status = 'published'").run(job.id);
      }
      return { id, status: 'accepted' };
    }

    if (action === 'no_show') {
      db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
        .run('no_show', now(), id);
      return { id, status: 'no_show' };
    }

    // rejected / cancelled
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
      .run(action, now(), id);
    return { id, status: action };
  });
}

// 学生取消报名（仅 pending 可取消）
export function studentCancel(id, studentId, action) {
  return withTx(() => {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    if (!app) throw httpError(404, '报名不存在');
    if (app.student_id !== studentId) throw httpError(403, '只能操作自己的报名');
    if (!['cancelled'].includes(action) || !TRANSITIONS[app.status]?.includes(action)) {
      throw httpError(409, `非法状态流转：${app.status} → ${action}`);
    }
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
      .run('cancelled', now(), id);
    return { id, status: 'cancelled' };
  });
}

// 商家标记「已完成」（checked_in → finished），并累加学生完成次数
export function finish(id, merchantId) {
  return withTx(() => {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    if (!app) throw httpError(404, '报名不存在');
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(app.job_id);
    if (job.merchant_id !== merchantId) throw httpError(403, '只能操作自己岗位');
    if (app.status !== 'checked_in') throw httpError(409, '只有已签到的报名才能标记完成');

    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
      .run('finished', now(), id);
    db.prepare('UPDATE students SET total_jobs = total_jobs + 1 WHERE user_id = ?').run(app.student_id);
    return { id, status: 'finished' };
  });
}
