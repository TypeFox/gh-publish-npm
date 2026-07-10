/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { ExecFileException } from 'node:child_process';
import { parse } from 'semver';
import { describe, expect, test } from 'vitest';
import { evaluateVersions, handleExecFileException, preparePublishPackage, PublishPackageOptions } from '../src/publish.js';

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
        let publishedVersion = '1.0.0';
        let processed = evaluateVersions(packagePath, packageName, version, publishedVersion);
        expect(processed.isUpToDate).toBeTruthy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBeUndefined();
        expect(processed.version.version).toBe('1.0.0');

        publishedVersion = '2.0.0';
        processed = evaluateVersions(packagePath, packageName, version, publishedVersion);
        expect(processed.isUpToDate).toBeTruthy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBeUndefined();
        expect(processed.version.version).toBe('1.0.0');

        version = '2.0.0';
        publishedVersion = '1.0.0';
        processed = evaluateVersions(packagePath, packageName, version, publishedVersion);
        expect(processed.isUpToDate).toBeFalsy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBeUndefined();
        expect(processed.version.version).toBe('2.0.0');

        version = '2.0.0-next.0';
        processed = evaluateVersions(packagePath, packageName, version, publishedVersion);
        expect(processed.isUpToDate).toBeFalsy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBe('next');
        expect(processed.version.version).toBe('2.0.0-next.0');

        publishedVersion = '2.0.0';
        processed = evaluateVersions(packagePath, packageName, version, publishedVersion);
        expect(processed.isUpToDate).toBeTruthy();
        expect(processed.projectName).toBe('foo');
        expect(processed.tag).toBe('next');
        expect(processed.version.version).toBe('2.0.0-next.0');

        version = '2.eta';
        publishedVersion = '2.0.0';
        expect(() => evaluateVersions(packagePath, packageName, version, publishedVersion)).toThrow(
            'Failed to parse versions of: [ packagePath: packages/foo; project foo: version: 2.eta; publish: 2.0.0]'
        );
    });

    test('Test preparePublishPackage', () => {
        const options: PublishPackageOptions = {
            packagePublishInfo: {
                projectName: 'foo',
                isUpToDate: true,
                version: parse('1.0.0')!
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
        let execFileException = handleExecFileException(error, stdout, false);
        expect(execFileException.message).toBe('Error: Message\nstdout: Standard output');

        error.code = 1;
        execFileException = handleExecFileException(error, stdout, false);
        expect(execFileException.message).toBe('Error: Message\ncode: 1\nstdout: Standard output');

        error.stderr = 'Error output';
        execFileException = handleExecFileException(error, stdout, false);
        expect(execFileException.message).toBe('Error: Message\ncode: 1\nstderr: Error output\nstdout: Standard output');

        error.stdout = 'Standard output via error';
        execFileException = handleExecFileException(error, stdout, false);
        expect(execFileException.message).toBe('Error: Message\ncode: 1\nstderr: Error output\nstdout: Standard output via error');

        error.signal = 'SIGSEGV';
        execFileException = handleExecFileException(error, stdout, false);
        expect(execFileException.message).toBe(
            'Error: Message\ncode: 1\nstderr: Error output\nstdout: Standard output via error\nsignal: SIGSEGV'
        );

        execFileException = handleExecFileException(error, stdout, true);
        expect(execFileException.message).toContain('stack: Error: Message');
        expect(execFileException.message).toContain('publish.test.ts');
    });
});
