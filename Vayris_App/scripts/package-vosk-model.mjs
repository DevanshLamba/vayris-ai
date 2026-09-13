/**
 * Repackages the unpacked Vosk model into the tar.gz that the UI loads, then
 * asserts the result is actually usable by vosk-browser.
 *
 * A Windows .zip stores no directory entries and mode 0600, which produces a
 * model tree emscripten cannot traverse - speech recognition then fails with
 * "does not contain model files". See ui/public/README-vosk-model.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'ui/public');
const MODEL = 'vosk-model-small-en-us-0.15';
const archive = resolve(publicDir, `${MODEL}.tar.gz`);

// The unpacked model lives outside ui/public on purpose: anything in public/
// is copied verbatim into the build, and only the .tar.gz is actually loaded.
const source = resolve(root, 'models', MODEL);
if (!existsSync(source)) {
  console.error(`[package-vosk-model] Missing unpacked model at ${source}`);
  console.error('Download vosk-model-small-en-us-0.15 and unpack it there first.');
  process.exit(1);
}

// Windows ships bsdtar as tar.exe, which rejects GNU's --mode/--owner flags.
// Prefer a GNU tar when one is on PATH (Git for Windows provides one).
function findTar() {
  const candidates = ['tar', 'C:/Program Files/Git/usr/bin/tar.exe', '/usr/bin/tar'];
  for (const bin of candidates) {
    try {
      const v = execFileSync(bin, ['--version'], { encoding: 'utf8' });
      if (v.includes('GNU tar')) return { bin, gnu: true };
    } catch { /* try the next candidate */ }
  }
  return { bin: 'tar', gnu: false };
}

const { bin, gnu } = findTar();
console.log(`[package-vosk-model] Packing ${source} (${gnu ? 'GNU tar' : 'bsdtar'})`);

const args = gnu
  ? ['--force-local', '--owner=0', '--group=0', '--numeric-owner', '--mode=u=rwX,go=rX', '-czf', archive, '-C', resolve(root, 'models'), MODEL]
  : ['-czf', archive, '-C', resolve(root, 'models'), MODEL];
execFileSync(bin, args, { stdio: 'inherit' });

// Verify rather than trust: the whole bug class is an archive that looks fine
// until emscripten tries to walk it.
const listing = execFileSync(bin, gnu ? ['--force-local', '-tvzf', archive] : ['-tvzf', archive], { encoding: 'utf8' });
const lines = listing.trim().split('\n');

const dirs = lines.filter((l) => l.startsWith('d'));
const badDirs = dirs.filter((l) => !/^d..x..x..x/.test(l));
const required = ['am/final.mdl', 'conf/mfcc.conf', 'conf/model.conf', 'graph/HCLr.fst', 'graph/Gr.fst', 'ivector/final.ie'];
const missing = required.filter((f) => !listing.includes(`${MODEL}/${f}`));

let failed = false;
if (dirs.length === 0) {
  console.error('[package-vosk-model] FAIL: archive contains no directory entries.');
  failed = true;
}
if (badDirs.length > 0) {
  console.error('[package-vosk-model] FAIL: directories lack the execute bit:');
  badDirs.forEach((l) => console.error('  ' + l));
  failed = true;
}
if (missing.length > 0) {
  console.error('[package-vosk-model] FAIL: missing required model files: ' + missing.join(', '));
  failed = true;
}
if (failed) process.exit(1);

console.log(`[package-vosk-model] OK - ${dirs.length} directories (all traversable), ${lines.length - dirs.length} files, ${(statSync(archive).size / 1e6).toFixed(1)} MB`);
console.log(`[package-vosk-model] Wrote ${archive}`);
