// checkinService：到岗签到（GPS 距离校验，修复原方案无坐标/无时间字段的问题）
import { db, now, withTx } from '../db.js';
import { httpError } from './jobService.js';

const MAX_DISTANCE_M = 800; // 允许的签到距离（米）

// Haversine 球面距离（米）
export function distanceMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function checkin(applicationId, studentId, { latitude, longitude }) {
  return withTx(() => {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) throw httpError(404, '报名不存在');
    if (app.student_id !== studentId) throw httpError(403, '只能给自己签到');
    if (app.status !== 'accepted') throw httpError(409, '当前状态不可签到（需已被接受）');

    const job = db.prepare('SELECT latitude, longitude FROM jobs WHERE id = ?').get(app.job_id);
    const dist = distanceMeters(latitude, longitude, job.latitude, job.longitude);
    if (dist > MAX_DISTANCE_M) {
      throw httpError(422, `距离工作地点 ${Math.round(dist)} 米，超出 ${MAX_DISTANCE_M} 米签到范围`);
    }

    db.prepare(`UPDATE applications SET status = 'checked_in', checked_in_at = ?, checkin_lat = ?, checkin_lng = ?, updated_at = ?
      WHERE id = ?`).run(now(), latitude, longitude, now(), applicationId);
    return { id: applicationId, status: 'checked_in', distanceMeters: Math.round(dist) };
  });
}
