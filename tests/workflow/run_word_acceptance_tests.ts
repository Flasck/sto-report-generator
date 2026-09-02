import assert from 'node:assert/strict';
import path from 'node:path';

import {
	createWordAcceptancePlan,
	detectWordAcceptanceHost,
	WORD_ACCEPTANCE_REQUEST_SCHEMA_VERSION,
} from '@/app/word-acceptance';
import { getStoStylePresetDisplayNames } from '@/shared/config';

function fakeHostPath(absolutePath: string): string {
	return `WIN:${absolutePath}`;
}

function main(): void {
	const inputDocx = path.join(
		process.cwd(),
		'example',
		'build',
		'report.docx',
	);
	const requestJsonPath = path.join(
		process.cwd(),
		'.agent-work',
		'word-acceptance-test',
		'request.json',
	);
	const plan = createWordAcceptancePlan(
		{
			inputDocx,
			stylePreset: 'samara-template-2022',
		},
		{
			hostKind: 'wsl',
			toHostPath: fakeHostPath,
			requestJsonPath,
		},
	);

	assert.equal(plan.hostKind, 'wsl');
	assert.equal(plan.command, 'powershell.exe');
	assert.deepEqual(plan.args.slice(0, 4), [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
	]);
	assert.equal(
		plan.request.schemaVersion,
		WORD_ACCEPTANCE_REQUEST_SCHEMA_VERSION,
	);
	assert.equal(plan.request.requiredFont, 'Times New Roman');
	assert.equal(plan.request.stylePreset, 'samara-template-2022');
	assert.equal(plan.request.inputDocx, `WIN:${path.resolve(inputDocx)}`);
	assert.equal(
		plan.request.acceptedDocx,
		`WIN:${path.resolve(inputDocx).replace(/\.docx$/, '.accepted.docx')}`,
	);
	assert.equal(
		plan.request.pdf,
		`WIN:${path.resolve(inputDocx).replace(/\.docx$/, '.accepted.pdf')}`,
	);
	assert.equal(
		plan.request.manifest,
		`WIN:${path.resolve(inputDocx).replace(/\.docx$/, '.acceptance.json')}`,
	);

	const expectedStyleMap = getStoStylePresetDisplayNames(
		'samara-template-2022',
	);
	assert.ok(expectedStyleMap.StoHeading1);
	assert.ok(expectedStyleMap.Normal);
	assert.ok(
		plan.request.expectedStyles.some(
			style =>
				style.styleId === 'StoHeading1' &&
				style.displayName === expectedStyleMap.StoHeading1,
		),
	);
	assert.ok(
		plan.request.expectedStyles.some(
			style =>
				style.styleId === 'TableCaption' &&
				style.displayName === expectedStyleMap.TableCaption,
		),
	);

	const defaultPlan = createWordAcceptancePlan(
		{
			inputDocx,
			acceptedDocx: 'accepted/final.docx',
			pdf: 'accepted/final.pdf',
			manifest: 'accepted/final.json',
		},
		{
			hostKind: 'windows',
			toHostPath: absolutePath => absolutePath,
			requestJsonPath,
		},
	);
	assert.equal(defaultPlan.hostKind, 'windows');
	assert.equal(defaultPlan.request.stylePreset, 'default');
	assert.deepEqual(defaultPlan.request.expectedStyles, []);
	assert.equal(
		defaultPlan.request.acceptedDocx,
		path.resolve('accepted/final.docx'),
	);

	assert.throws(
		() =>
			createWordAcceptancePlan(
				{
					inputDocx,
					acceptedDocx: inputDocx,
				},
				{
					hostKind: 'wsl',
					toHostPath: fakeHostPath,
					requestJsonPath,
				},
			),
		/separate accepted DOCX/,
	);

	if (process.platform !== 'win32' && !process.platform.startsWith('linux')) {
		assert.throws(
			() => detectWordAcceptanceHost(),
			/Word acceptance requires WSL/,
		);
	}

	console.log('Word acceptance launcher tests passed.');
}

main();
