const { execSync } = require('child_process');
const fs = require('fs');

function gitLsFiles(args) {
  try {
    return execSync(`git ls-files ${args}`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const trackedList = gitLsFiles('src');
if (!trackedList) {
  console.log('OK: skipping import audit (git unavailable in this environment)');
  process.exit(0);
}

const tracked = new Set(
  trackedList
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

const filesRaw = gitLsFiles('"src/**/*.ts" "src/**/*.tsx"');
if (!filesRaw) {
  process.exit(0);
}
const files = filesRaw.split(/\r?\n/).filter(Boolean);

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
