import { completePackage } from './helpers';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { checkDocx, DEFAULT_REQUIREMENTS } from '../src/checker';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const wrap=(name:string,text:string)=>`<w:${name} xmlns:w="${W}" xmlns:r="${R}">${text}</w:${name}>`;
const p=(text='Текст',pr='',rp='')=>`<w:p><w:pPr>${pr}</w:pPr><w:r><w:rPr>${rp}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
const defaults='<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults>';
async function doc(body:string,styles='',parts:Record<string,string>={}) {
 const z=new JSZip(); z.file('word/document.xml',wrap('document',`<w:body>${body}</w:body>`));
 z.file('word/styles.xml',wrap('styles',styles));
 for(const [name,value] of Object.entries(parts)) z.file(name,value);
 return completePackage(z).generateAsync({type:'uint8array'});
}
const run=(r:Awaited<ReturnType<typeof checkDocx>>,i=0)=>r.document.paragraphs[0].runs[i].properties;
describe('OOXML model and checks',()=>{
 it('separates unknown and failing runs without false pass',async()=>{
  const r=await checkDocx(await doc(p('Known','','<w:rFonts w:ascii="Arial"/>') .replace('</w:p>','<w:r><w:t>Unknown</w:t></w:r></w:p>')));
  expect(r.results.filter(x=>x.ruleId==='text.font').map(x=>x.status)).toEqual(['fail','unknown']);
  expect(r.findings).toHaveLength(1);
 });
 it('resolves default paragraph styles and multilevel basedOn with provenance',async()=>{
  const r=await checkDocx(await doc(p(),defaults+'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:basedOn w:val="Base"/></w:style><w:style w:type="paragraph" w:styleId="Base"><w:rPr><w:sz w:val="24"/></w:rPr></w:style>'));
  expect(run(r).fontSize).toMatchObject({value:12,source:{styleId:'Base'}});
 });
 it('resolves character style and direct overrides per run',async()=>{
  const r=await checkDocx(await doc(p('A','','<w:rStyle w:val="Em"/><w:sz w:val="32"/>'),defaults+'<w:style w:type="character" w:styleId="Em"><w:rPr><w:sz w:val="20"/><w:i/></w:rPr></w:style>'));
  expect(run(r).fontSize.value).toBe(16); expect(run(r).italic.value).toBe(true);
 });
 it('supports style toggles and direct false',async()=>{
  const styles='<w:style w:type="paragraph" w:styleId="B"><w:rPr><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="C"><w:basedOn w:val="B"/><w:rPr><w:b/></w:rPr></w:style>';
  const r=await checkDocx(await doc(p('X','<w:pStyle w:val="C"/><w:pageBreakBefore w:val="off"/>','<w:i w:val="0"/>'),styles));
  expect(run(r).bold.value).toBe(false);expect(run(r).italic.value).toBe(false); expect(r.document.paragraphs[0].properties.pageBreakBefore.value).toBe(false);
 });
 it('preserves inherited pageBreakBefore when absent locally',async()=>{
  const r=await checkDocx(await doc(p('X','<w:pStyle w:val="B"/>'),'<w:style w:styleId="B"><w:pPr><w:pageBreakBefore/></w:pPr></w:style>'));
  expect(r.document.paragraphs[0].properties.pageBreakBefore.value).toBe(true);
 });
 it.each(['auto','exact','atLeast'])('keeps line spacing units for %s',async mode=>{
  const r=await checkDocx(await doc(p('X',`<w:spacing w:line="360" w:lineRule="${mode}" w:before="120"/>`),defaults));
  expect(r.results.find(x=>x.ruleId==='paragraph.spacing')?.status).toBe(mode==='auto'?'pass':'unknown');
  expect(r.document.paragraphs[0].properties.before.value).toBe(6);
 });
 it('resolves themes by script rather than always taking ascii',async()=>{
  const theme='<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="T"><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="SimSun"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
  const r=await checkDocx(await doc(p('A中','','<w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia"/>'),'',{'word/theme/theme1.xml':theme}));
  expect(run(r).font.value).toBe('Calibri / SimSun');
 });
 it('resolves numbering indentation and start override',async()=>{
  const numbering=wrap('numbering','<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>');
  const r=await checkDocx(await doc(p('Item','<w:numPr><w:numId w:val="1"/></w:numPr>'),defaults,{'word/numbering.xml':numbering}));
  expect(r.document.paragraphs[0].properties.numberStart.value).toBe('5'); expect(r.document.paragraphs[0].properties.left.value).toBeCloseTo(12.7);
 });
 it('checks nested tables once and applies first row conditional style',async()=>{
  const table=`<w:tbl><w:tblPr><w:tblStyle w:val="T"/><w:tblLook w:firstRow="1"/></w:tblPr><w:tr><w:tc>${p('Cell')}<w:tbl><w:tr><w:tc>${p('Nested')}</w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>`;
  const r=await checkDocx(await doc(table,defaults+'<w:style w:styleId="T" w:type="table"><w:tblStylePr w:type="firstRow"><w:rPr><w:sz w:val="20"/></w:rPr></w:tblStylePr></w:style>'));
  expect(r.document.paragraphs).toHaveLength(2);expect(run(r).fontSize.value).toBe(10);expect(r.results.filter(x=>x.ruleId==='text.font')).toHaveLength(2);
 });
 it('does not classify numbered text as a heading',async()=>{
  const r=await checkDocx(await doc(p('1 Обычный текст.')));expect(r.document.paragraphs[0].role).toBe('body');
 });
 it('retains empty paragraphs, tabs, hyperlinks and notes',async()=>{
  const r=await checkDocx(await doc('<w:p/><w:p><w:hyperlink><w:r><w:t>Link</w:t><w:footnoteReference w:id="1"/><w:tab/><w:br/></w:r></w:hyperlink></w:p>','',{'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="n" Target="footnotes.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes"/></Relationships>','word/footnotes.xml':wrap('footnotes',`<w:footnote w:id="1">${p('Note')}</w:footnote>`)}));
  expect(r.document.paragraphs.map(p=>p.text)).toEqual(['','Link\t\n','Note']);
 });
 it('marks cyclic and missing styles unknown',async()=>{
  const r=await checkDocx(await doc(p('X','<w:pStyle w:val="A"/>'),'<w:style w:styleId="A"><w:basedOn w:val="A"/></w:style>'));
  expect(run(r).font.status).toBe('unsupported');expect(r.coverage.unknown).toBeGreaterThan(0);
 });
 it('ignores unused footer and refuses standalone PAGE instructions',async()=>{
  const rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="f" Target="footer2.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer"/></Relationships>';
  const footer=wrap('ftr',p('Centered','<w:jc w:val="center"/>')+'<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:instrText> PAGE </w:instrText></w:r></w:p>');
  const r=await checkDocx(await doc(p()+'<w:sectPr><w:footerReference r:id="f" w:type="default"/></w:sectPr><w:sectPr/>',defaults,{'word/_rels/document.xml.rels':rels,'word/footer2.xml':footer,'word/footer1.xml':wrap('ftr','<w:p><w:fldSimple w:instr="PAGE"/></w:p>')}));
  expect(r.results.filter(x=>x.ruleId==='footer.page').map(x=>x.status)).toEqual(['unknown','unknown']);
 });
 it('does not estimate pages or emit NaN',async()=>{
  const r=await checkDocx(await doc(p('X','<w:ind w:firstLine="invalid"/>')+'<w:sectPr><w:pgSz w:w="bad"/></w:sectPr>'));
  expect(r.stats.estimatedPages).toBeUndefined();expect(JSON.stringify(r)).not.toContain('NaN');
 });
 it('does not create violations for known correct typography',async()=>{
  const r=await checkDocx(await doc(p('Text','<w:jc w:val="both"/><w:ind w:firstLine="709"/><w:spacing w:line="360"/>'),defaults),{...DEFAULT_REQUIREMENTS,requiredSections:[],requirePageNumbers:false});
  expect(r.findings).toEqual([]);expect(r.coverage.pass).toBe(5);
 });
 it('rejects malformed XML and non DOCX zip',async()=>{
  const z=new JSZip();z.file('word/document.xml','<w:document>');await expect(checkDocx(await z.generateAsync({type:'uint8array'}))).rejects.toThrow();
  await expect(checkDocx(await new JSZip().generateAsync({type:'uint8array'}))).rejects.toThrow('Это не DOCX');
 });
});

describe('complete OPC DOCX fixtures',()=>{
 it.each(['correct','incorrect','partial'])('checks %s package',async kind=>{
  const {readFile}=await import('node:fs/promises');
  const report=await checkDocx(await readFile(new URL(`./fixtures/${kind}.docx`,import.meta.url)),{...DEFAULT_REQUIREMENTS,requirePageNumbers:false,requiredSections:[]});
  const fonts=report.results.filter(x=>x.ruleId==='text.font');
  expect(fonts.map(x=>x.status)).toEqual([kind==='correct'?'pass':kind==='incorrect'?'fail':'unknown']);
  if(kind==='correct') expect(report.findings).toHaveLength(0);
 });
});

it('gives a direct font priority over an inherited theme reference',async()=>{
 const r=await checkDocx(await doc(p('A','','<w:rFonts w:ascii="Arial"/>'),'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/></w:rPr></w:rPrDefault></w:docDefaults>'));
 expect(run(r).font.value).toBe('Arial');
});
it('resolves table banding explicitly',async()=>{
 const r=await checkDocx(await doc(`<w:tbl><w:tblPr><w:tblStyle w:val="T"/></w:tblPr><w:tr><w:tc>${p()}</w:tc></w:tr></w:tbl>`,defaults+'<w:style w:styleId="T" w:type="table"><w:tblStylePr w:type="band1Horz"><w:rPr><w:b/></w:rPr></w:tblStylePr></w:style>'));
 expect(run(r).font.status).toBe('resolved');expect(run(r).bold.value).toBe(true);expect(r.results.find(x=>x.ruleId==='text.font')?.status).toBe('unknown');
});
it('does not silently accept tracked content',async()=>{
 const r=await checkDocx(await doc(`<w:ins w:id="1">${p('Pending')}</w:ins>`));
 expect(r.document.paragraphs).toHaveLength(0);expect(r.document.limitations.join()).toContain('Исправления');
});
