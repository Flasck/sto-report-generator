import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

interface PackedFile {
	path: string;
}

interface PackResult {
	files: PackedFile[];
}

const forbiddenPrefixes = [
	'.agents/',
	'.github/',
	'.omx/',
	'.venv/',
	'.agent-work/',
	'kanban/',
	'node_modules/',
	'output/',
	'reports/',
	'research/',
	'tests/',
];

const forbiddenExactPaths = new Set([
	'.geminiignore',
	'.gitignore',
	'.pre-commit-config.yaml',
	'.prettierignore',
	'.python-version',
	'eslint.config.mjs',
	'package-lock.json',
	'sonar-project.properties',
	'steiger.config.ts',
]);

function runPackDryRun(): PackResult[] {
	const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
		cwd: process.cwd(),
		encoding: 'utf8',
		shell: false,
	});

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`npm pack --dry-run --json exited with ${result.status}:\n${result.stderr}`,
		);
	}

	try {
		return JSON.parse(result.stdout) as PackResult[];
	} catch (error) {
		throw new Error(
			`npm pack --dry-run --json returned invalid JSON: ${(error as Error).message}`,
			{ cause: error },
		);
	}
}

function runPortableExampleAudit(): void {
	const result = spawnSync(
		process.platform === 'win32' ? 'npx.cmd' : 'npx',
		['tsx', 'src/index.ts', 'audit', 'example', '--renderer', 'portable'],
		{
			cwd: process.cwd(),
			encoding: 'utf8',
			shell: false,
		},
	);

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`portable example audit exited with ${result.status}:\n${result.stdout}\n${result.stderr}`,
		);
	}
}

function isForbiddenPath(filePath: string): boolean {
	return (
		forbiddenExactPaths.has(filePath) ||
		forbiddenPrefixes.some(prefix => filePath.startsWith(prefix)) ||
		filePath.startsWith('.temp') ||
		filePath.endsWith('.docx') ||
		filePath.endsWith('.pdf') ||
		filePath.endsWith('.log')
	);
}

const generatedExampleDocx = path.join(
	process.cwd(),
	'example',
	'build',
	'example.docx',
);
const hadGeneratedExampleDocx = existsSync(generatedExampleDocx);

try {
	runPortableExampleAudit();

	const packResults = runPackDryRun();
	const packedFiles = packResults.flatMap(result => result.files ?? []);
	const forbiddenFiles = packedFiles
		.map(file => file.path)
		.filter(isForbiddenPath)
		.sort();

	if (forbiddenFiles.length > 0) {
		console.error('Forbidden files would be included in npm package:');
		for (const filePath of forbiddenFiles) {
			console.error(`- ${filePath}`);
		}
		process.exit(1);
	}

	if (packedFiles.length === 0) {
		console.error('npm pack did not report any packaged files.');
		process.exit(1);
	}

	console.log(
		`Package content check passed for ${packedFiles.length} files after portable example audit.`,
	);
} finally {
	if (!hadGeneratedExampleDocx && existsSync(generatedExampleDocx)) {
		rmSync(generatedExampleDocx);
	}
}
