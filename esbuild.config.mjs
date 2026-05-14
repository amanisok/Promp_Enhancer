import esbuild from 'esbuild';

const isProd = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');
const proxyUrl =
  process.env.PROXY_URL ?? 'https://YOUR-WORKER-SUBDOMAIN.workers.dev/enhance';

/** @type {import('esbuild').BuildOptions} */
const baseConfig = {
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  platform: 'browser',
  sourcemap: isProd ? false : 'inline',
  minify: isProd,
  logLevel: 'info',
  drop: isProd ? ['console', 'debugger'] : [],
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
    'process.env.PROXY_URL': JSON.stringify(proxyUrl),
  },
};

const entries = [
  { in: 'src/content/index.ts', out: 'dist/content.js' },
  { in: 'src/background/service-worker.ts', out: 'dist/service-worker.js' },
  { in: 'src/popup/popup.ts', out: 'dist/popup.js' },
];

async function run() {
  if (isWatch) {
    const ctxs = await Promise.all(
      entries.map((e) =>
        esbuild.context({ ...baseConfig, entryPoints: [e.in], outfile: e.out })
      )
    );
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log('[esbuild] watching...');
  } else {
    await Promise.all(
      entries.map((e) =>
        esbuild.build({ ...baseConfig, entryPoints: [e.in], outfile: e.out })
      )
    );
    console.log('[esbuild] build complete');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
