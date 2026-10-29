// Builds the test APK: `npm run apk` (64-bit phones), `npm run apk -- --all`
// (also old 32-bit phones; slower) or `npm run apk -- --emulator` (the PC's
// x86_64 Android emulator, which cannot start the arm64 APK).
// Faster than prebuild --clean every time: android/ is made again only when what it is made from changed (app.json,
// package.json, the lock file, the plugins, the brand pictures), so Gradle can
// reuse the last build. The APK is copied to builds/.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const all = process.argv.includes('--all');
const emulator = process.argv.includes('--emulator');
const started = Date.now();

// Gradle needs the Android SDK; use Android Studio's usual place if it is not set.
const env = { ...process.env, CI: '1' };
const defaultSdk = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT && defaultSdk && existsSync(defaultSdk)) env.ANDROID_HOME = defaultSdk;

function run(cmd, args, cwd = root) {
  const r = spawnSync([cmd, ...args].join(' '), { cwd, stdio: 'inherit', shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const inputs = ['app.json', 'package.json', 'package-lock.json', 'google-services.json']
  .concat(readdirSync(join(root, 'plugins')).map((f) => `plugins/${f}`))
  .concat(readdirSync(join(root, 'assets/brand')).map((f) => `assets/brand/${f}`));
const hash = createHash('sha256');
for (const f of inputs) if (existsSync(join(root, f))) hash.update(f).update(readFileSync(join(root, f)));
const stamp = hash.digest('hex');
const stampFile = join(root, 'android', '.prebuild-stamp');

if (!existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== stamp) {
  console.log('\n> android/ is out of date: making it again (expo prebuild --clean)\n');
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean']);
  writeFileSync(stampFile, stamp);
} else {
  console.log('\n> android/ is up to date: reusing the last build\n');
}

const abis = emulator ? 'x86_64' : all ? 'arm64-v8a,armeabi-v7a' : 'arm64-v8a';
// The full path: Windows may be set not to look in the current folder for programs.
const gradlew = join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
run(`"${gradlew}"`, ['assembleRelease', `-PreactNativeArchitectures=${abis}`, '--build-cache'], join(root, 'android'));

const version = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version;
mkdirSync(join(root, 'builds'), { recursive: true });
const out = join(root, 'builds', `good-deeds-${version}-${emulator ? 'x86_64' : all ? 'arm' : 'arm64'}.apk`);
copyFileSync(join(root, 'android/app/build/outputs/apk/release/app-release.apk'), out);
console.log(`\n> ${out}\n> took ${Math.round((Date.now() - started) / 60000)} min`);
