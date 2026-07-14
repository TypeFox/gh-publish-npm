/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { ExecFileException } from 'node:child_process';
import { parse } from 'semver';
import { describe, expect, test } from 'vitest';
import {
    evaluateVersions,
    printExecFileException,
    preparePublishPackage,
    PublishPackageOptions,
    getNpmDistTags,
    NpmDistTags
} from '../src/publish.js';

describe.concurrent('semver checks', { concurrent: true }, () => {
    test('Check semver pre-release', () => {
        let parsed = parse('2.0.0-next.0');
        if (parsed !== null && parsed.prerelease.length > 0) {
            expect(parsed.prerelease).toHaveLength(2);
            expect(parsed.prerelease[0]).toBe('next');
            expect(parsed.prerelease[1]).toBe(0);
            expect(parsed?.version).toBe('2.0.0-next.0');
            expect(parsed?.major).toBe(2);
        }

        // ill-formated pre-release version, but semver still parses it
        parsed = parse('2.0.0-next-0');
        if (parsed !== null && parsed.prerelease.length > 0) {
            expect(parsed.prerelease).toHaveLength(1);
            expect(parsed.prerelease[0]).toBe('next-0');
            expect(parsed?.version).toBe('2.0.0-next-0');
            expect(parsed?.major).toBe(2);
        }

        parsed = parse('2.0.0-beta');
        if (parsed !== null && parsed.prerelease.length > 0) {
            expect(parsed.prerelease).toHaveLength(1);
            expect(parsed.prerelease[0]).toBe('beta');
            expect(parsed?.version).toBe('2.0.0-beta');
            expect(parsed?.major).toBe(2);
        }
    });

    test('Check semver release', () => {
        const parsed = parse('2.1.2');
        if (parsed !== null) {
            expect(parsed.prerelease).toHaveLength(0);
            expect(parsed.version).toBe('2.1.2');
            expect(parsed.major).toBe(2);
            expect(parsed.minor).toBe(1);
            expect(parsed.patch).toBe(2);
        }
    });

    test('Test processVersions', () => {
        let packagePath = 'packages/foo';
        let packageName = 'foo';
        let version = '1.0.0';
        let npmDistTags: NpmDistTags = { latest: '1.0.0' };
        let processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeTruthy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBeUndefined();
        expect(processed.version.version).toBe('1.0.0');
        expect(processed.publishedVersion.version).toBe('1.0.0');

        npmDistTags = { latest: '2.0.0' };
        processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeTruthy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBeUndefined();
        expect(processed.version.version).toBe('1.0.0');
        expect(processed.publishedVersion.version).toBe('2.0.0');

        version = '2.0.0';
        npmDistTags = { latest: '1.0.0' };
        processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeFalsy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBeUndefined();
        expect(processed.version.version).toBe('2.0.0');
        expect(processed.publishedVersion.version).toBe('1.0.0');

        version = '2.0.0-next.0';
        processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeFalsy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBe('next');
        expect(processed.version.version).toBe('2.0.0-next.0');
        expect(processed.publishedVersion.version).toBe('1.0.0');

        npmDistTags = { latest: '2.0.0' };
        processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeTruthy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBe('next');
        expect(processed.version.version).toBe('2.0.0-next.0');
        expect(processed.publishedVersion.version).toBe('2.0.0');

        version = '2.eta';
        npmDistTags = { latest: '2.0.0' };
        expect(() => evaluateVersions(packagePath, packageName, version, npmDistTags)).toThrow(
            'Failed to parse versions of: [ packagePath: packages/foo; project foo: version: 2.eta; publish: 2.0.0]'
        );

        version = '2.0.0-next.0';
        npmDistTags = {
            latest: '1.5.0',
            tag: '1.8.0-next.0'
        };
        processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeFalsy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBe('next');
        expect(processed.version.version).toBe('2.0.0-next.0');
        expect(processed.publishedVersion.version).toBe('1.8.0-next.0');

        version = '2.0.0-next.0';
        npmDistTags = {
            latest: '1.5.0',
            tag: '2.0.0-next.1'
        };
        processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeTruthy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBe('next');
        expect(processed.version.version).toBe('2.0.0-next.0');
        expect(processed.publishedVersion.version).toBe('2.0.0-next.1');
        
        version = '2.1.0';
        npmDistTags = {
            latest: '2.0.1',
            tag: '2.0.0-next.0'
        };
        processed = evaluateVersions(packagePath, packageName, version, npmDistTags);
        expect(processed.isUpToDate).toBeFalsy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBeUndefined();;
        expect(processed.version.version).toBe('2.1.0');
        expect(processed.publishedVersion.version).toBe('2.0.1');
    });

    test('Test preparePublishPackage', () => {
        const options: PublishPackageOptions = {
            packagePublishInfo: {
                projectName: 'foo',
                isUpToDate: true,
                version: parse('2.0.0')!,
                publishedVersion: parse('1.5.0')!
            },
            packagePath: 'packages/foo',
            verbose: false,
            dryRun: false
        };
        let publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--provenance', '--access', 'public']);

        options.packagePublishInfo.tag = 'next';
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--tag', 'next', '--provenance', '--access', 'public']);

        options.packagePublishInfo.tag = undefined;
        options.dryRun = true;
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--dry-run', '--provenance', '--access', 'public']);

        options.npmTagOverride = 'fancy-tag';
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--dry-run', '--tag', 'fancy-tag', '--provenance', '--access', 'public']);

        options.dryRun = false;
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--tag', 'fancy-tag', '--provenance', '--access', 'public']);

        options.verbose = true;
        options.npmTagOverride = undefined;
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--verbose', '--provenance', '--access', 'public']);

        options.dryRun = true;
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--verbose', '--dry-run', '--provenance', '--access', 'public']);

        options.npmTagOverride = 'fancy-tag';
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--verbose', '--dry-run', '--tag', 'fancy-tag', '--provenance', '--access', 'public']);

        options.dryRun = false;
        publishArgs = preparePublishPackage(options);
        expect(publishArgs).toEqual(['publish', '--verbose', '--tag', 'fancy-tag', '--provenance', '--access', 'public']);
    });

    test('Test handleExecFileException', () => {
        const stdout = 'Standard output';
        let error = new Error('Message') as ExecFileException;
        let logMessage = printExecFileException(error, stdout, false);
        expect(logMessage).toBe('Error: Message\nstdout: Standard output');

        error.code = 1;
        logMessage = printExecFileException(error, stdout, false);
        expect(logMessage).toBe('Error: Message\ncode: 1\nstdout: Standard output');

        error.stderr = 'Error output';
        logMessage = printExecFileException(error, stdout, false);
        expect(logMessage).toBe('Error: Message\ncode: 1\nstderr: Error output\nstdout: Standard output');

        error.stdout = 'Standard output via error';
        logMessage = printExecFileException(error, stdout, false);
        expect(logMessage).toBe('Error: Message\ncode: 1\nstderr: Error output\nstdout: Standard output via error');

        error.signal = 'SIGSEGV';
        logMessage = printExecFileException(error, stdout, false);
        expect(logMessage).toBe('Error: Message\ncode: 1\nstderr: Error output\nstdout: Standard output via error\nsignal: SIGSEGV');

        logMessage = printExecFileException(error, stdout, true);
        expect(logMessage).toContain('stack: Error: Message');
        expect(logMessage).toContain('publish.test.ts');
    });

    test('Test getNpmDistTags', async () => {
        let distTags = await getNpmDistTags('monaco-languageclient', 'latest');
        expect(distTags.latest).toBeDefined();
        expect(distTags.latest.length).toBeGreaterThan(0);
        console.log(`monaco-languageclient latest: ${distTags.latest}`);

        distTags = await getNpmDistTags('monaco-languageclient', 'next');
        expect(distTags.tag).toBeDefined();
        expect(distTags.tag?.length).toBeGreaterThan(0);
        console.log(`monaco-languageclient next: ${distTags.tag}`);

        distTags = await getNpmDistTags('langium', 'latest');
        expect(distTags.latest).toBeDefined();
        expect(distTags.latest.length).toBeGreaterThan(0);
        console.log(`langium latest: ${distTags.latest}`);

        distTags = await getNpmDistTags('langium', 'next');
        expect(distTags.tag).toBeDefined();
        expect(distTags.tag?.length).toBeGreaterThan(0);
        console.log(`langium next: ${distTags.tag}`);
    });
});
