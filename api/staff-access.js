import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'amcoms_staff_gate';
const SESSION_SECONDS = 8 * 60 * 60;

const getSecrets = () => {
  const accessCode = process.env.STAFF_ACCESS_CODE;
  const signingSecret = process.env.STAFF_GATEWAY_SECRET;
  if (!accessCode || accessCode.length < 12 || !signingSecret || signingSecret.length < 32) {
    return null;
  }
  return { accessCode, signingSecret };
};

const getCookie = (request) => {
  const cookies = request.headers.cookie || '';
  const entry = cookies.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  return entry ? entry.slice(COOKIE_NAME.length + 1) : '';
};

const safeEqual = (left, right) => timingSafeEqual(
  createHash('sha256').update(left).digest(),
  createHash('sha256').update(right).digest()
);

const createSessionToken = (secret) => {
  const payload = Buffer.from(JSON.stringify({ expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const hasValidSession = (request, secret) => {
  const [payload, signature, extra] = getCookie(request).split('.');
  if (!payload || !signature || extra) return false;

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isInteger(decoded.expiresAt) && decoded.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

const setSessionCookie = (response, request, value, maxAge) => {
  const secure = process.env.VERCEL === '1' || request.headers['x-forwarded-proto'] === 'https';
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  );
};

export default function staffAccess(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  const secrets = getSecrets();
  if (!secrets) {
    return response.status(503).json({ error: 'Staff access gateway is not configured.' });
  }

  if (request.method === 'GET') {
    return hasValidSession(request, secrets.signingSecret)
      ? response.status(204).end()
      : response.status(401).json({ error: 'Staff gateway access is required.' });
  }

  if (request.method === 'DELETE') {
    setSessionCookie(response, request, '', 0);
    return response.status(204).end();
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const submittedCode = typeof request.body?.code === 'string' ? request.body.code : '';
  if (!submittedCode || submittedCode.length > 256 || !safeEqual(submittedCode, secrets.accessCode)) {
    return response.status(401).json({ error: 'Invalid access code.' });
  }

  setSessionCookie(response, request, createSessionToken(secrets.signingSecret), SESSION_SECONDS);
  return response.status(200).json({ success: true });
}
