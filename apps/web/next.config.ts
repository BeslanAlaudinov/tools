import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

// GitHub Pages serves the site from /<repository>/; the deploy workflow passes that prefix in.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

export default function config(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    // workspace packages ship TypeScript sources
    transpilePackages: ['@tools/ui', '@tools/globe'],
    // the site has no server code: `next build` writes plain files to out/, which any static host can serve
    output: 'export',
    // /globe/ → globe/index.html, which static hosts resolve without rewrite rules
    trailingSlash: true,
    basePath,
    // the build writes to out/ (with `output: export` that is also where the site lands), never to .next,
    // so it can run while `dev` is serving from .next
    distDir: phase === PHASE_PRODUCTION_BUILD ? 'out' : '.next',
  };
}
