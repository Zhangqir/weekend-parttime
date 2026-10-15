// 报名路由：POST 报名 / GET 我的 / GET 岗位报名 / PATCH 处理（商家接受拒绝 + 学生取消）
import { Router } from 'express';
import { authRequired, roleRequired } from '../auth.js';
import * as applyService from '../services/applyService.js';
import { httpError } from '../services/jobService.js';

const router = Router();

// 学生报名
router.post('/', authRequired, roleRequired('student'), (req, res) => {
  const { jobId, message } = req.body || {};
  if (!jobId) throw httpError(400, '缺少 jobId');
  res.status(201).json(applyService.create(jobId, req.user.id, message));
});

// 学生：我的报名（必须先于 /:id 注册）
router.get('/mine', authRequired, roleRequired('student'), (req, res) => {
  res.json({ applications: applyService.listMine(req.user.id) });
});

// 商家：某岗位的报名列表
router.get('/job/:jobId', authRequired, roleRequired('merchant'), (req, res) => {
  res.json({ applications: applyService.listForJob(req.params.jobId, req.user.id) });
});

// 处理报名：商家 accept/reject/no_show/finish；学生 cancel
router.patch('/:id', authRequired, (req, res) => {
  const action = req.body?.action;
  if (!action) throw httpError(400, '缺少 action');
  if (req.user.role === 'merchant') {
    if (action === 'finish') return res.json(applyService.finish(req.params.id, req.user.id));
    if (['accepted', 'rejected', 'no_show'].includes(action)) {
      return res.json(applyService.merchantUpdate(req.params.id, req.user.id, action));
    }
  }
  if (req.user.role === 'student' && action === 'cancelled') {
    return res.json(applyService.studentCancel(req.params.id, req.user.id, action));
  }
  throw httpError(403, '无权执行该操作');
});

export default router;
