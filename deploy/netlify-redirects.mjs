// Netlify builds run in frontend/. Never send API keys to the static frontend.
import { writeFileSync } from 'node:fs';
const raw = process.env.CAD_BACKEND_URL?.trim();
let proxy;
if (raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('CAD_BACKEND_URL must be an HTTPS origin without a path or credentials.');
  }
  if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname)) {
    throw new Error('Netlify needs a reachable backend; a localhost address cannot work.');
  }
  proxy = `/api/* ${url.origin}/api/:splat 200!`;
} else {
  writeFileSync('dist/backend-unavailable.json', JSON.stringify({backend_unavailable:true, detail:'The web interface is deployed, but CAD processing is not connected. Set CAD_BACKEND_URL in Netlify to the HTTPS address of the running Docker backend, then redeploy.'}));
  proxy = '/api/* /backend-unavailable.json 200!';
  console.log('Publishing interface only: CAD uploads remain disabled until CAD_BACKEND_URL is configured.');
}
writeFileSync('dist/_redirects', proxy + '\n/* /index.html 200\n');
