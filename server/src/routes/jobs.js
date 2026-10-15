// 岗位路由：GET 列表 / GET 详情 / POST 创建 / POST 发布 / GET 我的（商家）
import { Router } from 'express';
import { authRequired, roleRequired } from '../auth.js';
import * as jobService from '../services/jobService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ jobs: jobService.list(req.query) });
});

// 注意：/mine 必须先于 /:id 注册
router.get('/mine', authRequired, roleRequired('merchant'), (req, res) => {
  res.json({ jobs: jobService.myJobs(req.user.id) });
});

router.get('/:id', (req, res) => {
  const job = jobService.detail(req.params.id);
  if (!job) throw jobService.httpError(404, '岗位不存在');
  res.json({ job });
});

router.post('/', authRequired, roleRequired('merchant'), (req, res) => {
  const job = jobService.create(req.user.id, req.body);
  res.status(201).json({ job });
});

router.post('/:id/publish', authRequired, roleRequired('merchant'), (req, res) => {
  res.json(jobService.publish(req.params.id, req.user.id));
});

// 商家推进岗位状态：matched→completed / completed→settled / 取消
router.post('/:id/status', authRequired, roleRequired('merchant'), (req, res) => {
  const to = req.body?.status;
  if (!to) throw jobService.httpError(400, '缺少 status');
  res.json(jobService.transition(req.params.id, req.user.id, to));
});

export default router;
