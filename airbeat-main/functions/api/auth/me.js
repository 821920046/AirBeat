import { json } from '../_utils.js';

export function onRequestGet({ data }) {
  return data.user ? json({ id: data.user.id, email: data.user.email }) : json({ error: '未登录' }, 401);
}
