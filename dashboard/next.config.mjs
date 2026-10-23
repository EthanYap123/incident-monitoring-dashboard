import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pages = process.env.DEPLOY_TARGET === 'pages';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: nginx serves it in Docker, GitHub Pages serves the demo build.
  output: 'export',
  basePath: pages ? '/incident-monitoring-dashboard' : '',
  trailingSlash: true,
  images: { unoptimized: true },
  // The shared engine lives in ../packages/core, outside this folder.
  transpilePackages: ['@imd/core'],
  turbopack: { root: path.join(here, '..') },
  env: {
    NEXT_PUBLIC_BASE_PATH: pages ? '/incident-monitoring-dashboard' : '',
  },
};

export default nextConfig;
