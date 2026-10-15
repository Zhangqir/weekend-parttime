// Store 层：命名对应实体（useAuthStore / useJobStore / useApplicationStore / useReviewStore）
import { api, getToken, setToken, getUser, setUser } from './api.js';

export const useAuthStore = {
  get token() { return getToken(); },
  get user() { return getUser(); },
  get isLoggedIn() { return !!getToken(); },
  async login(phone, password) {
    const d = await api('/api/auth/login', { method: 'POST', body: { phone, password } });
    setToken(d.token); setUser(d.user); return d.user;
  },
  async register(payload) {
    const d = await api('/api/auth/register', { method: 'POST', body: payload });
    setToken(d.token); setUser(d.user); return d.user;
  },
  async me() {
    const d = await api('/api/auth/me'); setUser(d.user); return d.user;
  },
  logout() { setToken(null); setUser(null); location.hash = '#/'; },
};

export const useJobStore = {
  list(params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return api('/api/jobs' + (q ? '?' + q : ''));
  },
  detail(id) { return api('/api/jobs/' + id); },
  create(body) { return api('/api/jobs', { method: 'POST', body }); },
  publish(id) { return api('/api/jobs/' + id + '/publish', { method: 'POST' }); },
  mine() { return api('/api/jobs/mine'); },
};

export const useApplicationStore = {
  apply(jobId, message) { return api('/api/applications', { method: 'POST', body: { jobId, message } }); },
  mine() { return api('/api/applications/mine'); },
  forJob(jobId) { return api('/api/applications/job/' + jobId); },
  update(id, action) { return api('/api/applications/' + id, { method: 'PATCH', body: { action } }); },
  checkin(id, latitude, longitude) {
    return api('/api/applications/' + id + '/checkin', { method: 'POST', body: { latitude, longitude } });
  },
};

export const useReviewStore = {
  create(body) { return api('/api/reviews', { method: 'POST', body }); },
  forJob(jobId) { return api('/api/reviews/' + jobId); },
};
