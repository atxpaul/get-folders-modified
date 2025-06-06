import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'child_process';
import path from 'path';

async function run() {
    try {
        // Get command line arguments
        const args = process.argv.slice(2);
        let baseDirectory = '';
        let excludeDirs = [];

        // Parse command line arguments
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--base-directory' && i + 1 < args.length) {
                baseDirectory = args[i + 1];
                i++;
            } else if (args[i] === '--exclude-dirs' && i + 1 < args.length) {
                excludeDirs = args[i + 1]
                    .split(',')
                    .map(dir => dir.trim())
                    .filter(dir => dir.length > 0);
                i++;
            }
        }

        if (!baseDirectory) {
            throw new Error('base-directory is required');
        }

        // Normalize baseDirectory to always have a trailing slash
        if (!baseDirectory.endsWith('/')) {
            baseDirectory += '/';
        }

        let changedFiles = [];

        // Always try GitHub API first when running in GitHub Actions
        if (process.env.GITHUB_ACTIONS === 'true') {
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
                    // For other events, try to get the last two commits
                    const commits = await octokit.rest.repos.listCommits({
                        owner: context.repo.owner,
                        repo: context.repo.repo,
                        per_page: 2,
                    });

                    if (commits.data.length >= 2) {
                        base = commits.data[1].sha;
                        head = commits.data[0].sha;
                    } else {
                        throw new Error('Could not determine base and head commits');
                    }
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
                core.warning(`GitHub API failed: ${error.message}. Falling back to file listing.`);
                // If GitHub API fails, list all files in the base directory
                changedFiles = listAllFiles(baseDirectory);
            }
        } else {
            // Running locally, use git commands
            try {
                const output = execSync('git diff --name-only HEAD~1 HEAD').toString();
                changedFiles = output.split('\n').filter(Boolean);
            } catch (error) {
                core.warning(`Git command failed: ${error.message}. Falling back to file listing.`);
                changedFiles = listAllFiles(baseDirectory);
            }
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
    } catch (error) {
        core.setFailed(error.message);
    }
}

function listAllFiles(baseDirectory) {
    try {
        const output = execSync(`find ${baseDirectory} -type f`).toString();
        return output.split('\n').filter(Boolean);
    } catch (error) {
        core.warning(`Failed to list files: ${error.message}`);
        return [];
    }
}

run();
