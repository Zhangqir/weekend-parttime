// 演示数据：首次启动若数据库为空则自动注入，让部署链接一打开就有内容
import { db, now } from './db.js';
import { hashPassword } from './auth.js';

export function ensureSeed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const id = () => crypto.randomUUID();

  const studentId = id();
  const merchantId = id();

  db.prepare('INSERT INTO users (id, phone, password_hash, role, created_at) VALUES (?,?,?,?,?)')
    .run(studentId, '13800000001', hashPassword('123456'), 'student', now());
  db.prepare('INSERT INTO students (user_id, real_name, school, grade, bio, rating, total_jobs) VALUES (?,?,?,?,?,?,?)')
    .run(studentId, '张三', '某某大学', '大二', '周末想找餐饮/促销兼职', 4.5, 3);

  db.prepare('INSERT INTO users (id, phone, password_hash, role, created_at) VALUES (?,?,?,?,?)')
    .run(merchantId, '13800000002', hashPassword('123456'), 'merchant', now());
  db.prepare('INSERT INTO merchants (user_id, shop_name, address, latitude, longitude, contact_person, rating) VALUES (?,?,?,?,?,?,?)')
    .run(merchantId, '喜茶·示例店', '大学城商业街 12 号', 30.2741, 120.1551, '李老板', 4.8);

  const jobs = [
    {
      merchantId, title: '奶茶店周末店员', category: 'catering', wage: 22, wageType: 'hourly',
      workDate: '2026-10-17', startTime: '09:00', endTime: '18:00', location: '大学城商业街 12 号',
      lat: 30.2741, lng: 120.1551, headcount: 3, requirements: '手脚麻利，能站一整天',
      description: '负责点单、出杯、保持台面整洁，有培训。',
    },
    {
      merchantId, title: '商场促销员', category: 'promotion', wage: 180, wageType: 'daily',
      workDate: '2026-10-18', startTime: '10:00', endTime: '20:00', location: '万达广场中庭',
      lat: 30.2812, lng: 120.1620, headcount: 2, requirements: '口齿清晰，主动热情',
      description: '向顾客介绍新品并引导试饮，按天结算。',
    },
    {
      merchantId, title: '外卖打包分拣', category: 'delivery', wage: 20, wageType: 'hourly',
      workDate: '2026-10-19', startTime: '17:00', endTime: '22:00', location: '大学城北门餐饮街',
      lat: 30.2690, lng: 120.1490, headcount: 4, requirements: '熟悉周边路线优先',
      description: '高峰期打包、按单分拣，管晚饭。',
    },
  ];

  const insert = db.prepare(`INSERT INTO jobs
    (id, merchant_id, title, category, description, wage, wage_type, work_date, start_time, end_time,
     location, latitude, longitude, headcount, requirements, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (const j of jobs) {
    insert.run(id(), j.merchantId, j.title, j.category, j.description, j.wage, j.wageType,
      j.workDate, j.startTime, j.endTime, j.location, j.lat, j.lng, j.headcount, j.requirements,
      'published', now());
  }

  console.log('🌱 已注入演示数据：学生 13800000001 / 123456，商家 13800000002 / 123456');
}
