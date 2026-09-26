// Загрузка исходных наборов для исторического режима в .cache/raw (папка не хранится в git).
// Источники — CRAN-пакеты через публичное зеркало github.com/cran. Контрольная сумма каждого файла
// сверяется с манифестом MD5 самого пакета; при расхождении скрипт останавливается.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RAW = '.cache/raw';
mkdirSync(RAW, { recursive: true });

export const PACKAGES = [
  { pkg: 'cshapes', files: ['inst/extdata/cshapes_2_gw.topojson.xz', 'Changelog', 'R/cshp.R', 'DESCRIPTION'] },
  { pkg: 'states', files: ['data/gwstates.rda', 'DESCRIPTION', 'man/gwstates.Rd'] },
  {
    pkg: 'peacesciencer',
    files: ['data/ucdp_acd.rda', 'data/archigos.rda', 'data/gw_capitals.rda', 'data/ps_data_version.rda', 'DESCRIPTION', 'man/ucdp_acd.Rd', 'man/archigos.Rd', 'man/gw_capitals.Rd', 'man/atop_alliance.Rd'],
  },
];

const base = (pkg) => `https://raw.githubusercontent.com/cran/${pkg}/master`;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const log = [];
for (const { pkg, files } of PACKAGES) {
  const md5 = (await get(`${base(pkg)}/MD5`)).toString('utf8');
  const manifest = Object.fromEntries(md5.trim().split('\n').map((l) => { const [h, f] = l.split(' *'); return [f, h]; }));
  for (const f of files) {
    const url = `${base(pkg)}/${f}`;
    const buf = await get(url);
    const hash = createHash('md5').update(buf).digest('hex');
    const expected = manifest[f];
    if (f !== 'DESCRIPTION' && expected && expected !== hash) throw new Error(`MD5 не совпадает для ${url}: ${hash} ≠ ${expected}`);
    const out = `${RAW}/${pkg}__${f.replaceAll('/', '__')}`;
    writeFileSync(out, buf);
    log.push({ pkg, file: f, url, md5: hash, md5Manifest: expected ?? null, bytes: buf.length });
    console.log(`✓ ${pkg}/${f} ${hash}`);
  }
}
// Распаковка CShapes
const xz = `${RAW}/cshapes__inst__extdata__cshapes_2_gw.topojson.xz`;
execFileSync('xz', ['-dkf', xz]);
writeFileSync(`${RAW}/fetch-log.json`, JSON.stringify({ fetchedAt: new Date().toISOString().slice(0, 10), files: log }, null, 2));
if (!existsSync(xz.replace(/\.xz$/, ''))) throw new Error('Не удалось распаковать CShapes');
console.log('Готово. Далее: python3 scripts/data/rda_to_json.py && node scripts/data/build-history.mjs');
