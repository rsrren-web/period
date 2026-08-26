const pageUrl = process.env.PERIOD_PAGE_URL || 'https://rsrren-web.github.io/period/';
const workerUrl = process.env.PERIOD_WORKER_URL || 'https://period-sync.rsr-ren.workers.dev';
const release = process.env.PERIOD_RELEASE || 'v96';

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
if (!html.includes(`app.js?v=${release.replace(/^v/, '')}`)) throw new Error(`Pages HTML is not ${release}`);
if (!serviceWorker.includes(`period-helper-${release}`)) throw new Error(`Service Worker is not ${release}`);
const health = await healthResponse.json();
const status = await statusResponse.json();
if (!healthResponse.ok || health.ok !== true) throw new Error('Worker health check failed');
if (health.version !== release) throw new Error(`Worker is not ${release}`);
if (!statusResponse.ok || status.githubOk !== true) throw new Error('Worker GitHub check failed');
if (status.deviceAuthOk !== true) throw new Error('Worker device credential check failed');
console.log(JSON.stringify({ page: release, serviceWorker: release, worker: health.service, workerVersion: health.version, github: 'ok', deviceAuth: 'ok', tokenExpiresAt: status.tokenExpiresAt }, null, 2));
