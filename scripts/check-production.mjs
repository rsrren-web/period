const pageUrl = process.env.PERIOD_PAGE_URL || 'https://rsrren-web.github.io/period/';
const workerUrl = process.env.PERIOD_WORKER_URL || 'https://period-sync.rsr-ren.workers.dev';

async function text(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

const [html, serviceWorker, healthResponse, statusResponse] = await Promise.all([
  text(pageUrl),
  text(new URL('sw.js', pageUrl)),
  fetch(`${workerUrl}/health`, { cache: 'no-store' }),
  fetch(`${workerUrl}/status`, { cache: 'no-store' })
]);
if (!html.includes('app.js?v=93')) throw new Error('Pages HTML is not v93');
if (!serviceWorker.includes("period-helper-v93")) throw new Error('Service Worker is not v93');
const health = await healthResponse.json();
const status = await statusResponse.json();
if (!healthResponse.ok || health.ok !== true) throw new Error('Worker health check failed');
if (!statusResponse.ok || status.githubOk !== true) throw new Error('Worker GitHub check failed');
console.log(JSON.stringify({ page: 'v93', serviceWorker: 'v93', worker: health.service, github: 'ok', tokenExpiresAt: status.tokenExpiresAt }, null, 2));
