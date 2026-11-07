// Sends a JavaScript-only fix to the phones that already have the app, without
// a new APK: `npm run update -- "what changed"`.
//
// The installed APKs ask the "preview" channel (app.json, updates.requestHeaders)
// for updates made for their runtime version, which is the app's version in
// app.json. A phone downloads the update while the app starts and uses it from
// the next start on.
//
// The update is bundled here, from the same .env files as the APK, and then
// uploaded as it is: so it always talks to the same server as the APK. Before
// uploading, it checks that the server's address really is inside the bundle;
// an update without it would put every phone into the offline demo.
//
// What an update cannot change: anything native (a new library with native
// code, app.json, the icon or splash, the Expo SDK). Those need a new APK, and
// with a new APK, raise "version" in app.json so old phones are not sent code
// they cannot run.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const CHANNEL = 'preview';
const OUT = 'dist-update';

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Say what the update changes: npm run update -- "Fixes the events list"');
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync([cmd, ...args].join(' '), { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, CI: '1' } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// The server's address, read the way Expo reads it: .env.local over .env.
function envValue(key) {
  let value = '';
  for (const f of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
      if (m) value = m[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return value;
}
const apiUrl = envValue('EXPO_PUBLIC_API_URL');
if (!apiUrl) {
  console.error('EXPO_PUBLIC_API_URL is empty in mobile/.env.local: the update would only have the offline demo. Nothing was sent.');
  process.exit(1);
}

rmSync(join(root, OUT), { recursive: true, force: true });
run('npx', ['expo', 'export', '--platform', 'android', '--output-dir', OUT, '--clear']);

function files(dir) {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
}
const bundles = files(join(root, OUT)).filter((f) => /\.(hbc|js)$/.test(f) && !f.endsWith('.map'));
if (!bundles.some((f) => readFileSync(f).includes(apiUrl))) {
  console.error(`The bundle does not contain ${apiUrl}. Nothing was sent.`);
  process.exit(1);
}
console.log(`\n> the bundle talks to ${apiUrl}\n`);

run('npx', [
  '--yes',
  'eas-cli@latest',
  'update',
  '--skip-bundler',
  '--input-dir',
  OUT,
  '--channel',
  CHANNEL,
  '--environment',
  'preview',
  '--platform',
  'android',
  '--non-interactive',
  '--message',
  JSON.stringify(message),
]);
console.log(`\n> sent to the "${CHANNEL}" channel. Phones get it within two starts of the app (close it fully, open it, close it again, open it).`);
