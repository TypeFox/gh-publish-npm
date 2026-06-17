/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import fs from 'fs';
import path from 'path';
import { execFile, execFileSync } from 'child_process';
import { compare } from 'semver';

export interface PublishOptions {
    npmPackages: string[];
    vscodePackages: string[];
    dryRun: boolean;
    npmToken?: string;
    vsceToken?: string;
    ovsxToken?: string;
    vsceVersion: string;
    ovsxVersion: string;
}

export async function publishPackages(opts: PublishOptions): Promise<void> {
    const { npmPackages, vscodePackages, dryRun, npmToken, vsceToken, ovsxToken, vsceVersion, ovsxVersion } = opts;

    if (dryRun) {
        console.log('Running in dry mode. No packages will be published.');
    }

    let publishedAny = false;

    const packagesToPublish: string[] = [];
    for (const pkg of npmPackages) {
        const upToDate = await isUpToDate(pkg);
        if (upToDate) {
            console.log(`Package at ${pkg} is up to date. Skipping publish.`);
        } else {
            console.log(`Package at ${pkg} has updates. Adding to publish list.`);
            packagesToPublish.push(pkg);
        }
    }
    for (const pkg of packagesToPublish) {
        await publishPackage(pkg, dryRun, npmToken);
        publishedAny = true;
    }

    for (const extPath of vscodePackages) {
        const published = await publishExtension(extPath, dryRun, vsceToken, ovsxToken, vsceVersion, ovsxVersion);
        if (published) {
            publishedAny = true;
        }
    }

    if (!publishedAny) {
        console.log('All packages are up to date. Nothing to publish.');
    }
}

/**
 * Build the argument list for invoking a CLI tool (vsce/ovsx) through npx.
 *
 * When `cliVersion` is 'provided' (the default/recommended setting), we run the
 * version installed in the consuming project's devDependencies via
 * `npx --no-install`, which never downloads from the registry and fails if the
 * tool is not installed locally. Any other value falls back to fetching the
 * requested version on demand (`tool@version`) at the caller's own risk.
 */
function npxArgs(tool: 'vsce' | 'ovsx', cliVersion: string, args: string[]): string[] {
    if (cliVersion === 'provided') {
        return ['--no-install', tool, ...args];
    }
    return [`${tool}@${cliVersion}`, ...args];
}

async function readPackageJson(packagePath?: string): Promise<Record<string, string>> {
    const filePath = path.join(packagePath ?? '.', 'package.json');
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

async function isUpToDate(packagePath: string): Promise<boolean> {
    const { name, version } = await readPackageJson(packagePath);
    return new Promise((resolve, reject) => {
        execFile('npm', ['view', name, 'version'], { cwd: packagePath }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr.includes('code E404')) {
                reject(new Error(`Package ${name} not found on npm registry.`));
                return;
            }
            const publishedVersion = stdout.trim();
            resolve(compare(version, publishedVersion) !== 1);
        });
    });
}

async function publishPackage(packagePath: string, dryRun: boolean, npmToken?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (dryRun) {
            console.log(`[Dry Run] Would publish package at ${packagePath}`);
            resolve();
            return;
        }
        const env = { ...process.env };
        if (npmToken) {
            env.NODE_AUTH_TOKEN = npmToken;
        }
        execFile('npm', ['publish', '--provenance', '--access', 'public'], { cwd: packagePath, env }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            console.log(`Successfully published package at ${packagePath}:`, stdout);
            resolve();
        });
    });
}

async function publishExtension(packagePath: string, dryRun: boolean, vsceToken?: string, ovsxToken?: string, vsceCliVersion = 'provided', ovsxCliVersion = 'provided'): Promise<boolean> {
    const { name, publisher, version } = await readPackageJson(packagePath);
    const fullName = `${publisher}.${name}`;
    const vsceVersion = await getVsceVersion(fullName, packagePath, vsceCliVersion);
    const ovsxVersion = await getOvsxVersion(fullName, packagePath, ovsxCliVersion);
    const shouldPublishVsce = compare(version, vsceVersion) === 1;
    const shouldPublishOvsx = compare(version, ovsxVersion) === 1;
    const fileName = `${name}-${version}.vsix`;

    if (shouldPublishVsce || shouldPublishOvsx) {
        console.log(`Extension ${fullName} has updates. Generating vsix...`);
        if (!dryRun) {
            // npx.cmd is needed on Windows; out of scope (publishes on ubuntu-latest)
            execFileSync('npx', npxArgs('vsce', vsceCliVersion, ['package', '-o', fileName]), { cwd: packagePath });
        }
    }

    if (shouldPublishVsce) {
        console.log(`Publishing VSCE extension ${fullName}...`);
        await publishVsce(packagePath, fileName, dryRun, vsceToken, vsceCliVersion);
    } else {
        console.log(`VSCE extension ${fullName} is up to date. Skipping publish.`);
    }

    if (shouldPublishOvsx) {
        console.log(`Publishing OVSX extension ${fullName}...`);
        await publishOvsx(packagePath, fileName, dryRun, ovsxToken, ovsxCliVersion);
    } else {
        console.log(`OVSX extension ${fullName} is up to date. Skipping publish.`);
    }

    return shouldPublishVsce || shouldPublishOvsx;
}

async function getVsceVersion(id: string, packagePath: string, cliVersion = 'provided'): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile('npx', npxArgs('vsce', cliVersion, ['show', id, '--json']), { cwd: packagePath }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const info = JSON.parse(stdout);
            resolve(info.versions[0].version);
        });
    });
}

async function publishVsce(packagePath: string, fileName: string, dryRun: boolean, token?: string, cliVersion = 'provided'): Promise<void> {
    return new Promise((resolve, reject) => {
        if (dryRun) {
            console.log(`[Dry Run] Would publish VSCE extension at ${packagePath}`);
            resolve();
            return;
        }
        // Pass the token via VSCE_PAT instead of argv so it never appears in
        // process listings or in execFile's error message on failure.
        const env = { ...process.env };
        if (token) {
            env.VSCE_PAT = token;
        }
        execFile('npx', npxArgs('vsce', cliVersion, ['publish', fileName]), { cwd: packagePath, env }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            console.log(`Successfully published VSCE extension at ${packagePath}:`, stdout);
            resolve();
        });
    });
}

async function getOvsxVersion(id: string, packagePath: string, cliVersion = 'provided'): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile('npx', npxArgs('ovsx', cliVersion, ['get', id, '--metadata']), { cwd: packagePath }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const info = JSON.parse(stdout);
            resolve(info.version);
        });
    });
}

async function publishOvsx(packagePath: string, fileName: string, dryRun: boolean, token?: string, cliVersion = 'provided'): Promise<void> {
    return new Promise((resolve, reject) => {
        if (dryRun) {
            console.log(`[Dry Run] Would publish OVSX extension at ${packagePath}`);
            resolve();
            return;
        }
        // Pass the token via OVSX_PAT instead of argv so it never appears in
        // process listings or in execFile's error message on failure.
        const env = { ...process.env };
        if (token) {
            env.OVSX_PAT = token;
        }
        execFile('npx', npxArgs('ovsx', cliVersion, ['publish', fileName]), { cwd: packagePath, env }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            console.log(`Successfully published OVSX extension at ${packagePath}:`, stdout);
            resolve();
        });
    });
}
