import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { checkDocx, DEFAULT_REQUIREMENTS } from '../src/checker';

const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function makeDocx(options: { compliant: boolean }): Promise<Uint8Array> {
  const zip = new JSZip();
  const { compliant } = options;
  const paragraphs = compliant
    ? [
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>ВВЕДЕНИЕ</w:t></w:r></w:p>',
        '<w:p><w:r><w:t>Основной текст со ссылкой на источник [1].</w:t></w:r></w:p>',
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>ЗАКЛЮЧЕНИЕ</w:t></w:r></w:p>',
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ</w:t></w:r></w:p>',
      ].join('')
    : '<w:p><w:r><w:t>1 Неверный заголовок.</w:t></w:r></w:p><w:p><w:r><w:t>Короткий основной текст.</w:t></w:r></w:p>';

  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="${ns}"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="${compliant ? 11906 : 12240}" w:h="${compliant ? 16838 : 15840}"/><w:pgMar w:top="${compliant ? 1134 : 1440}" w:right="${compliant ? 567 : 1440}" w:bottom="${compliant ? 1134 : 1440}" w:left="${compliant ? 1701 : 1440}"/></w:sectPr></w:body></w:document>`);
  zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${compliant ? 'Times New Roman' : 'Calibri'}" w:hAnsi="${compliant ? 'Times New Roman' : 'Calibri'}"/><w:sz w:val="${compliant ? 28 : 22}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:jc w:val="${compliant ? 'both' : 'left'}"/><w:ind w:firstLine="${compliant ? 709 : 0}"/><w:spacing w:line="${compliant ? 360 : 240}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Heading1"><w:rPr>${compliant ? '<w:b/>' : ''}</w:rPr></w:style></w:styles>`);
  if (compliant) zip.file('word/footer1.xml', `<?xml version="1.0"?><w:ftr xmlns:w="${ns}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:instrText> PAGE </w:instrText></w:r></w:p></w:ftr>`);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('checkDocx', () => {
  it('accepts a minimal document that follows the configured machine-checkable rules', async () => {
    const report = await checkDocx(await makeDocx({ compliant: true }));
    expect(report.findings).toEqual([]);
    expect(report.stats).toMatchObject({ paragraphs: 4, tables: 0, images: 0, sections: 1 });
    expect(report.manualChecks.length).toBeGreaterThan(5);
  });

  it('reports formatting, page, heading, structure, and pagination problems', async () => {
    const report = await checkDocx(await makeDocx({ compliant: false }), DEFAULT_REQUIREMENTS);
    const titles = report.findings.map((finding) => finding.title);
    expect(titles).toContain('Формат страницы отличается от A4');
    expect(titles).toContain('Шрифт отличается от шаблона');
    expect(titles).toContain('Размер шрифта отличается от шаблона');
    expect(titles).toContain('Точка в конце заголовка');
    expect(titles).toContain('Не найден раздел «ВВЕДЕНИЕ»');
    expect(titles).toContain('Не найден номер страницы по центру нижнего колонтитула');
  });

  it('rejects a ZIP that is not a DOCX', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'not a document');
    await expect(checkDocx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('Это не DOCX');
  });
});
