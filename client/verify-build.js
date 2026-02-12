#!/usr/bin/env node
// Build verification script for Base Mini App deployment

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const distDir = './dist';
const checks = [];

function check(name, fn) {
  try {
    const result = fn();
    checks.push({ name, pass: result.pass, message: result.message });
  } catch (err) {
    checks.push({ name, pass: false, message: err.message });
  }
}

// Check 1: Dist directory exists
check('Build output exists', () => {
  const exists = existsSync(distDir);
  return { pass: exists, message: exists ? '✓ dist/ found' : '✗ Run npm run build:miniapp first' };
});

// Check 2: Manifest exists
check('Mini App manifest', () => {
  const path = join(distDir, 'miniapp.manifest.json');
  const exists = existsSync(path);
  if (!exists) return { pass: false, message: '✗ miniapp.manifest.json missing' };

  const content = JSON.parse(readFileSync(path, 'utf8'));
  const hasAppId = content.base_app_id === '69891fb96dea3c7b8e14a02a';
  const hasChain = content.chain_id === 8453;

  return {
    pass: hasAppId && hasChain,
    message: hasAppId && hasChain ? '✓ Valid manifest' : '✗ Invalid manifest config'
  };
});

// Check 3: Index.html has meta tags
check('Mobile meta tags', () => {
  const path = join(distDir, 'index.html');
  if (!existsSync(path)) return { pass: false, message: '✗ index.html missing' };

  const html = readFileSync(path, 'utf8');
  const hasMobileCapable = html.includes('mobile-web-app-capable');
  const hasViewport = html.includes('width=device-width');
  const hasManifest = html.includes('miniapp.manifest.json');

  return {
    pass: hasMobileCapable && hasViewport && hasManifest,
    message: (hasMobileCapable && hasViewport && hasManifest) ? '✓ Mobile ready' : '✗ Missing mobile meta tags'
  };
});

// Check 4: No localhost references in JS
check('Production URLs', () => {
  const path = join(distDir, 'index.html');
  if (!existsSync(path)) return { pass: false, message: '✗ index.html missing' };

  const html = readFileSync(path, 'utf8');
  const hasLocalhost = html.includes('localhost') || html.includes('127.0.0.1');

  return {
    pass: !hasLocalhost,
    message: hasLocalhost ? '✗ Localhost references found' : '✓ No localhost references'
  };
});

// Check 5: Assets exist
check('Static assets', () => {
  const assetsPath = join(distDir, 'assets');
  const exists = existsSync(assetsPath);
  return {
    pass: exists,
    message: exists ? '✓ Assets bundled' : '✗ Assets missing'
  };
});

// Print results
console.log('\n🔍 Base Mini App Build Verification\n');
checks.forEach(({ name, pass, message }) => {
  console.log(`${pass ? '✅' : '❌'} ${name}: ${message}`);
});

const allPassed = checks.every(c => c.pass);
console.log(`\n${allPassed ? '✅ All checks passed! Ready for deployment.' : '❌ Some checks failed. Fix issues before deploying.'}\n`);

process.exit(allPassed ? 0 : 1);
