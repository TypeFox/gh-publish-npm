/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import * as core from '@actions/core';

export type PublishStatus = 'published' | 'skipped' | 'dry-run';

export type NpmPackageResult = {
    projectName: string;
    packagePath: string;
    localVersion: string;
    publishedVersion: string;
    tag?: string;
    status: PublishStatus;
};

export type ExtensionResult = {
    id: string;
    packagePath: string;
    localVersion: string;
    vsceVersion: string;
    ovsxVersion: string;
    vsce: PublishStatus;
    ovsx: PublishStatus;
};

export type PublishSummary = {
    dryRun: boolean;
    npmTag: string;
    npmPackages: NpmPackageResult[];
    extensions: ExtensionResult[];
};

export function deriveNpmStatus(isUpToDate: boolean, dryRun: boolean): PublishStatus {
    if (isUpToDate) {
        return 'skipped';
    }
    return dryRun ? 'dry-run' : 'published';
}

export function deriveMarketplaceStatus(shouldPublish: boolean, dryRun: boolean): PublishStatus {
    if (!shouldPublish) {
        return 'skipped';
    }
    return dryRun ? 'dry-run' : 'published';
}

const STATUS_LABELS: Record<PublishStatus, string> = {
    published: '✅ Published',
    skipped: '➖ Up to date',
    'dry-run': '🟡 Would publish'
};

function extensionColumn(version: string, status: PublishStatus): string {
    return `${version} → ${STATUS_LABELS[status]}`;
}

export async function renderSummary(summary: PublishSummary): Promise<void> {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        core.warning('GITHUB_STEP_SUMMARY is not set; skipping job summary.');
        return;
    }

    core.summary
        .addHeading('📦 Publish summary', 2)
        .addRaw(`Mode: ${summary.dryRun ? 'Dry run' : 'Live'} · npm tag: \`${summary.npmTag}\``, true);

    if (summary.npmPackages.length > 0) {
        core.summary.addHeading('npm packages', 3).addTable([
            [
                { data: 'Package', header: true },
                { data: 'Path', header: true },
                { data: 'Published', header: true },
                { data: 'Local', header: true },
                { data: 'Status', header: true }
            ],
            ...summary.npmPackages.map((p) => [p.projectName, p.packagePath, p.publishedVersion, p.localVersion, STATUS_LABELS[p.status]])
        ]);
    }

    if (summary.extensions.length > 0) {
        core.summary.addHeading('VS Code extensions', 3).addTable([
            [
                { data: 'Extension', header: true },
                { data: 'Local', header: true },
                { data: 'VS Marketplace', header: true },
                { data: 'Open VSX', header: true }
            ],
            ...summary.extensions.map((e: ExtensionResult) => [
                e.id,
                e.localVersion,
                extensionColumn(e.vsceVersion, e.vsce),
                extensionColumn(e.ovsxVersion, e.ovsx)
            ])
        ]);
    }

    if (summary.npmPackages.length === 0 && summary.extensions.length === 0) {
        core.summary.addRaw('All packages are up to date. Nothing to publish.', true);
    }

    await core.summary.write();
}
