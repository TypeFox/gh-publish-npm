/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { deriveNpmStatus, deriveMarketplaceStatus } from '../src/summary.js';

describe.concurrent('summary checks', { concurrent: true }, () => {
    test('Test deriveNpmStatus', () => {
        expect(deriveNpmStatus(true, false)).toBe('skipped-up-to-date');
        expect(deriveNpmStatus(true, true)).toBe('skipped-up-to-date');
        expect(deriveNpmStatus(false, false)).toBe('published');
        expect(deriveNpmStatus(false, true)).toBe('would-publish-dry-run');
    });

    test('Test deriveMarketplaceStatus', () => {
        expect(deriveMarketplaceStatus(false, false)).toBe('skipped');
        expect(deriveMarketplaceStatus(false, true)).toBe('skipped');
        expect(deriveMarketplaceStatus(true, false)).toBe('published');
        expect(deriveMarketplaceStatus(true, true)).toBe('dry-run');
    });
});
