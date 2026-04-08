import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function stripBom(raw) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function readJsonIfExists(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = stripBom(fs.readFileSync(filePath, 'utf8'));
  return JSON.parse(raw);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function listFilesIfExists(dirPath, exts) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(dirPath, d.name))
    .filter((f) => exts.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function pickPrimary(files) {
  const msi = files.find((f) => f.ext === '.msi');
  if (msi) return msi;
  const nsis = files.find((f) => f.ext === '.exe');
  if (nsis) return nsis;
  const portable = files.find((f) => f.ext === '.zip');
  return portable ?? null;
}

function kindFromExt(ext) {
  if (ext === '.msi') return 'msi';
  if (ext === '.exe') return 'nsis';
  if (ext === '.zip') return 'portable';
  return ext.replace('.', '');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const repo = process.env.RELEASE_REPO || process.env.GITHUB_REPOSITORY || 'bighard-1/orbitterm-clients';
const tag = (process.env.RELEASE_TAG || '').trim();
assert(tag, 'RELEASE_TAG is required');

const releaseDir = path.join('releases', tag);
ensureDir(releaseDir);

const searchRoots = [
  { dir: path.join('src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle', 'msi'), exts: ['.msi'] },
  { dir: path.join('src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle', 'nsis'), exts: ['.exe'] },
  { dir: path.join('src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle', 'portable'), exts: ['.zip'] },
];

const found = [];
for (const root of searchRoots) {
  const files = listFilesIfExists(root.dir, root.exts);
  for (const file of files) {
    found.push({
      fullPath: file,
      file: path.basename(file),
      ext: path.extname(file).toLowerCase(),
    });
  }
}

assert(found.length > 0, 'No windows artifact found in msi/nsis/portable output directories.');

const hashMap = {};
for (const f of found) {
  const dst = path.join(releaseDir, f.file);
  copyFile(f.fullPath, dst);
  hashMap[f.file] = sha256File(dst);
}

const shaLines = Object.keys(hashMap)
  .sort((a, b) => a.localeCompare(b))
  .map((file) => `${hashMap[file]}  ./${file}`);
fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.windows.txt'), `${shaLines.join('\n')}\n`, 'utf8');

const latestPath = path.join('releases', 'latest.json');
const latest = readJsonIfExists(latestPath, {});
const primary = pickPrimary(found);
assert(primary, 'Unable to determine primary windows artifact.');

latest.version = tag;
latest.date = new Date().toISOString().slice(0, 10);
latest.windowsPackage = primary.file;
latest.windowsSha256 = hashMap[primary.file];
latest.windowsDownloadUrl = `https://raw.githubusercontent.com/${repo}/main/releases/${tag}/${primary.file}`;

const windowsPackages = {};
for (const f of found) {
  windowsPackages[kindFromExt(f.ext)] = {
    file: f.file,
    sha256: hashMap[f.file],
  };
}
latest.windowsPackages = windowsPackages;

const json = `${JSON.stringify(latest, null, 2)}\n`;
fs.writeFileSync(latestPath, json, 'utf8');
fs.writeFileSync(path.join(releaseDir, 'release-manifest.json'), json, 'utf8');

console.log(`[release] tag=${tag}`);
console.log(`[release] repo=${repo}`);
console.log(`[release] artifacts=${found.map((f) => f.file).join(', ')}`);
console.log(`[release] primary=${primary.file}`);
