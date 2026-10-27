import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// GitHub Pages serves the site from /<repository>/; the deploy workflow passes that prefix in.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

export default function config(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    // workspace packages ship TypeScript sources
    transpilePackages: ['@tools/ui', '@tools/globe', '@tools/silhouette'],
    // the site has no server code: `next build` writes plain files to out/, which any static host can serve
    output: 'export',
    // /globe/ → globe/index.html, which static hosts resolve without rewrite rules
    trailingSlash: true,
    basePath,
    // A build always compiles into .next (with `output: export` Next forces that) and writes the site to out/.
    // The dev server gets its own folder, so running a build never pulls the files from under a running `dev`.
    ...(phase === PHASE_DEVELOPMENT_SERVER ? { distDir: '.next-dev' } : {}),
  };
}
