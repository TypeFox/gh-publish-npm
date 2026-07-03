/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import * as core from '@actions/core';
import { publishPackages } from './publish.js';

function parseList(input: string): string[] {
    return input.split('\n').map(s => s.trim()).filter(Boolean);
}

const TRUTHY = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSY = new Set(['false', '0', 'no', 'n', 'off']);

function parseDryRun(input: string): boolean {
    const value = input.trim().toLowerCase();
    if (TRUTHY.has(value)) {
        return true;
    }
    if (!value || FALSY.has(value)) {
        return false;
    }
    core.warning(`Unrecognized dry-run value "${input}"; defaulting to dry-run (no packages will be published).`);
    return true;
}

async function run(): Promise<void> {
    const npmPackages = parseList(core.getInput('npm-packages'));
    const vscodePackages = parseList(core.getInput('vscode-packages'));
    const dryRun = parseDryRun(core.getInput('dry-run'));
    const npmTag = core.getInput('npm-tag') || undefined;
    const npmToken = core.getInput('npm-token') || undefined;
    const vsceToken = core.getInput('vsce-token') || undefined;
    const ovsxToken = core.getInput('ovsx-token') || undefined;
    const vsceVersion = core.getInput('vsce-version') || 'provided';
    const ovsxVersion = core.getInput('ovsx-version') || 'provided';

    // Register tokens as masked secrets so they are redacted from all log output,
    // even if a downstream tool echoes them.
    for (const token of [npmToken, vsceToken, ovsxToken]) {
        if (token) {
            core.setSecret(token);
        }
    }

    try {
        await publishPackages({ npmPackages, vscodePackages, dryRun, npmToken, vsceToken, ovsxToken, vsceVersion, ovsxVersion });
    } catch (error) {
        core.setFailed(error instanceof Error ? error.message : String(error));
    }
}

run();
