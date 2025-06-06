import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

async function run() {
    try {
        const baseDirectoryInput = core.getInput('base-directory', { required: true });
        const excludeDirs = core
            .getInput('exclude-dirs')
            .split(',')
            .map(dir => dir.trim())
            .filter(dir => dir.length > 0);

        const baseDirectory = path.resolve(process.env.GITHUB_WORKSPACE, baseDirectoryInput);

        let changedFiles = [];

        if (process.env.GITHUB_ACTIONS === 'true') {
            try {
                const token = core.getInput('github-token', { required: true });
                const octokit = github.getOctokit(token);
                const context = github.context;

                let base, head;

                if (context.eventName === 'pull_request') {
                    base = context.payload.pull_request.base.sha;
                    head = context.payload.pull_request.head.sha;
                } else if (context.eventName === 'push') {
                    base = context.payload.before;
                    head = context.payload.after;
                } else {
                    const commits = await octokit.rest.repos.listCommits({
                        owner: context.repo.owner,
                        repo: context.repo.repo,
                        per_page: 2,
                    });
                    if (commits.data.length < 2) {
                        throw new Error('Not enough commits to compare.');
                    }
                    base = commits.data[1].sha;
                    head = commits.data[0].sha;
                }

                core.info(`Comparing commits: ${base}...${head}`);

                const response = await octokit.rest.repos.compareCommits({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    base,
                    head,
                });

                changedFiles = response.data.files.map(file => file.filename);
            } catch (error) {
                core.warning(
                    `GitHub API failed: ${error.message}. Falling back to full directory scan.`
                );
                changedFiles = listAllFiles(baseDirectory);
            }
        } else {
            try {
                const output = execSync('git diff --name-only HEAD~1 HEAD').toString();
                changedFiles = output.split('\n').filter(Boolean);
            } catch (error) {
                core.warning(
                    `Git command failed: ${error.message}. Falling back to full directory scan.`
                );
                changedFiles = listAllFiles(baseDirectory);
            }
        }

        const changedDirs = new Set();

        for (const file of changedFiles) {
            const absoluteFilePath = path.resolve(process.env.GITHUB_WORKSPACE, file);
            const relativePath = path.relative(baseDirectory, absoluteFilePath);

            if (relativePath.startsWith('..')) {
                continue;
            }

            const parts = relativePath.split(path.sep);

            if (parts.length <= 1) {
                continue;
            }

            const firstDir = parts[0];

            if (!excludeDirs.includes(firstDir)) {
                changedDirs.add(firstDir);
            }
        }

        const changedDirsArray = Array.from(changedDirs);
        core.info(`Found changed directories: ${JSON.stringify(changedDirsArray)}`);
        core.setOutput('changed-dirs', JSON.stringify(changedDirsArray));
    } catch (error) {
        core.setFailed(error.message);
    }
}

function listAllFiles(baseDir) {
    let results = [];
    try {
        const list = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const dirent of list) {
            const res = path.resolve(baseDir, dirent.name);
            if (dirent.isDirectory()) {
                results = results.concat(listAllFiles(res));
            } else {
                results.push(path.relative(process.env.GITHUB_WORKSPACE, res));
            }
        }
    } catch (error) {
        core.warning(`Failed to list files in ${baseDir}: ${error.message}`);
    }
    return results;
}

run();
