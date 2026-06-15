# Publish updated packages

A GitHub Action that publishes npm packages, VS Code extensions, and Open VSX extensions — but only when the local version is newer than what is already published.

## Usage

```yaml
- name: Publish
  uses: TypeFox/publish@v1
  with:
    npm-packages: |
      packages/my-lib
      packages/my-cli
    vscode-packages: |
      packages/my-extension
    vsce-token: ${{ secrets.VSCE_TOKEN }}
    ovsx-token: ${{ secrets.OVSX_TOKEN }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `npm-packages` | No | `''` | Newline-separated package directories to publish to npm. |
| `vscode-packages` | No | `''` | Newline-separated extension directories to publish to VS Marketplace and Open VSX. |
| `dry-run` | No | `false` | Log what would be published without actually publishing. |
| `npm-token` | No | `''` | npm auth token. Leave empty to use OIDC trusted publishing with `--provenance`. |
| `vsce-token` | No | `''` | VS Marketplace personal access token. |
| `ovsx-token` | No | `''` | Open VSX access token. |
| `vsce-version` | No | `latest` | Version of the vsce CLI to use (e.g. `"3.9.1"` or `"latest"`). |
| `ovsx-version` | No | `latest` | Version of the ovsx CLI to use (e.g. `"0.10.12"` or `"latest"`). |

## NPM authentication

By default the action publishes with `--provenance --access public`, relying on OIDC trusted publishing. To use that, the calling workflow needs:

```yaml
permissions:
  id-token: write
```

Alternatively, pass an explicit `npm-token` to use token-based authentication.

## Prerequisites

- Node.js must already be set up in the job (e.g. via `actions/setup-node`).
- For npm publishing with `--provenance`, `setup-node` should include `registry-url: 'https://registry.npmjs.org'`.
- `vsce` and `ovsx` are invoked via `npx` at action runtime — they do not need to be pre-installed, but they must be available to `npx` (i.e. either as devDependencies installed via `npm ci`, or downloaded on demand by npx).

## Releasing a new version

1. Create and push a `vX.Y.Z` git tag, then publish a GitHub Release from it.
2. The [Release workflow](.github/workflows/release.yml) will automatically:
   - Build `dist/index.js` from source.
   - Force-commit `dist/` into the release tag.
   - Create or move the major tag (e.g. `v1`) to the same commit.
3. Callers referencing `TypeFox/publish@v1` will pick up the new build automatically.

The `dist/` directory is git-ignored on `main` — the bundle only ever lives in release tags.
