// Vercel Routing Middleware — host → entry mapping for `/` only.
//
// The rewrites in vercel.json cannot do this on their own: Vercel checks the
// filesystem BEFORE it evaluates `rewrites`, and the build emits a real
// index.html, so a request for `/` is answered from disk with the app entry and
// the rewrite never runs. Middleware runs before both the cache and the
// filesystem, so it is the only layer that can claim the root path.
//
// Deep paths (/login, /dashboard, …) miss the filesystem and are still handled
// by the rewrites in vercel.json. This file only exists for `/`.
import { next, rewrite } from '@vercel/functions';

// Mirrors MARKETING_HOSTS in vite.config.js and the host rules in vercel.json.
// *.vercel.app is included so the deployment URL shows the marketing page
// rather than the sign-in screen.
const MARKETING_HOSTS = [/^canteramanager\.com$/, /^www\.canteramanager\.com$/, /\.vercel\.app$/];

export default function middleware(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('host') || url.hostname).split(':')[0];

  if (!MARKETING_HOSTS.some((pattern) => pattern.test(host))) return next();

  url.pathname = '/landing.html';
  return rewrite(url);
}

export const config = { matcher: '/' };
