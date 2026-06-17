# Publish updated packages

A GitHub Action that publishes npm packages, VS Code extensions, and Open VSX extensions — but only when the local version is newer than what is already published.

## Usage

```yaml
- name: Publish
  # Pin the version to a full commit SHA for supply-chain safety
  uses: TypeFox/gh-publish-npm@v1
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
| `vsce-version` | No | `provided` | Version of the vsce CLI to use. `provided` (recommended) runs the version from the project's devDependencies and fails if absent. Any other value (e.g. `"3.9.1"` or `"latest"`) is fetched on demand via `npx` at your own risk. |
| `ovsx-version` | No | `provided` | Version of the ovsx CLI to use. `provided` (recommended) runs the version from the project's devDependencies and fails if absent. Any other value (e.g. `"1.0.1"` or `"latest"`) is fetched on demand via `npx` at your own risk. |

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
- With the default `vsce-version: provided` / `ovsx-version: provided`, `vsce` and `ovsx` must be installed in the project's `devDependencies` (and present via `npm ci`). The action runs the locally installed versions and **fails if they are not installed** — it never downloads them from the registry. This is the recommended, supply-chain-safe setting. Only set an explicit version (e.g. `latest`) if you accept the risk of fetching the CLI on demand via `npx`.
