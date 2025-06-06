import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'child_process';
import path from 'path';

async function run() {
    try {
        let baseDirectory = core.getInput('base-directory');
        const excludeDirs = core
            .getInput('exclude-dirs')
            .split(',')
            .map(dir => dir.trim())
            .filter(dir => dir.length > 0);

        // Normalize baseDirectory to always have a trailing slash
        if (!baseDirectory.endsWith('/')) {
            baseDirectory += '/';
        }

        let changedFiles = [];

        // Check if we're running in GitHub Actions and have a valid context
        if (process.env.GITHUB_ACTIONS === 'true' && github.context.payload) {
            try {
                // Get the token from the environment
                const token = process.env.GITHUB_TOKEN;
                if (!token) {
                    throw new Error('GITHUB_TOKEN is required');
                }

                const octokit = github.getOctokit(token);
                const context = github.context;

                let base, head;

                // Handle different event types
                if (context.eventName === 'pull_request') {
                    // For pull requests, compare with the base branch
                    base = context.payload.pull_request.base.sha;
                    head = context.payload.pull_request.head.sha;
                } else if (context.eventName === 'push') {
                    // For push events, use the before and after commits
                    base = context.payload.before;
                    head = context.payload.after;
                } else {
                    throw new Error(`Unsupported event type: ${context.eventName}`);
                }

                // Get the list of changed files
                const response = await octokit.rest.repos.compareCommits({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    base,
                    head,
                });

                changedFiles = response.data.files.map(file => file.filename);
            } catch (error) {
                // Fall back to git commands if GitHub API fails
                changedFiles = getChangedFilesWithGit();
            }
        } else {
            // Running locally or GitHub context is not available, use git commands
            changedFiles = getChangedFilesWithGit();
        }

        // Get unique directories that have changed
        const changedDirs = new Set();

        changedFiles.forEach(file => {
            // Normalize file path
            const normalizedFile = file.replace(/\\/g, '/');
            if (normalizedFile.startsWith(baseDirectory)) {
                const relativePath = normalizedFile.slice(baseDirectory.length);
                const parts = relativePath.split('/');
                // Skip if the file is in the base directory
                if (parts.length <= 1) return;
                const firstDir = parts[0];
                if (excludeDirs.includes(firstDir)) return;
                changedDirs.add(firstDir);
            } else if (normalizedFile === baseDirectory.slice(0, -1)) {
                // If the file is exactly the base directory (without trailing slash)
                return;
            } else if (normalizedFile.startsWith(baseDirectory.slice(0, -1))) {
                // Handle case where baseDirectory didn't have a trailing slash
                const relativePath = normalizedFile.slice(baseDirectory.slice(0, -1).length + 1);
                const parts = relativePath.split('/');
                if (parts.length <= 1) return;
                const firstDir = parts[0];
                if (excludeDirs.includes(firstDir)) return;
                changedDirs.add(firstDir);
            }
        });

        // Convert Set to Array and set output
        const changedDirsArray = Array.from(changedDirs);
        core.setOutput('changed-dirs', JSON.stringify(changedDirsArray));

        // Log the changed directories
        // (Removed debug output for production)
    } catch (error) {
        core.setFailed(error.message);
    }
}

function getChangedFilesWithGit() {
    try {
        // First try to get the diff using the GitHub context
        if (process.env.GITHUB_ACTIONS === 'true' && github.context.payload) {
            const context = github.context;
            let base, head;

            if (context.eventName === 'pull_request') {
                base = context.payload.pull_request.base.sha;
                head = context.payload.pull_request.head.sha;
            } else if (context.eventName === 'push') {
                base = context.payload.before;
                head = context.payload.after;
            }

            if (base && head) {
                const output = execSync(`git diff --name-only ${base} ${head}`).toString();
                return output.split('\n').filter(Boolean);
            }
        }

        // If we can't get the diff using context, try HEAD~1
        const output = execSync('git diff --name-only HEAD~1 HEAD').toString();
        return output.split('\n').filter(Boolean);
    } catch (error) {
        // If we can't get the diff, assume all files in the base directory have changed
        const baseDirectory = core.getInput('base-directory');
        const output = execSync(`find ${baseDirectory} -type f`).toString();
        return output.split('\n').filter(Boolean);
    }
}

run();
