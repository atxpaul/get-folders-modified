# Get Changed Directories Action

This GitHub Action helps you identify which directories have been changed in your repository. It's particularly useful when you need to run specific tasks only for directories that have been modified.

## Inputs

### `base-directory` (Required)

The base directory to check for changes. This should be the root directory where you want to start checking for changes.

### `exclude-dirs` (Optional)

A comma-separated list of directories to exclude from the check. For example: `node_modules,dist,.github`

## Outputs

### `changed-dirs`

A JSON array of directories that have been changed. This can be used in subsequent steps of your workflow.

## Example Usage

```yaml
name: Check Changed Directories

on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

jobs:
    check-changes:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v3
              with:
                  fetch-depth: 0

            - name: Get Changed Directories
              id: get-changed-dirs
              uses: ./
              with:
                  base-directory: 'src'
                  exclude-dirs: 'node_modules,dist'

            - name: Use Changed Directories
              run: |
                  for dir in $(echo '${{ steps.get-changed-dirs.outputs.changed-dirs }}' | jq -r '.[]'); do
                    echo "Processing directory: $dir"
                    # Add your commands here
                  done
```

## How it Works

1. The action compares the current commit with the previous commit (for push events) or the base branch (for pull requests)
2. It identifies all changed files within the specified base directory
3. It extracts the first-level directories from the changed files
4. It excludes any directories specified in the `exclude-dirs` input
5. It returns a JSON array of the remaining changed directories

## Development

To build the action:

```bash
npm install
npm run build
```

## License

MIT
