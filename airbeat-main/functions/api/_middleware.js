import { verifyJWT, getCookie } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const token = getCookie(request, 'token');
  context.data.user = token && env.JWT_SECRET ? await verifyJWT(token, env.JWT_SECRET) : null;
  return context.next();
}
