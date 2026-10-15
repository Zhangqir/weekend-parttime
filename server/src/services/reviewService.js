// reviewService：双方互评 + 评分聚合（补全原方案缺失的 Review 实体）
import { db, now, withTx } from '../db.js';
import { httpError } from './jobService.js';

export function create(jobId, fromUserId, { toUserId, rating, comment }) {
  return withTx(() => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) throw httpError(404, '岗位不存在');

    // 双方必须通过「已完成的报名」产生关联，防止乱评
    const linked = db.prepare(`SELECT 1 FROM applications
      WHERE job_id = ? AND status = 'finished' AND student_id IN (?, ?)`)
      .get(jobId, fromUserId, toUserId);
    const isMerchant = job.merchant_id === fromUserId || job.merchant_id === toUserId;
    if (!linked || !isMerchant) throw httpError(403, '只能在完成订单后互评');

    const existing = db.prepare('SELECT id FROM reviews WHERE job_id = ? AND from_user_id = ? AND to_user_id = ?')
      .get(jobId, fromUserId, toUserId);
    const id = existing?.id || crypto.randomUUID();

    if (existing) {
      db.prepare('UPDATE reviews SET rating = ?, comment = ?, created_at = ? WHERE id = ?')
        .run(rating, comment || '', now(), id);
    } else {
      db.prepare('INSERT INTO reviews (id, job_id, from_user_id, to_user_id, rating, comment, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, jobId, fromUserId, toUserId, rating, comment || '', now());
    }

    recomputeRating(toUserId);
    return { id, jobId, fromUserId, toUserId, rating };
  });
}

function recomputeRating(userId) {
  const avg = db.prepare('SELECT AVG(rating) AS a FROM reviews WHERE to_user_id = ?').get(userId).a;
  const rating = avg == null ? 0 : Math.round(avg * 10) / 10;
  db.prepare('UPDATE students SET rating = ? WHERE user_id = ?').run(rating, userId);
  db.prepare('UPDATE merchants SET rating = ? WHERE user_id = ?').run(rating, userId);
}

export function listForJob(jobId) {
  return db.prepare(`SELECT r.id, r.job_id, r.from_user_id, r.to_user_id, r.rating, r.comment, r.created_at,
      u.role AS from_role, COALESCE(s.real_name, m.shop_name) AS from_name
    FROM reviews r JOIN users u ON u.id = r.from_user_id
    LEFT JOIN students s ON s.user_id = r.from_user_id
    LEFT JOIN merchants m ON m.user_id = r.from_user_id
    WHERE r.job_id = ? ORDER BY r.created_at DESC`).all(jobId).map((r) => ({
    id: r.id,
    jobId: r.job_id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    fromRole: r.from_role,
    fromName: r.from_name,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}
