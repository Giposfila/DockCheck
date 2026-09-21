import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import type { CheckReport, Finding, Requirements } from './types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TWIPS_PER_MM = 56.6929133858;
const STRUCTURAL = /^(РЕФЕРАТ|СОДЕРЖАНИЕ|ВВЕДЕНИЕ|ЗАКЛЮЧЕНИЕ|СПИСОК (?:ИСПОЛЬЗОВАННЫХ )?ИСТОЧНИКОВ|СПИСОК СОКРАЩЕНИЙ|ПРИЛОЖЕНИЕ\s+[А-Я])$/iu;

export const DEFAULT_REQUIREMENTS: Requirements = {
  fontFamily: 'Times New Roman',
  fontSizePt: 14,
  allowedLineSpacing: [1, 1.5],
  firstLineIndentMm: 12.5,
  portraitMarginsMm: { top: 20, right: 10, bottom: 20, left: 30 },
  requireA4: true,
  requireJustified: true,
  requirePageNumbers: true,
  requireContentsOverPages: 24,
  requiredSections: ['ВВЕДЕНИЕ', 'ЗАКЛЮЧЕНИЕ', 'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ'],
};

type XmlNode = Element;
type Style = { basedOn?: string; p: PProps; r: RProps };
type PProps = { align?: string; firstLineTwips?: number; hangingTwips?: number; line?: number; lineRule?: string; pageBreakBefore?: boolean };
type RProps = { font?: string; size?: number; bold?: boolean };

function elements(node: Document | Element, localName: string): Element[] {
  return Array.from(node.getElementsByTagNameNS('*', localName)) as Element[];
}

function first(node: Document | Element | null | undefined, localName: string): Element | undefined {
  if (!node) return undefined;
  return elements(node, localName)[0];
}

function direct(node: Element | null | undefined, localName: string): Element | undefined {
  if (!node) return undefined;
  return Array.from(node.childNodes).find((item): item is Element => item.nodeType === 1 && (item as Element).localName === localName);
}

function attr(node: Element | null | undefined, name: string): string | undefined {
  if (!node) return undefined;
  return node.getAttributeNS(W, name) ?? node.getAttribute(`w:${name}`) ?? node.getAttribute(name) ?? undefined;
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = elements(doc, 'parsererror')[0];
  if (parserError) throw new Error('Внутренний XML документа повреждён.');
  return doc;
}

function paragraphText(p: Element): string {
  return elements(p, 't').map((n) => n.textContent ?? '').join('').replace(/\s+/g, ' ').trim();
}

function readPProps(pPr?: Element): PProps {
  const ind = direct(pPr, 'ind');
  const spacing = direct(pPr, 'spacing');
  const firstLine = Number(attr(ind, 'firstLine'));
  const hanging = Number(attr(ind, 'hanging'));
  const line = Number(attr(spacing, 'line'));
  return {
    align: attr(direct(pPr, 'jc'), 'val'),
    firstLineTwips: Number.isFinite(firstLine) ? firstLine : undefined,
    hangingTwips: Number.isFinite(hanging) ? hanging : undefined,
    line: Number.isFinite(line) ? line : undefined,
    lineRule: attr(spacing, 'lineRule'),
    pageBreakBefore: Boolean(direct(pPr, 'pageBreakBefore')),
  };
}

function readRProps(rPr?: Element): RProps {
  const fonts = direct(rPr, 'rFonts');
  const size = Number(attr(direct(rPr, 'sz'), 'val'));
  const boldNode = direct(rPr, 'b');
  const boldValue = attr(boldNode, 'val');
  return {
    font: attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi') ?? attr(fonts, 'cs'),
    size: Number.isFinite(size) ? size / 2 : undefined,
    bold: boldNode ? !['0', 'false', 'off'].includes(String(boldValue).toLowerCase()) : undefined,
  };
}

function merge<T extends object>(...items: Array<T | undefined>): T {
  const result: Record<string, unknown> = {};
  for (const item of items) {
    if (!item) continue;
    for (const [key, value] of Object.entries(item)) {
      if (value !== undefined) result[key] = value;
    }
  }
  return result as T;
}

function readStyles(doc?: Document): { styles: Map<string, Style>; defaultP: PProps; defaultR: RProps } {
  const styles = new Map<string, Style>();
  if (!doc) return { styles, defaultP: {}, defaultR: {} };
  const defaults = first(doc, 'docDefaults');
  const defaultPPr = first(direct(defaults, 'pPrDefault'), 'pPr');
  const defaultRPr = first(direct(defaults, 'rPrDefault'), 'rPr');
  for (const styleNode of elements(doc, 'style')) {
    const id = attr(styleNode, 'styleId');
    if (!id) continue;
    styles.set(id, {
      basedOn: attr(direct(styleNode, 'basedOn'), 'val'),
      p: readPProps(direct(styleNode, 'pPr')),
      r: readRProps(direct(styleNode, 'rPr')),
    });
  }
  return { styles, defaultP: readPProps(defaultPPr), defaultR: readRProps(defaultRPr) };
}

function resolveStyle(id: string | undefined, styles: Map<string, Style>, seen = new Set<string>()): Style {
  if (!id || seen.has(id)) return { p: {}, r: {} };
  const own = styles.get(id);
  if (!own) return { p: {}, r: {} };
  seen.add(id);
  const parent = resolveStyle(own.basedOn, styles, seen);
  return { p: merge(parent.p, own.p), r: merge(parent.r, own.r) };
}

function approximately(a: number | undefined, b: number, tolerance: number): boolean {
  return typeof a === 'number' && Math.abs(a - b) <= tolerance;
}

function mm(twips: number | undefined): number | undefined {
  return typeof twips === 'number' ? twips / TWIPS_PER_MM : undefined;
}

function formatMm(value: number | undefined): string {
  return value === undefined ? 'не задано явно' : `${value.toFixed(1).replace('.', ',')} мм`;
}

function makeFinding(input: Omit<Finding, 'id'>): Finding {
  return { id: `${input.category}-${cryptoRandomId()}`, ...input };
}

function cryptoRandomId(): string {
  const cryptoApi = globalThis.crypto;
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : Math.random().toString(36).slice(2);
}

function inTable(node: Element): boolean {
  let parent = node.parentNode;
  while (parent && parent.nodeType === 1) {
    if ((parent as Element).localName === 'tbl') return true;
    parent = parent.parentNode;
  }
  return false;
}

function likelyHeading(text: string, styleId?: string): boolean {
  return STRUCTURAL.test(text) || /^\d+(?:\.\d+){0,3}\s+\S/u.test(text) || /heading|заголов/i.test(styleId ?? '');
}

function excerpt(text: string): string {
  return text.length > 104 ? `${text.slice(0, 101)}…` : text;
}

function lineMultiplier(p: PProps): number | undefined {
  if (p.line === undefined) return undefined;
  if (!p.lineRule || p.lineRule === 'auto') return p.line / 240;
  return undefined;
}

async function optionalXml(zip: JSZip, path: string): Promise<Document | undefined> {
  const file = zip.file(path);
  return file ? parseXml(await file.async('text')) : undefined;
}

export async function checkDocx(data: ArrayBuffer | Uint8Array, requirements: Requirements = DEFAULT_REQUIREMENTS): Promise<CheckReport> {
  const zip = await JSZip.loadAsync(data);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Это не DOCX: отсутствует word/document.xml.');
  const documentXml = parseXml(await documentFile.async('text'));
  const stylesXml = await optionalXml(zip, 'word/styles.xml');
  const settingsXml = await optionalXml(zip, 'word/settings.xml');
  const { styles, defaultP, defaultR } = readStyles(stylesXml);
  const paragraphs = elements(documentXml, 'p');
  const findings: Finding[] = [];
  const nonEmpty = paragraphs.map((p, i) => ({ p, i: i + 1, text: paragraphText(p) })).filter((x) => x.text);

  const sectPrs = elements(documentXml, 'sectPr');
  sectPrs.forEach((section, index) => {
    const label = sectPrs.length > 1 ? `Раздел документа ${index + 1}` : 'Параметры страницы';
    const size = direct(section, 'pgSz');
    const width = Number(attr(size, 'w'));
    const height = Number(attr(size, 'h'));
    const orient = attr(size, 'orient');
    const isLandscape = orient === 'landscape' || width > height;
    const expectedW = isLandscape ? 16838 : 11906;
    const expectedH = isLandscape ? 11906 : 16838;
    if (requirements.requireA4 && (!approximately(width, expectedW, 90) || !approximately(height, expectedH, 90))) {
      findings.push(makeFinding({ severity: 'error', category: 'page', title: 'Формат страницы отличается от A4', location: label, actual: width && height ? `${formatMm(mm(width))} × ${formatMm(mm(height))}` : 'размер не задан', expected: 'A4 — 210 × 297 мм', clause: '7.1.1' }));
    }
    const margin = direct(section, 'pgMar');
    const actual = {
      top: mm(Number(attr(margin, 'top'))), right: mm(Number(attr(margin, 'right'))),
      bottom: mm(Number(attr(margin, 'bottom'))), left: mm(Number(attr(margin, 'left'))),
    };
    const expected = isLandscape
      ? { top: 30, right: 20, bottom: 10, left: 20 }
      : requirements.portraitMarginsMm;
    for (const [key, title] of Object.entries({ top: 'Верхнее поле', right: 'Правое поле', bottom: 'Нижнее поле', left: 'Левое поле' }) as Array<[keyof typeof actual, string]>) {
      if (!approximately(actual[key], expected[key], 0.7)) {
        findings.push(makeFinding({ severity: 'error', category: 'page', title: `${title} не соответствует шаблону`, location: label, actual: formatMm(actual[key]), expected: `${expected[key]} мм`, clause: '7.1.2' }));
      }
    }
  });

  for (const { p, i, text } of nonEmpty) {
    const pPr = direct(p, 'pPr');
    const styleId = attr(direct(pPr, 'pStyle'), 'val');
    const style = resolveStyle(styleId, styles);
    const props = merge(defaultP, style.p, readPProps(pPr));
    const heading = likelyHeading(text, styleId);
    const tableCell = inTable(p);
    const location = `Абзац ${i}`;

    if (!tableCell) {
      const runProps = elements(p, 'r').filter((run) => paragraphText(run)).map((run) => merge(defaultR, style.r, readRProps(direct(run, 'rPr'))));
      const effectiveRuns = runProps.length ? runProps : [merge(defaultR, style.r)];
      const wrongFonts = [...new Set(effectiveRuns.map((r) => r.font).filter((font): font is string => Boolean(font && font.toLowerCase() !== requirements.fontFamily.toLowerCase())))];
      const missingFont = effectiveRuns.every((r) => !r.font);
      if (wrongFonts.length || missingFont) {
        findings.push(makeFinding({ severity: 'error', category: 'text', title: 'Шрифт отличается от шаблона', location, actual: missingFont ? 'не удалось определить' : wrongFonts.join(', '), expected: requirements.fontFamily, clause: '7.1.1', excerpt: excerpt(text) }));
      }
      const wrongSizes = [...new Set(effectiveRuns.map((r) => r.size).filter((size): size is number => typeof size === 'number' && Math.abs(size - requirements.fontSizePt) > 0.1))];
      const missingSize = effectiveRuns.every((r) => r.size === undefined);
      if (wrongSizes.length || missingSize) {
        findings.push(makeFinding({ severity: 'error', category: 'text', title: 'Размер шрифта отличается от шаблона', location, actual: missingSize ? 'не удалось определить' : `${wrongSizes.join(', ')} пт`, expected: `${requirements.fontSizePt} пт`, clause: '7.1.1', excerpt: excerpt(text) }));
      }

      if (!heading && requirements.requireJustified && props.align !== 'both') {
        findings.push(makeFinding({ severity: 'warning', category: 'text', title: 'Основной текст не выровнен по ширине', location, actual: props.align ? `режим «${props.align}»` : 'выравнивание не задано', expected: 'по ширине', clause: '7.1.1', excerpt: excerpt(text) }));
      }
      if (!heading) {
        const actualIndent = props.firstLineTwips === undefined ? undefined : mm(props.firstLineTwips - (props.hangingTwips ?? 0));
        if (!approximately(actualIndent, requirements.firstLineIndentMm, 0.7)) {
          findings.push(makeFinding({ severity: 'warning', category: 'text', title: 'Абзацный отступ отличается от шаблона', location, actual: formatMm(actualIndent), expected: `${requirements.firstLineIndentMm} мм`, clause: '7.1.1', excerpt: excerpt(text) }));
        }
        const multiplier = lineMultiplier(props);
        if (multiplier !== undefined && !requirements.allowedLineSpacing.some((allowed) => Math.abs(allowed - multiplier) < 0.06)) {
          findings.push(makeFinding({ severity: 'warning', category: 'text', title: 'Межстрочный интервал вне допустимого набора', location, actual: `${multiplier.toFixed(2)}`, expected: requirements.allowedLineSpacing.join(' или '), clause: '7.1.1', excerpt: excerpt(text) }));
        }
      }
    }

    if (heading) {
      if (/^\d+(?:\.\d+){0,3}\s+\S/u.test(text) && /[.]$/u.test(text)) {
        findings.push(makeFinding({ severity: 'error', category: 'heading', title: 'Точка в конце заголовка', location, actual: 'заголовок оканчивается точкой', expected: 'без точки в конце', clause: '7.5.3', excerpt: excerpt(text) }));
      }
      const effectiveRuns = elements(p, 'r').filter((run) => paragraphText(run)).map((run) => merge(defaultR, style.r, readRProps(direct(run, 'rPr'))));
      if (effectiveRuns.length && effectiveRuns.some((r) => r.bold !== true)) {
        findings.push(makeFinding({ severity: 'warning', category: 'heading', title: 'Заголовок не полностью выделен полужирным', location, actual: 'есть обычное начертание', expected: 'полужирное начертание', clause: '7.5.3', excerpt: excerpt(text) }));
      }
    }
  }

  const tables = elements(documentXml, 'tbl');
  const bodyChildren = Array.from(first(documentXml, 'body')?.childNodes ?? []).filter((n): n is Element => n.nodeType === 1);
  for (const table of tables) {
    const position = bodyChildren.indexOf(table);
    let caption = '';
    for (let i = position - 1; i >= 0; i -= 1) {
      if (bodyChildren[i].localName !== 'p') continue;
      caption = paragraphText(bodyChildren[i]);
      if (caption) break;
    }
    if (!/^Таблица\s+[А-Я]?\d+(?:\.\d+)?\s+[–—-]\s+\S/u.test(caption)) {
      findings.push(makeFinding({ severity: 'warning', category: 'table', title: 'Перед таблицей не найдена корректная подпись', location: `Таблица ${tables.indexOf(table) + 1}`, actual: caption ? `предыдущий абзац: «${excerpt(caption)}»` : 'подпись не найдена', expected: 'Таблица N – Наименование', clause: '7.7.3' }));
    } else if (/[.]$/u.test(caption)) {
      findings.push(makeFinding({ severity: 'error', category: 'table', title: 'Точка после наименования таблицы', location: `Таблица ${tables.indexOf(table) + 1}`, actual: excerpt(caption), expected: 'без точки в конце', clause: '7.7.3' }));
    }
  }

  const drawings = elements(documentXml, 'drawing');
  const drawingParagraphs = paragraphs.filter((p) => elements(p, 'drawing').length > 0);
  drawingParagraphs.forEach((p, index) => {
    const pIndex = paragraphs.indexOf(p);
    const nextText = paragraphs.slice(pIndex + 1).map(paragraphText).find(Boolean) ?? '';
    if (!/^Рисунок\s+[А-Я]?\d+(?:\.\d+)?\s+[–—-]\s+\S/u.test(nextText)) {
      findings.push(makeFinding({ severity: 'warning', category: 'figure', title: 'После изображения не найдена подпись рисунка', location: `Изображение ${index + 1}`, actual: nextText ? `следующий абзац: «${excerpt(nextText)}»` : 'подпись не найдена', expected: 'Рисунок N – Наименование', clause: '7.8.3' }));
    }
  });

  const allTextUpper = nonEmpty.map((x) => x.text.toLocaleUpperCase('ru-RU'));
  for (const section of requirements.requiredSections) {
    const normalized = section.toLocaleUpperCase('ru-RU');
    const present = allTextUpper.some((text) => text === normalized || text.startsWith(`${normalized} `));
    if (!present) findings.push(makeFinding({ severity: 'warning', category: 'structure', title: `Не найден раздел «${section}»`, location: 'Структура документа', actual: 'совпадающий заголовок не найден', expected: `заголовок «${section}»`, clause: section.includes('ИСТОЧНИК') ? '6.9' : section === 'ВВЕДЕНИЕ' ? '6.5' : '6.8' }));
  }

  const hasBibliography = allTextUpper.some((t) => /СПИСОК (?:ИСПОЛЬЗОВАННЫХ )?ИСТОЧНИКОВ/u.test(t));
  if (hasBibliography && !nonEmpty.some((x) => /\[\d+(?:,\s*с\.\s*\d+)?\]/u.test(x.text))) {
    findings.push(makeFinding({ severity: 'warning', category: 'references', title: 'Не найдены отсылки к списку источников', location: 'Основной текст', actual: 'нет конструкций вида [3] или [3, с. 14]', expected: 'отсылки в квадратных скобках', clause: '7.9.4' }));
  }

  if (requirements.requirePageNumbers) {
    const footerFiles = Object.keys(zip.files).filter((name) => /^word\/footer\d+\.xml$/u.test(name));
    let validPageNumber = false;
    for (const name of footerFiles) {
      const footer = await optionalXml(zip, name);
      if (!footer) continue;
      const hasPage = elements(footer, 'instrText').some((n) => /\bPAGE\b/u.test(n.textContent ?? '')) || elements(footer, 'fldSimple').some((n) => /\bPAGE\b/u.test(attr(n, 'instr') ?? ''));
      const centered = elements(footer, 'p').some((p) => attr(direct(direct(p, 'pPr'), 'jc'), 'val') === 'center');
      if (hasPage && centered) validPageNumber = true;
    }
    if (!validPageNumber) findings.push(makeFinding({ severity: 'warning', category: 'page', title: 'Не найден номер страницы по центру нижнего колонтитула', location: 'Нижние колонтитулы', actual: footerFiles.length ? 'поле PAGE по центру не найдено' : 'нижние колонтитулы отсутствуют', expected: 'арабский номер по центру, Times New Roman 14 пт', clause: '7.2.1' }));
  }

  const pageBreaks = elements(documentXml, 'br').filter((node) => attr(node, 'type') === 'page').length + elements(documentXml, 'lastRenderedPageBreak').length;
  const estimatedPages = pageBreaks > 0 ? pageBreaks + 1 : undefined;
  if (estimatedPages && estimatedPages > requirements.requireContentsOverPages && !allTextUpper.includes('СОДЕРЖАНИЕ')) {
    findings.push(makeFinding({ severity: 'warning', category: 'structure', title: 'Для документа объёмом более 24 страниц не найдено содержание', location: 'Структура документа', actual: `не менее ${estimatedPages} страниц по сохранённым разрывам`, expected: 'раздел «СОДЕРЖАНИЕ»', clause: '6.4.1' }));
  }

  const trackRevisions = settingsXml ? first(settingsXml, 'trackRevisions') : undefined;
  if (trackRevisions) findings.push(makeFinding({ severity: 'warning', category: 'structure', title: 'Включено отслеживание исправлений', location: 'Настройки DOCX', actual: 'режим исправлений включён', expected: 'перед сдачей принять или отклонить правки', clause: 'Нормоконтроль' }));

  return {
    findings,
    manualChecks: [
      { title: 'Титульный лист и подписи', reason: 'Нужно сопоставить вид работы с обязательной формой из приложений Б–Н и проверить заполнение реквизитов.', clause: '6.2; приложения Б–Н' },
      { title: 'Фактическая пагинация', reason: 'DOCX хранит поток документа, а окончательные номера страниц зависят от версии Word, шрифтов и принтера.', clause: '7.2' },
      { title: 'Содержание и номера страниц', reason: 'Точность отточий, совпадение заголовков и страниц надёжно проверяются после обновления полей и печатной вёрстки.', clause: '6.4.2–6.4.4' },
      { title: 'Формулы и пояснения', reason: 'Смысл обозначений, корректность переноса и расположение номера формулы требуют визуальной и предметной оценки.', clause: '7.6' },
      { title: 'Рисунки и таблицы', reason: 'Читаемость, ссылка до объекта, двойная линия головки таблицы и качество графики требуют просмотра страницы.', clause: '7.7–7.8' },
      { title: 'Источники и заимствования', reason: 'Полноту ссылок, соответствие ГОСТ и наличие ссылки у каждого заимствования нельзя установить только по XML.', clause: '7.9–7.10' },
      { title: 'Рамки для ДП и КП', reason: 'Для пояснительных записок проектов применяются особые рамки и основные надписи; их геометрию нужно проверить визуально.', clause: '7.1.3; приложения Р–С' },
    ],
    stats: { paragraphs: nonEmpty.length, tables: tables.length, images: drawings.length, sections: sectPrs.length, estimatedPages },
    checkedAt: new Date().toISOString(),
  };
}

export const units = { TWIPS_PER_MM };
