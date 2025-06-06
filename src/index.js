const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
    try {
        const baseDirectory = core.getInput('base-directory');
        const excludeDirs = core
            .getInput('exclude-dirs')
            .split(',')
            .map((dir) => dir.trim())
            .filter((dir) => dir.length > 0);

        const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
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

        // Get all changed files
        const changedFiles = response.data.files.map((file) => file.filename);

        // Get unique directories that have changed
        const changedDirs = new Set();

        changedFiles.forEach((file) => {
            if (file.startsWith(baseDirectory)) {
                const relativePath = file.slice(baseDirectory.length);
                const parts = relativePath.split('/');

                // Skip if the file is in the base directory
                if (parts.length <= 1) return;

                // Get the first directory in the path
                const firstDir = parts[0];

                // Skip if the directory is in the exclude list
                if (excludeDirs.includes(firstDir)) return;

                changedDirs.add(firstDir);
            }
        });

        // Convert Set to Array and set output
        const changedDirsArray = Array.from(changedDirs);
        core.setOutput('changed-dirs', JSON.stringify(changedDirsArray));

        // Log the changed directories
        console.log('Changed directories:', changedDirsArray);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
