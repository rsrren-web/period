import assert from 'node:assert/strict';
import worker, { deviceCredentialSelfCheck, issueDeviceCredential, verifyDeviceCredentialToken } from '../worker/src/index.js';

const env = { DEVICE_SIGNING_KEY: 'test-device-signing-key-with-enough-entropy' };
const credential = await issueDeviceCredential(env);

assert.match(credential.deviceToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
assert.ok(Date.parse(credential.expiresAt) > Date.now() + 179 * 86400000);
const payload = await verifyDeviceCredentialToken(credential.deviceToken, env);
assert.equal(payload.v, 1);
assert.equal(typeof payload.sub, 'string');
assert.equal(await deviceCredentialSelfCheck(env), true);
assert.equal(await deviceCredentialSelfCheck({}), false);

const [encoded, signature] = credential.deviceToken.split('.');
const replacement = signature.startsWith('A') ? 'B' : 'A';
await assert.rejects(() => verifyDeviceCredentialToken(`${encoded}.${replacement}${signature.slice(1)}`, env));
await assert.rejects(() => verifyDeviceCredentialToken('invalid-token', env));

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
try {
  const statusEnv = { ...env, GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo', GITHUB_TOKEN: 'test', GITHUB_TOKEN_EXPIRES_AT: '2026-10-17' };
  const healthyResponse = await worker.fetch(new Request('https://sync.test/status'), statusEnv);
  const healthy = await healthyResponse.json();
  assert.equal(healthyResponse.status, 200);
  assert.equal(healthy.githubOk, true);
  assert.equal(healthy.deviceAuthOk, true);
  const brokenResponse = await worker.fetch(new Request('https://sync.test/status'), { ...statusEnv, DEVICE_SIGNING_KEY: undefined });
  const broken = await brokenResponse.json();
  assert.equal(brokenResponse.status, 503);
  assert.equal(broken.githubOk, true);
  assert.equal(broken.deviceAuthOk, false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('device credential tests passed');
