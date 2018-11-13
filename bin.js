#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fast_glob_1 = __importDefault(require("fast-glob"));
const find_up_1 = __importDefault(require("find-up"));
const fs_extra_1 = require("fs-extra");
const os_1 = require("os");
const path_1 = require("path");
function tryRequire(module) {
    try {
        return require(module);
    }
    catch (_) {
        return null;
    }
}
async function tryAccess(path) {
    try {
        return (await fs_extra_1.access(path)) === undefined;
    }
    catch (_) {
        return false;
    }
}
async function globPackages(cwd, patterns) {
    const manifestPatterns = patterns.map((p) => path_1.join(p, 'package.json'));
    const packages = await fast_glob_1.default(manifestPatterns, { cwd });
    return packages.map((p) => path_1.dirname(p));
}
const nothing = Promise.resolve();
async function main() {
    const gitDir = await find_up_1.default('.git');
    if (!gitDir) {
        throw new Error(`Could not find a '.git' repository upwards from ${process.cwd()}`);
    }
    const root = path_1.dirname(gitDir);
    const manifest = require(path_1.join(root, 'package.json'));
    const lerna = tryRequire(path_1.join(root, 'lerna.json'));
    const packagePatterns = manifest.workspaces || (lerna ? lerna.packages : []);
    const [hasNpmLock, hasYarnLock, hasGitIgnore, packages] = await Promise.all([
        tryAccess(path_1.join(root, 'package-lock.json')),
        tryAccess(path_1.join(root, 'yarn.lock')),
        tryAccess(path_1.join(root, '.gitignore')),
        globPackages(root, packagePatterns)
    ]);
    if (!(hasNpmLock || hasYarnLock)) {
        throw new Error(`Could not find either a 'yarn.lock' or 'package-lock.json - aborted.`);
    }
    const tmp = await fs_extra_1.mkdtemp(path_1.join(os_1.tmpdir(), manifest.name));
    process.chdir(tmp);
    const copyToTmp = (name) => fs_extra_1.copy(path_1.join(root, name), path_1.join(tmp, name));
    await Promise.all([
        copyToTmp('package.json'),
        hasGitIgnore ? copyToTmp('.gitignore') : nothing,
        hasYarnLock ? copyToTmp('yarn.lock') : nothing,
        hasNpmLock ? copyToTmp('package-lock.json') : nothing,
        ...packages.map(async (p) => {
            await fs_extra_1.ensureDir(path_1.join(tmp, p));
            return copyToTmp(path_1.join(p, 'package.json'));
        })
    ]);
    child_process_1.spawnSync('git', ['init'], { stdio: 'inherit' });
    child_process_1.spawnSync(hasYarnLock ? 'yarn' : 'npm', ['install', '--ignore-scripts'], {
        stdio: 'inherit'
    });
    const toAdd = [
        '.',
        'node_modules',
        ...packages,
        ...packages.map(p => path_1.join(p, 'node_modules'))
    ];
    child_process_1.spawnSync('git', ['add', '-f', ...toAdd]);
    child_process_1.spawnSync('git', ['commit', '-m', 'initial']);
    child_process_1.spawnSync('cp', ['-r', path_1.join(root, 'node_modules'), tmp]);
    packages.forEach(p => child_process_1.spawnSync('cp', ['-r', path_1.join(root, p, 'node_modules'), path_1.join(tmp, p)]));
    child_process_1.spawnSync('git', ['diff', '--', '.', ':(exclude)node_modules/.yarn-integrity'], { stdio: 'inherit' });
}
main().catch(console.error);
