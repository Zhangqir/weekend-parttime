// 认证路由：注册 / 登录 / 当前用户
import { Router } from 'express';
import { db, now } from '../db.js';
import { hashPassword, verifyPassword, signToken, authRequired } from '../auth.js';
import { httpError } from '../services/jobService.js';

const router = Router();

function publicUser(userId) {
  const u = db.prepare('SELECT id, phone, role, created_at FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  let profile = null;
  if (u.role === 'student') {
    profile = db.prepare('SELECT real_name, school, grade, bio, rating, total_jobs, blacklisted_at FROM students WHERE user_id = ?').get(userId);
  } else {
    profile = db.prepare('SELECT shop_name, address, contact_person, rating FROM merchants WHERE user_id = ?').get(userId);
  }
  return { id: u.id, phone: u.phone, role: u.role, createdAt: u.created_at, ...profile };
}

router.post('/register', (req, res) => {
  const { phone, password, role, realName, school, grade, shopName, address, contactPerson } = req.body || {};
  if (!phone || !password || !role) throw httpError(400, '手机号、密码、角色为必填');
  if (!['student', 'merchant'].includes(role)) throw httpError(400, '角色非法');
  if (String(password).length < 6) throw httpError(400, '密码至少 6 位');

  const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (exists) throw httpError(409, '该手机号已注册');

  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, phone, password_hash, role, created_at) VALUES (?,?,?,?,?)')
    .run(id, phone, hashPassword(password), role, now());

  if (role === 'student') {
    db.prepare('INSERT INTO students (user_id, real_name, school, grade) VALUES (?,?,?,?)')
      .run(id, realName || '同学', school || '', grade || '');
  } else {
    db.prepare('INSERT INTO merchants (user_id, shop_name, address, contact_person) VALUES (?,?,?,?)')
      .run(id, shopName || '店铺', address || '', contactPerson || '');
  }

  const token = signToken({ id, role });
  res.status(201).json({ token, user: publicUser(id) });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) throw httpError(400, '手机号和密码为必填');

  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!u || !verifyPassword(password, u.password_hash)) throw httpError(401, '手机号或密码错误');

  const token = signToken({ id: u.id, role: u.role });
  res.json({ token, user: publicUser(u.id) });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user.id) });
});

export default router;
