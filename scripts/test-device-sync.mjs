import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const line = (name) => source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]+`))?.[0] || '';

for (const name of ['clearDeviceCredential', 'requestDeviceAuthorization', 'authorizeDevice', 'deviceToken', 'performSync', 'syncNow', 'startupCloudSync']) {
  assert.ok(line(name), `${name} must exist`);
}
assert.match(source, /deviceAuthorizationPromise=null,syncPromise=null/);
assert.match(line('deviceToken'), /if\(deviceAuthorizationPromise\)return deviceAuthorizationPromise/);
assert.match(line('performSync'), /localMutationVersion===sentMutationVersion/);
assert.match(line('performSync'), /else\{localStorage\.setItem\(SYNC_PENDING_KEY,'yes'\);syncQueued=true\}/);
assert.match(line('performSync'), /r\.status===401.*clearDeviceCredential\(\).*renderSettings\(\)/);
assert.match(line('syncNow'), /if\(syncPromise\)/);
assert.match(line('startupCloudSync'), /const synced=await syncNow\(false\);if\(!synced\)await pullRemote\(\)/);
assert.match(line('checkStatus'), /deviceAuthOk!==true.*修复前请勿反复输入口令/);
assert.match(source, /await authorizeDevice\(v\).*await syncNow\(false\)/);
assert.doesNotMatch(source, /requestAnimationFrame\(\(\)=>setTimeout\(\(\)=>void pullRemote\(\),0\)\)/);

let releaseAuthorization;
const authorization = new Promise((resolve) => { releaseAuthorization = resolve; });
let authorizationRequests = 0;
const authContext = { requestDeviceAuthorization: async () => { authorizationRequests++; await authorization; return 'token'; } };
vm.runInNewContext(`let deviceAuthorizationPromise=null;${line('authorizeDevice')};this.authorizeDevice=authorizeDevice`, authContext);
const authA = authContext.authorizeDevice('first-password');
const authB = authContext.authorizeDevice('second-password');
releaseAuthorization();
assert.equal(await authA, 'token');
assert.equal(await authB, 'token');
assert.equal(authorizationRequests, 1, 'device authorization must have only one in-flight request');

let releaseFirst;
const first = new Promise((resolve) => { releaseFirst = resolve; });
const calls = [];
const context = {
  performSync: async (interactive) => {
    calls.push(interactive);
    if (calls.length === 1) await first;
    return true;
  }
};
vm.runInNewContext(`let syncPromise=null,syncQueued=false,syncQueuedInteractive=false,syncCurrentInteractive=false;${line('syncNow')};this.syncNow=syncNow`, context);
const a = context.syncNow(true);
const b = context.syncNow(true);
releaseFirst();
assert.equal(await a, true);
assert.equal(await b, true);
assert.deepEqual(calls, [true], 'concurrent interactive syncs must coalesce');

let releaseNonInteractive;
const nonInteractive = new Promise((resolve) => { releaseNonInteractive = resolve; });
calls.length = 0;
context.performSync = async (interactive) => {
  calls.push(interactive);
  if (calls.length === 1) await nonInteractive;
  return interactive;
};
const c = context.syncNow(false);
context.syncNow(true);
releaseNonInteractive();
assert.equal(await c, true);
assert.deepEqual(calls, [false, true], 'interactive request must follow an in-flight background attempt');

console.log('device sync coordination tests passed');
