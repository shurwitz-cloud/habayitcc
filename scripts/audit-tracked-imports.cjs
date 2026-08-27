const { execSync } = require('child_process');
const fs = require('fs');

const tracked = new Set(
  execSync('git ls-files src', { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, '/')),
);

function exists(imp) {
  const base = `src/${imp}`.replace(/\\/g, '/');
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/route.ts`,
    `${base}/page.tsx`,
  ];
  return candidates.some((c) => tracked.has(c) || fs.existsSync(c));
}

function trackedExists(imp) {
  const base = `src/${imp}`.replace(/\\/g, '/');
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/route.ts`,
    `${base}/page.tsx`,
  ];
  return candidates.some((c) => tracked.has(c));
}

const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const missing = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /from ['"]@\/([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    if (!trackedExists(m[1])) {
      const onDisk = exists(m[1]);
      missing.push({
        file: f,
        import: `@/${m[1]}`,
        onDiskOnly: onDisk,
      });
    }
  }
}

if (!missing.length) {
  console.log('OK: all @/ imports in tracked files resolve to tracked files');
  process.exit(0);
} else {
  console.error(`MISSING (${missing.length}): tracked files import modules that are not in git.`);
  console.error('Commit the missing files (or remove the imports) before pushing — this breaks Vercel preview builds.');
  for (const row of missing) {
    console.error(
      `${row.file}\n  ${row.import}${row.onDiskOnly ? '  (EXISTS LOCALLY, NOT IN GIT)' : '  (MISSING ENTIRELY)'}`,
    );
  }
  process.exit(1);
}
