#!/usr/bin/env node

import { spawnSync } from 'child_process';
import glob from 'fast-glob';
import findUp from 'find-up';
import { access, ensureDir, copy, mkdtemp } from 'fs-extra';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

function tryRequire(module: string): any | null {
  try {
    return require(module);
  } catch (_) {
    return null;
  }
}

async function tryAccess(path: string): Promise<boolean> {
  try {
    return (await access(path)) === undefined;
  } catch (_) {
    return false;
  }
}

async function globPackages(
  cwd: string,
  patterns: string[]
): Promise<string[]> {
  const manifestPatterns = patterns.map((p: string) => join(p, 'package.json'));
  const packages = await glob(manifestPatterns, { cwd });
  return packages.map((p: string) => dirname(p));
}

const nothing = Promise.resolve();

async function main(): Promise<void> {
  const gitDir = await findUp('.git');
  if (!gitDir) {
    throw new Error(
      `Could not find a '.git' repository upwards from ${process.cwd()}`
    );
  }

  const root = dirname(gitDir);
  const manifest = require(join(root, 'package.json'));
  const lerna = tryRequire(join(root, 'lerna.json'));

  const packagePatterns = manifest.workspaces || (lerna ? lerna.packages : []);

  const [hasNpmLock, hasYarnLock, hasGitIgnore, packages] = await Promise.all([
    tryAccess(join(root, 'package-lock.json')),
    tryAccess(join(root, 'yarn.lock')),
    tryAccess(join(root, '.gitignore')),
    globPackages(root, packagePatterns)
  ]);

  if (!(hasNpmLock || hasYarnLock)) {
    throw new Error(
      `Could not find either a 'yarn.lock' or 'package-lock.json - aborted.`
    );
  }

  const tmp = await mkdtemp(join(tmpdir(), manifest.name));
  process.chdir(tmp);

  const copyToTmp = (name: string): Promise<void> =>
    copy(join(root, name), join(tmp, name));

  await Promise.all([
    copyToTmp('package.json'),
    hasGitIgnore ? copyToTmp('.gitignore') : nothing,
    hasYarnLock ? copyToTmp('yarn.lock') : nothing,
    hasNpmLock ? copyToTmp('package-lock.json') : nothing,
    ...packages.map(async p => {
      await ensureDir(join(tmp, p));
      return copyToTmp(join(p, 'package.json'));
    })
  ]);

  spawnSync('git', ['init'], { stdio: 'inherit' });

  spawnSync(hasYarnLock ? 'yarn' : 'npm', ['install', '--ignore-scripts'], {
    stdio: 'inherit'
  });

  const toAdd = [
    '.',
    'node_modules',
    ...packages,
    ...packages.map(p => join(p, 'node_modules'))
  ];
  spawnSync('git', ['add', '-f', ...toAdd]);

  spawnSync('git', ['commit', '-m', 'initial']);

  spawnSync('cp', ['-r', join(root, 'node_modules'), tmp]);
  packages.forEach(p =>
    spawnSync('cp', ['-r', join(root, p, 'node_modules'), join(tmp, p)])
  );

  spawnSync(
    'git',
    ['diff', '--', '.', ':(exclude)node_modules/.yarn-integrity'],
    { stdio: 'inherit' }
  );
}

main().catch(console.error);
