import {
	AlignmentType,
	Paragraph,
	Table,
	TableCell,
	TableLayoutType,
	TableRow,
	TextRun,
	VerticalAlign,
	WidthType,
} from 'docx';
import { Tokens as MarkedTokens, Token } from 'marked';

import { STO_RULES } from '@/shared/config';

import {
	DocxElement,
	InlineDocxElement,
	ParserContext,
	ProcessTokensContext,
} from '../../types';
import { handleBlockMath } from './math-handler';

function isReferatKeywordsParagraph(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed.includes(',') || !/[A-ZА-ЯЁ]/.test(trimmed)) {
		return false;
	}

	const keywords = trimmed
		.replace(/[.]$/, '')
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);

	return (
		keywords.length >= STO_RULES.referat.keywordCount.min &&
		keywords.length <= STO_RULES.referat.keywordCount.max &&
		trimmed === trimmed.toUpperCase()
	);
}

/**
 * Handles paragraph tokens and converts them to Docx Paragraphs or Tables (for math blocks).
 */
export async function handleParagraph(
	token: MarkedTokens.Paragraph,
	context: ParserContext,
	parseInline: (tokens: Token[]) => Promise<InlineDocxElement[]>,
	currentContext: ProcessTokensContext,
): Promise<DocxElement[]> {
	const text = token.text;

	// Check for block math. We use a more robust split to handle multiple blocks
	// and ensure they are processed as separate Table elements for centering.
	if (text.includes('$$')) {
		const parts = text.split(/(\$\$[\s\S]+?\$\$)/g);
		const result: DocxElement[] = [];
		for (const part of parts) {
			const match = part.match(/^\$\$([\s\S]+?)\$\$/);
			if (match) {
				result.push(await handleBlockMath(match[1].trim(), context));
			} else if (part.trim().length > 0) {
				// Handle potential text around math blocks in the same paragraph
				// though usually STO expects math blocks to be separate
				result.push(
					new Paragraph({
						style: 'Normal',
						children: await parseInline([
							{ type: 'text', raw: part, text: part } as Token,
						]),
					}),
				);
			}
		}
		if (result.length > 0) return result;
	}

	if (token.tokens?.every(item => item.type === 'image')) {
		return [
			new Paragraph({
				style: 'Normal',
				alignment: AlignmentType.CENTER,
				indent: { firstLine: 0 },
				children: await parseInline(token.tokens),
			}),
		];
	}

	if (currentContext.isStoList) {
		const itemTokens = token.tokens || [];
		if (itemTokens.length > 0 && itemTokens[0].type === 'text') {
			itemTokens[0].raw = itemTokens[0].raw.replace(
				/^(?:-|\*|\d+\.)\s+/,
				'',
			);
			itemTokens[0].text = itemTokens[0].text.replace(
				/^(?:-|\*|\d+\.)\s+/,
				'',
			);
		}
		return [
			new Paragraph({
				style: 'Normal',
				indent: {
					left: 0,
					firstLine: STO_RULES.typography.firstLineIndentDxa,
				},
				numbering:
					currentContext.listType === 'ordered'
						? {
								reference: 'ordered-numbering',
								level: 0,
								instance: currentContext.instance,
							}
						: {
								reference: 'list-numbering',
								level: 0,
								instance: currentContext.instance,
							},
				children: await parseInline(itemTokens),
			}),
		];
	}

	if (/^(?:Рисунок|Рис\.)\s*(?:@fig:[a-zA-Z0-9_-]+|\d+)/.test(text.trim())) {
		return [
			new Paragraph({
				style: 'FigureCaption',
				children: await parseInline(token.tokens || []),
			}),
		];
	}

	if (/^Таблица\s*(?:@tab:[a-zA-Z0-9_-]+|\d+)/.test(text.trim())) {
		return [
			new Paragraph({
				style: 'TableCaption',
				children: await parseInline(token.tokens || []),
			}),
		];
	}

	if (
		currentContext.structuralHeading === 'РЕФЕРАТ' &&
		isReferatKeywordsParagraph(text)
	) {
		return [
			new Paragraph({
				style: 'Normal',
				alignment: AlignmentType.JUSTIFIED,
				spacing: {
					before: STO_RULES.referat.keywordParagraph.spacingBeforeDxa,
					after: STO_RULES.referat.keywordParagraph.spacingAfterDxa,
					line: STO_RULES.typography.normalLineSpacingDxa,
					lineRule: 'auto',
				},
				indent: {
					left: 0,
					right: 0,
					firstLine: STO_RULES.typography.firstLineIndentDxa,
				},
				children: [
					new TextRun({
						text: text.trim(),
						allCaps: true,
					}),
				],
			}),
		];
	}

	return [
		new Paragraph({
			style: 'Normal',
			indent: text.trim().startsWith('где')
				? { firstLine: 0 }
				: undefined,
			children: await parseInline(token.tokens || []),
		}),
	];
}

/**
 * Handles list tokens and converts them to Docx Paragraphs with numbering.
 */
export async function handleList(
	token: MarkedTokens.List,
	context: ParserContext,
	parseInline: (tokens: Token[]) => Promise<InlineDocxElement[]>,
	processTokens: (
		tokens: Token[],
		currentContext?: ProcessTokensContext,
	) => Promise<DocxElement[]>,
	currentContext: ProcessTokensContext = {},
	listLevel: number = 0,
): Promise<DocxElement[]> {
	if (listLevel === 0) {
		context.listInstanceCounter++;
	}
	const instance = context.listInstanceCounter;
	const elements: DocxElement[] = [];

	for (const item of token.items) {
		// Separation of inline vs nested block tokens
		const textTokens = item.tokens.filter((t: Token) => t.type !== 'list');
		const nestedListTokens = item.tokens.filter(
			(t: Token) => t.type === 'list',
		);

		elements.push(
			new Paragraph({
				style: 'Normal',
				numbering: token.ordered
					? {
							reference: 'ordered-numbering',
							level: listLevel,
							instance: instance,
						}
					: {
							reference: 'list-numbering',
							level: listLevel,
							instance: instance,
						},
				children: await parseInline(textTokens),
			}),
		);

		for (const nestedList of nestedListTokens) {
			elements.push(
				...(await handleList(
					nestedList as MarkedTokens.List,
					context,
					parseInline,
					processTokens,
					currentContext,
					listLevel + 1,
				)),
			);
		}
	}
	return elements;
}

const TOTAL_TABLE_WIDTH_DXA = 9355; // A4 (11906) - Left margin (1701) - Right margin (850)

export function computeTableColumnWidths(
	token: MarkedTokens.Table,
	explicitWidths?: number[],
): number[] {
	const numCols = token.header.length;
	if (numCols === 0) return [];

	// 1. Explicit widths from <!-- widths: ... -->
	if (explicitWidths && explicitWidths.length === numCols) {
		const sumExplicit = explicitWidths.reduce((a, b) => a + b, 0);
		if (sumExplicit > 0) {
			const widths = explicitWidths.map(w =>
				Math.round((w / sumExplicit) * TOTAL_TABLE_WIDTH_DXA),
			);
			const diff =
				TOTAL_TABLE_WIDTH_DXA - widths.reduce((a, b) => a + b, 0);
			widths[widths.length - 1] += diff;
			return widths;
		}
	}

	// 2. Delimiter line dashes (|:---|:------------------|)
	if (token.raw) {
		const rawLines = token.raw
			.split('\n')
			.map(l => l.trim())
			.filter(Boolean);
		if (rawLines.length >= 2) {
			const delimLine = rawLines[1];
			if (/^\|?[\s:-]+\|/.test(delimLine)) {
				const parts = delimLine
					.split('|')
					.map(p => p.trim())
					.filter(p => p.length > 0);
				if (parts.length === numCols) {
					const dashCounts = parts.map(
						p => (p.match(/-/g) || []).length,
					);
					const minDashes = Math.min(...dashCounts);
					const maxDashes = Math.max(...dashCounts);
					if (maxDashes - minDashes >= 3) {
						const sumDashes = dashCounts.reduce((a, b) => a + b, 0);
						const widths = dashCounts.map(d =>
							Math.round((d / sumDashes) * TOTAL_TABLE_WIDTH_DXA),
						);
						const diff =
							TOTAL_TABLE_WIDTH_DXA -
							widths.reduce((a, b) => a + b, 0);
						widths[widths.length - 1] += diff;
						return widths;
					}
				}
			}
		}
	}

	// 3. Content-based measurement
	const colMetrics = [];
	for (let c = 0; c < numCols; c++) {
		const headerText = token.header[c]?.text || '';
		const cellTexts = [
			headerText,
			...token.rows.map(row => row[c]?.text || ''),
		];

		let maxWordLen = 0;
		let totalLen = 0;
		for (const text of cellTexts) {
			const clean = text.replace(/<[^>]+>/g, ' ');
			totalLen += clean.trim().length;
			const words = clean.split(/[\s,;:()[\]{}]+/);
			for (const w of words) {
				if (w.length > maxWordLen) maxWordLen = w.length;
			}
		}
		const avgLen = totalLen / cellTexts.length;
		const effectiveMaxWordLen = Math.min(maxWordLen, 20);
		colMetrics.push({ c, maxWordLen: effectiveMaxWordLen, avgLen, totalLen });
	}

	const minWidths = colMetrics.map(m =>
		Math.max(900, m.maxWordLen * 110 + 350),
	);
	const weights = colMetrics.map(m =>
		Math.pow(Math.max(m.avgLen, 8), 0.55),
	);
	const sumWeights = weights.reduce((a, b) => a + b, 0);
	const sumMin = minWidths.reduce((a, b) => a + b, 0);

	let widths: number[];
	if (sumMin < TOTAL_TABLE_WIDTH_DXA) {
		const remaining = TOTAL_TABLE_WIDTH_DXA - sumMin;
		widths = minWidths.map((minW, i) =>
			Math.round(minW + (weights[i] / sumWeights) * remaining),
		);
	} else {
		// When sumMin exceeds total width, scale minWidths proportionally
		// rather than discarding them, so narrow columns don't collapse.
		widths = minWidths.map(minW =>
			Math.round((minW / sumMin) * TOTAL_TABLE_WIDTH_DXA),
		);
		widths = widths.map(w => Math.max(900, w));
	}

	const diff = TOTAL_TABLE_WIDTH_DXA - widths.reduce((a, b) => a + b, 0);
	widths[widths.length - 1] += diff;

	return widths;
}

function getCellAlignment(
	align: string | null,
): (typeof AlignmentType)[keyof typeof AlignmentType] {
	switch (align) {
		case 'center':
			return AlignmentType.CENTER;
		case 'right':
			return AlignmentType.RIGHT;
		case 'left':
		default:
			return AlignmentType.LEFT;
	}
}

/**
 * Handles table tokens and converts them to Docx Tables.
 */
export async function handleTable(
	token: MarkedTokens.Table,
	parseInline: (
		tokens: Token[],
		options?: { bold?: boolean; allowBold?: boolean },
	) => Promise<InlineDocxElement[]>,
	explicitWidths?: number[],
): Promise<Table> {
	const columnWidths = computeTableColumnWidths(token, explicitWidths);

	const rows: TableRow[] = [];
	for (const row of token.rows) {
		const rowCells: TableCell[] = [];
		for (let colIdx = 0; colIdx < row.length; colIdx++) {
			const cell = row[colIdx];
			const alignType = getCellAlignment(token.align[colIdx]);
			const colWidth = columnWidths[colIdx] ?? 1000;

			rowCells.push(
				new TableCell({
					width: { size: colWidth, type: WidthType.DXA },
					verticalAlign: VerticalAlign.CENTER,
					children: [
						new Paragraph({
							style: 'TableText',
							alignment: alignType,
							children: await parseInline(cell.tokens, {
								allowBold: true,
							}),
						}),
					],
				}),
			);
		}
		rows.push(
			new TableRow({
				cantSplit: true,
				children: rowCells,
			}),
		);
	}

	const headerCells: TableCell[] = [];
	for (let colIdx = 0; colIdx < token.header.length; colIdx++) {
		const cell = token.header[colIdx];
		const colWidth = columnWidths[colIdx] ?? 1000;

		headerCells.push(
			new TableCell({
				width: { size: colWidth, type: WidthType.DXA },
				verticalAlign: VerticalAlign.CENTER,
				children: [
					new Paragraph({
						style: 'TableText',
						alignment: AlignmentType.CENTER,
						children: await parseInline(cell.tokens, {
							bold: true,
							allowBold: true,
						}),
					}),
				],
			}),
		);
	}
	const headerRow = new TableRow({
		children: headerCells,
		tableHeader: true,
		cantSplit: true,
	});

	return new Table({
		width: { size: TOTAL_TABLE_WIDTH_DXA, type: WidthType.DXA },
		layout: TableLayoutType.FIXED,
		columnWidths: columnWidths,
		margins: {
			top: 100,
			bottom: 100,
			left: 150,
			right: 150,
		},
		rows: [headerRow, ...rows],
	});
}
