/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { compare, parse, SemVer } from 'semver';

export type PublishOptions = {
    npmPackages: string[];
    vscodePackages: string[];
    dryRun: boolean;
    npmTagOverride?: string;
    npmToken?: string;
    vsceToken?: string;
    ovsxToken?: string;
    vsceVersion: string;
    ovsxVersion: string;
};

export type PublishPackageOptions = {
    packagePublishInfo: PackagePublishInfo;
    dryRun: boolean;
    npmTagOverride?: string;
    npmToken?: string;
};

export type PackagePublishInfo = {
    packageName: string;
    isUpToDate: boolean;
    tag?: string;
    version: SemVer;
};

export type PublishExtensionOptions = {
    packagePath: string;
    dryRun: boolean;
    vsceToken?: string;
    ovsxToken?: string;
    vsceCliVersion: string;
    ovsxCliVersion: string;
};

export type VersionDefinition = {
    id: string;
    packagePath: string;
    cliVersion: string;
};

export type PublishExecOptions = {
    packagePath: string;
    fileName: string;
    dryRun: boolean;
    token?: string;
    cliVersion: string;
};

export async function publishPackages(opts: PublishOptions): Promise<void> {
    const { npmPackages, vscodePackages, dryRun, npmTagOverride, npmToken, vsceToken, ovsxToken, vsceVersion, ovsxVersion } = opts;

    if (dryRun) {
        console.log('Running in dry mode. No packages will be published.');
    }

    let publishedAny = false;

    const publishPackageOptions: Array<PublishPackageOptions> = [];
    for (const npmPackage of npmPackages) {
        const packagePublishInfo = await checkNpmVersionStatus(npmPackage);
        if (packagePublishInfo.isUpToDate) {
            console.log(`Package at ${npmPackage} is up to date. Skipping publish.`);
        } else {
            console.log(`Package at ${npmPackage} has updates. Adding to publish list.`);
            publishPackageOptions.push({ packagePublishInfo, dryRun, npmTagOverride, npmToken });
        }
    }
    for (const publishPackageOption of publishPackageOptions) {
        const publishArgs = preparePublishPackage(publishPackageOption);
        await publishPackage(publishArgs, publishPackageOption);
        publishedAny = true;
    }

    for (const extPath of vscodePackages) {
        const published = await publishExtension({
            packagePath: extPath,
            dryRun,
            vsceToken,
            ovsxToken,
            vsceCliVersion: vsceVersion,
            ovsxCliVersion: ovsxVersion
        });
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
function buildNpxArgs(tool: 'vsce' | 'ovsx', cliVersion: string, args: string[]): string[] {
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

async function checkNpmVersionStatus(packagePath: string): Promise<PackagePublishInfo> {
    const { name, version } = await readPackageJson(packagePath);
    return new Promise((resolve, reject) => {
        execFile('npm', ['view', name, 'version'], { cwd: packagePath }, (error, stdout, stderr) => {
            if (error === null || stderr.includes('code E404')) {
                reject(error ?? new Error(`Package ${name} not found on npm registry.`));
            } else {
                resolve(processVersions(name, version, stdout.trim()));
            }
        });
    });
}

export function processVersions(packageName: string, version: string, publishedVersion: string): PackagePublishInfo {
    const parsedPublishedVersion = parse(publishedVersion);
    const parsedVersion = parse(version);

    if (parsedPublishedVersion !== null && parsedVersion !== null) {
        const isUpToDate = compare(parsedVersion, parsedPublishedVersion) !== 1;
        const preRelease = parsedVersion.prerelease.length > 0 ? true : false;
        const tag = preRelease ? parsedVersion.prerelease[0].toString() : undefined;
        return {
            packageName,
            isUpToDate,
            tag,
            version: parsedVersion
        };
    } else {
        throw new Error(`Failed to parse versions of package "${packageName}": [version: ${version}, publish: ${publishedVersion}]`);
    }
}

export function preparePublishPackage(options: PublishPackageOptions): string[] {
    const { packagePublishInfo, dryRun, npmTagOverride } = options;
    let publishArgs = ['publish', '--provenance', '--access', 'public'];
    const npmTag = npmTagOverride ?? packagePublishInfo.tag;
    if (npmTag !== undefined) {
        publishArgs.splice(1, 0, '--tag', npmTag);
    }
    if (dryRun) {
        publishArgs.splice(1, 0, '--dry-run');
    }
    return publishArgs;
}

async function publishPackage(publishArgs: string[], options: PublishPackageOptions): Promise<void> {
    const env = { ...process.env };
    const { packagePublishInfo, dryRun, npmToken } = options;
    if (npmToken !== undefined) {
        env.NODE_AUTH_TOKEN = npmToken;
    }
    return new Promise((resolve, reject) => {
        execFile('npm', publishArgs, { cwd: packagePublishInfo.packageName, env }, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                if (dryRun) {
                    console.log(`[Dry Run] Would publish package at ${packagePublishInfo.packageName}`, stdout);
                } else {
                    console.log(`Successfully published package at ${packagePublishInfo.packageName}:`, stdout);
                }
                resolve();
            }
        });
    });
}

async function publishExtension(options: PublishExtensionOptions): Promise<boolean> {
    const { packagePath, dryRun, vsceToken, ovsxToken, vsceCliVersion, ovsxCliVersion } = options;
    const { name, publisher, version } = await readPackageJson(packagePath);
    const id = `${publisher}.${name}`;
    const vsceVersion = await getVsceVersion({ id, packagePath, cliVersion: vsceCliVersion });
    const ovsxVersion = await getOvsxVersion({ id, packagePath, cliVersion: ovsxCliVersion });
    const shouldPublishVsce = compare(version, vsceVersion) === 1;
    const shouldPublishOvsx = compare(version, ovsxVersion) === 1;
    const fileName = `${name}-${version}.vsix`;

    if (shouldPublishVsce || shouldPublishOvsx) {
        console.log(`Extension ${id} has updates. Generating vsix...`);
        if (!dryRun) {
            // npx.cmd is needed on Windows; out of scope (publishes on ubuntu-latest)
            const npxArgs = buildNpxArgs('vsce', vsceCliVersion, ['package', '-o', fileName]);
            execFileSync('npx', npxArgs, {
                cwd: packagePath
            });
        }
    }

    if (shouldPublishVsce) {
        console.log(`Publishing VSCE extension ${id}...`);
        await publishVsce({ packagePath, fileName, dryRun, token: vsceToken, cliVersion: vsceCliVersion });
    } else {
        console.log(`VSCE extension ${id} is up to date. Skipping publish.`);
    }

    if (shouldPublishOvsx) {
        console.log(`Publishing OVSX extension ${id}...`);
        await publishOvsx({ packagePath, fileName, dryRun, token: ovsxToken, cliVersion: ovsxCliVersion });
    } else {
        console.log(`OVSX extension ${id} is up to date. Skipping publish.`);
    }

    return shouldPublishVsce || shouldPublishOvsx;
}

async function getVsceVersion(versionDefinition: VersionDefinition): Promise<string> {
    const { id, packagePath, cliVersion } = versionDefinition;
    return new Promise((resolve, reject) => {
        const npxArgs = buildNpxArgs('vsce', cliVersion, ['show', id, '--json']);
        execFile('npx', npxArgs, { cwd: packagePath }, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                const info = JSON.parse(stdout);
                resolve(info.versions[0].version);
            }
        });
    });
}

async function publishVsce(options: PublishExecOptions): Promise<void> {
    const { packagePath, fileName, dryRun, token, cliVersion } = options;
    return new Promise((resolve, reject) => {
        // fast-path: if dryRun is true, we don't need to continue
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
        const npxArgs = buildNpxArgs('vsce', cliVersion, ['publish', fileName]);
        execFile('npx', npxArgs, { cwd: packagePath, env }, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                console.log(`Successfully published VSCE extension at ${packagePath}:`, stdout);
                resolve();
            }
        });
    });
}

async function getOvsxVersion(versionDefinition: VersionDefinition): Promise<string> {
    const { id, packagePath, cliVersion } = versionDefinition;
    return new Promise((resolve, reject) => {
        const npxArgs = buildNpxArgs('ovsx', cliVersion, ['get', id, '--metadata']);
        execFile('npx', npxArgs, { cwd: packagePath }, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                const info = JSON.parse(stdout);
                resolve(info.version);
            }
        });
    });
}

async function publishOvsx(options: PublishExecOptions): Promise<void> {
    const { packagePath, fileName, dryRun, token, cliVersion } = options;
    return new Promise((resolve, reject) => {
        // fast-path: if dryRun is true, we don't need to continue
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
        const npxArgs = buildNpxArgs('ovsx', cliVersion, ['publish', fileName]);
        execFile('npx', npxArgs, { cwd: packagePath, env }, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                console.log(`Successfully published OVSX extension at ${packagePath}:`, stdout);
                resolve();
            }
        });
    });
}
