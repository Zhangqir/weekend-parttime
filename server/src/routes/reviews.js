// 评价路由：POST 互评 / GET 岗位评价
import { Router } from 'express';
import { authRequired } from '../auth.js';
import * as reviewService from '../services/reviewService.js';

const router = Router();

router.post('/', authRequired, (req, res) => {
  const { jobId, toUserId, rating, comment } = req.body || {};
  if (!jobId || !toUserId || rating == null) {
    const e = new Error('缺少 jobId / toUserId / rating');
    e.status = 400;
    throw e;
  }
  res.status(201).json(reviewService.create(jobId, req.user.id, { toUserId, rating, comment }));
});

router.get('/:jobId', (req, res) => {
  res.json({ reviews: reviewService.listForJob(req.params.jobId) });
});

export default router;
