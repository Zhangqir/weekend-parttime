// 签到路由：POST /api/applications/:id/checkin（学生，GPS 校验）
import { Router } from 'express';
import { authRequired, roleRequired } from '../auth.js';
import { checkin } from '../services/checkinService.js';

const router = Router();

router.post('/:id/checkin', authRequired, roleRequired('student'), (req, res) => {
  const { latitude, longitude } = req.body || {};
  if (latitude == null || longitude == null) {
    const e = new Error('缺少定位信息（latitude/longitude）');
    e.status = 400;
    throw e;
  }
  res.json(checkin(req.params.id, req.user.id, { latitude, longitude }));
});

export default router;
