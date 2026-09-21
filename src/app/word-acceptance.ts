import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	DEFAULT_STO_STYLE_PRESET,
	getStoStylePresetDisplayNames,
	isStoStylePreset,
	StoStylePreset,
} from '@/shared/config';

export const WORD_ACCEPTANCE_REQUEST_SCHEMA_VERSION = 1;

export interface WordAcceptanceOptions {
	inputDocx: string;
	acceptedDocx?: string;
	pdf?: string;
	manifest?: string;
	stylePreset?: StoStylePreset;
}

export interface WordAcceptanceExpectedStyle {
	styleId: string;
	displayName: string;
}

export interface WordAcceptanceRequest {
	schemaVersion: 1;
	inputDocx: string;
	acceptedDocx: string;
	pdf: string;
	manifest: string;
	requiredFont: string;
	stylePreset: StoStylePreset;
	expectedStyles: WordAcceptanceExpectedStyle[];
}

export type WordAcceptanceHostKind = 'windows' | 'wsl';

export interface WordAcceptancePlan {
	hostKind: WordAcceptanceHostKind;
	command: string;
	args: string[];
	request: WordAcceptanceRequest;
	requestJsonPath: string;
	scriptPath: string;
}

interface CreatePlanEnvironment {
	hostKind: WordAcceptanceHostKind;
	toHostPath: (absolutePath: string) => string;
	requestJsonPath?: string;
	scriptPath?: string;
}

function resolveDefaultOutputPath(
	inputDocx: string,
	explicitPath: string | undefined,
	suffix: string,
): string {
	if (explicitPath) {
		return path.resolve(explicitPath);
	}
	const parsed = path.parse(inputDocx);
	return path.join(parsed.dir, `${parsed.name}${suffix}`);
}

function assertDifferentPaths(inputDocx: string, acceptedDocx: string): void {
	if (path.resolve(inputDocx) === path.resolve(acceptedDocx)) {
		throw new Error(
			'Word acceptance writes a separate accepted DOCX. Choose an output path different from the source DOCX.',
		);
	}
}

function getExpectedStyles(
	stylePreset: StoStylePreset,
): WordAcceptanceExpectedStyle[] {
	return Object.entries(getStoStylePresetDisplayNames(stylePreset)).map(
		([styleId, displayName]) => ({ styleId, displayName }),
	);
}

export function detectWordAcceptanceHost(): WordAcceptanceHostKind {
	if (process.platform === 'win32') {
		return 'windows';
	}
	if (
		process.platform === 'linux' &&
		(os.release().toLowerCase().includes('microsoft') ||
			os.release().toLowerCase().includes('wsl'))
	) {
		return 'wsl';
	}
	throw new Error(
		'Word acceptance requires WSL with Windows PowerShell and Microsoft Word, or native Windows with Microsoft Word. Portable Linux/macOS generation is not authoritative pagination; run this command on a Windows Word host.',
	);
}

function convertWslPathToWindows(absolutePath: string): string {
	const result = spawnSync('wslpath', ['-w', absolutePath], {
		encoding: 'utf8',
		shell: false,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`wslpath failed for ${absolutePath}: ${result.stderr || result.stdout}`,
		);
	}
	return result.stdout.trim();
}

function toHostPath(
	hostKind: WordAcceptanceHostKind,
	absolutePath: string,
): string {
	return hostKind === 'wsl'
		? convertWslPathToWindows(absolutePath)
		: absolutePath;
}

function createRequestJsonPath(): string {
	const tempDir = fs.mkdtempSync(
		path.join(os.tmpdir(), 'sto-word-acceptance-'),
	);
	return path.join(tempDir, 'request.json');
}

export function createWordAcceptancePlan(
	options: WordAcceptanceOptions,
	environment: CreatePlanEnvironment,
): WordAcceptancePlan {
	const inputDocx = path.resolve(options.inputDocx);
	const acceptedDocx = resolveDefaultOutputPath(
		inputDocx,
		options.acceptedDocx,
		'.accepted.docx',
	);
	const pdf = resolveDefaultOutputPath(
		inputDocx,
		options.pdf,
		'.accepted.pdf',
	);
	const manifest = resolveDefaultOutputPath(
		inputDocx,
		options.manifest,
		'.acceptance.json',
	);
	const stylePreset = options.stylePreset ?? DEFAULT_STO_STYLE_PRESET;
	if (!isStoStylePreset(stylePreset)) {
		throw new Error(
			'Supported style presets for Word acceptance: samara-template-2022, default.',
		);
	}
	assertDifferentPaths(inputDocx, acceptedDocx);

	const scriptPath = path.resolve(
		environment.scriptPath ?? 'scripts/word_acceptance.ps1',
	);
	const requestJsonPath = path.resolve(
		environment.requestJsonPath ?? createRequestJsonPath(),
	);
	const request: WordAcceptanceRequest = {
		schemaVersion: WORD_ACCEPTANCE_REQUEST_SCHEMA_VERSION,
		inputDocx: environment.toHostPath(inputDocx),
		acceptedDocx: environment.toHostPath(acceptedDocx),
		pdf: environment.toHostPath(pdf),
		manifest: environment.toHostPath(manifest),
		requiredFont: 'Times New Roman',
		stylePreset,
		expectedStyles: getExpectedStyles(stylePreset),
	};
	const command =
		environment.hostKind === 'wsl' ? 'powershell.exe' : 'powershell.exe';
	const args = [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		environment.toHostPath(scriptPath),
		'-RequestJson',
		environment.toHostPath(requestJsonPath),
	];

	return {
		hostKind: environment.hostKind,
		command,
		args,
		request,
		requestJsonPath,
		scriptPath,
	};
}

export function runWordAcceptance(options: WordAcceptanceOptions): void {
	if (!fs.existsSync(options.inputDocx)) {
		throw new Error(`DOCX file not found: ${options.inputDocx}`);
	}
	const hostKind = detectWordAcceptanceHost();
	const plan = createWordAcceptancePlan(options, {
		hostKind,
		toHostPath: absolutePath => toHostPath(hostKind, absolutePath),
	});
	fs.mkdirSync(path.dirname(plan.requestJsonPath), { recursive: true });
	fs.writeFileSync(
		plan.requestJsonPath,
		`${JSON.stringify(plan.request, null, 2)}\n`,
		'utf8',
	);

	const result = spawnSync(plan.command, plan.args, {
		cwd: process.cwd(),
		encoding: 'utf8',
		shell: false,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			result.stderr || result.stdout || 'Word acceptance failed.',
		);
	}
	if (result.stdout.trim()) {
		console.log(result.stdout.trim());
	}
}
