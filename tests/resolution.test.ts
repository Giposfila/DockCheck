import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { completePackage } from './helpers';
import { checkDocx, DEFAULT_REQUIREMENTS } from '../src/checker';
import { overlay } from '../src/analyzer/properties';
import { extract } from '../src/analyzer/extract';
import { parse } from '../src/analyzer/package';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const wrap=(root:string,text:string)=>`<w:${root} xmlns:w="${W}" xmlns:r="${R.slice(0,-1)}">${text}</w:${root}>`;
const p=(text='Text',pr='',rp='')=>`<w:p><w:pPr>${pr}</w:pPr><w:r><w:rPr>${rp}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
const defaults='<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults>';
async function report(body:string,styles='',parts:Record<string,string>={}) {
 const zip=new JSZip();zip.file('word/document.xml',wrap('document',`<w:body>${body}</w:body>`));zip.file('word/styles.xml',wrap('styles',styles));
 for(const [path,text] of Object.entries(parts))zip.file(path,text);
 return checkDocx(await completePackage(zip).generateAsync({type:'uint8array'}),{...DEFAULT_REQUIREMENTS,requiredSections:[]});
}
it('merges tabs and resolves mutually exclusive hanging/firstLine',()=>{
 const a=extract(parse(wrap('pPr','<w:ind w:hanging="720"/><w:tabs><w:tab w:val="left" w:pos="100"/><w:tab w:val="right" w:pos="900"/></w:tabs>')).documentElement,'styles');
 const b=extract(parse(wrap('pPr','<w:ind w:firstLine="360"/><w:tabs><w:tab w:val="clear" w:pos="100"/><w:tab w:val="center" w:pos="500"/></w:tabs>')).documentElement,'document');
 const value=overlay(a,b);expect(value.hanging).toBeUndefined();expect(value.firstLine.value).toBeCloseTo(6.35);expect(value.tabs.value).toBe('center:500;right:900');
});
it('rejects a paragraph style used as a character style without false passes',async()=>{
 const r=await report(p('X','','<w:rStyle w:val="Wrong"/>'),defaults+'<w:style w:styleId="Wrong" w:type="paragraph"><w:rPr><w:sz w:val="28"/></w:rPr></w:style>');
 expect(r.results.filter(x=>x.ruleId.startsWith('text.')).every(x=>x.status==='unknown')).toBe(true);
});
// Float HSL values independently calculated with Python colorsys; Word may round differently.
it.each([['accent2','BF',undefined,'953735'],['accent1',undefined,'99','95B3D7'],['accent1','00','99','95B3D7']])('resolves HSL shade/tint %s %s %s',async(themeColor,shade,tint,expected)=>{
 const theme='<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="T"><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2></a:clrScheme></a:themeElements></a:theme>';
 const r=await report(p('X','',`<w:color w:themeColor="${themeColor}" ${shade?`w:themeShade="${shade}"`:''} ${tint?`w:themeTint="${tint}"`:''}/>`),defaults,{'word/theme/theme1.xml':theme});
 expect(r.document.paragraphs[0].runs[0].properties.color.value).toBe(expected);
});
it('clears inherited theme modifiers with a direct RGB color',async()=>{
 const r=await report(p('X','','<w:color w:val="112233"/>'),'<w:docDefaults><w:rPrDefault><w:rPr><w:color w:themeColor="accent1" w:themeTint="99"/></w:rPr></w:rPrDefault></w:docDefaults>');
 expect(r.document.paragraphs[0].runs[0].properties.color).toMatchObject({value:'112233',status:'resolved'});
});
it('chooses supplemental Han font by language and locates only the wrong script',async()=>{
 const theme='<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="T"><a:minorFont><a:latin typeface="Times New Roman"/><a:ea typeface=""/><a:font script="Hans" typeface="SimSun"/><a:font script="Hant" typeface="MingLiU"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
 const r=await report(p('A中','','<w:lang w:eastAsia="zh-TW"/><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia"/>'),'',{'word/theme/theme1.xml':theme});
 const font=r.findings.filter(f=>f.id.startsWith('text.font'));
 expect(font).toHaveLength(1);expect(font[0].actual).toBe('MingLiU');expect(font[0].excerpt).toBe('中');expect(font[0].at?.range).toEqual({start:1,end:2,unit:'utf16'});
});
it('applies table bands before edges and corners across inherited styles',async()=>{
 const styles=defaults+'<w:style w:type="table" w:styleId="Base"><w:tblStylePr w:type="nwCell"><w:rPr><w:sz w:val="36"/></w:rPr></w:tblStylePr></w:style><w:style w:type="table" w:styleId="T"><w:basedOn w:val="Base"/><w:tblStylePr w:type="wholeTable"><w:rPr><w:sz w:val="20"/></w:rPr></w:tblStylePr><w:tblStylePr w:type="band1Horz"><w:rPr><w:sz w:val="22"/></w:rPr></w:tblStylePr><w:tblStylePr w:type="band2Horz"><w:rPr><w:sz w:val="24"/></w:rPr></w:tblStylePr><w:tblStylePr w:type="firstRow"><w:rPr><w:sz w:val="26"/></w:rPr></w:tblStylePr></w:style>';
 const row=(text:string)=>`<w:tr><w:tc>${p(text)}</w:tc><w:tc>${p(text)}</w:tc></w:tr>`;
 const r=await report(`<w:tbl><w:tblPr><w:tblStyle w:val="T"/><w:tblLook w:firstRow="1" w:firstColumn="1" w:noVBand="1"/></w:tblPr>${row('a')}${row('b')}${row('c')}</w:tbl>`,styles);
 expect(r.document.paragraphs.map(p=>p.runs[0].properties.fontSize.value)).toEqual([18,13,11,11,12,12]);
});
it('uses logical gridSpan columns and cnfStyle overrides',async()=>{
 const styles=defaults+'<w:style w:type="table" w:styleId="T"><w:tblStylePr w:type="lastCol"><w:rPr><w:sz w:val="32"/></w:rPr></w:tblStylePr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr></w:tblStylePr></w:style>';
 const r=await report(`<w:tbl><w:tblPr><w:tblStyle w:val="T"/><w:tblLook w:lastColumn="1" w:firstRow="1"/></w:tblPr><w:tblGrid><w:gridCol/><w:gridCol/><w:gridCol/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/><w:cnfStyle w:firstRow="0"/></w:tcPr>${p()}</w:tc></w:tr></w:tbl>`,styles);
 expect(r.document.paragraphs[0].runs[0].properties.fontSize.value).toBe(16);expect(r.document.paragraphs[0].runs[0].properties.bold.value).toBeNull();
});
it.each(['vMerge','hMerge'])('retains unknown for conditional %s and normalizes geometry units',async merge=>{
 const r=await report(`<w:tbl><w:tblPr><w:tblStyle w:val="T"/><w:tblW w:type="pct" w:w="2500"/></w:tblPr><w:tr><w:trPr><w:trHeight w:val="720" w:hRule="exact"/><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:${merge} w:val="restart"/><w:tcW w:type="dxa" w:w="1440"/><w:tcBorders><w:top w:val="single" w:sz="8"/></w:tcBorders></w:tcPr>${p()}</w:tc></w:tr></w:tbl>`,defaults+'<w:style w:type="table" w:styleId="T"/>');
 expect(r.results.find(x=>x.ruleId==='text.size')?.status).toBe('unknown');
 expect(r.document.objects[0].properties['tblW.value']).toMatchObject({value:50,unit:'%'});
 expect(r.document.objects[1].properties['row.height']).toMatchObject({value:expect.closeTo(12.7),unit:'mm'});
 expect(r.document.objects[1].properties['row.repeatHeader'].value).toBe(true);
 expect(r.document.objects[2].properties['tcW.value'].value).toBeCloseTo(25.4);
 expect(r.document.objects[2].properties['tcBorders.top.width']).toMatchObject({value:1,unit:'pt'});
});
it('follows numStyleLink with concrete overrides and detects cycles',async()=>{
 const numbering=wrap('numbering','<w:abstractNum w:abstractNumId="0"><w:numStyleLink w:val="N"/></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:styleLink w:val="N"/><w:lvl w:ilvl="0"><w:start w:val="2"/><w:pPr><w:ind w:left="720"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>');
 const style=defaults+'<w:style w:type="numbering" w:styleId="N"><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style>';
 const r=await report(p('Item','<w:numPr><w:numId w:val="1"/></w:numPr>'),style,{'word/numbering.xml':numbering});
 expect(r.document.paragraphs[0].properties.numberStart.value).toBe('7');expect(r.document.paragraphs[0].properties.left.value).toBeCloseTo(12.7);
 const cyclic=await report(p('Item','<w:numPr><w:numId w:val="1"/></w:numPr>'),style.replace('w:val="2"','w:val="1"'),{'word/numbering.xml':numbering});
 expect(cyclic.results.find(x=>x.ruleId==='text.font')?.status).toBe('unknown');
});
it('resolves header/footer variants and inherited uses without assigning physical pages',async()=>{
 const sect=`<w:sectPr><w:headerReference w:type="default" r:id="h"/><w:footerReference w:type="default" r:id="f"/><w:footerReference w:type="first" r:id="first"/><w:titlePg/></w:sectPr>`;
 const rels=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="h" Type="${R}header" Target="header1.xml"/><Relationship Id="f" Type="${R}footer" Target="footer1.xml"/><Relationship Id="first" Type="${R}footer" Target="footer2.xml"/><Relationship Id="unused" Type="${R}header" Target="header2.xml"/><Relationship Id="s" Type="${R}settings" Target="settings.xml"/></Relationships>`;
 const r=await report(`<w:p><w:pPr>${sect}</w:pPr><w:r><w:t>One</w:t></w:r></w:p>${p('Two')}<w:sectPr/>`,'',{'word/_rels/document.xml.rels':rels,'word/header1.xml':wrap('hdr',p('Header')),'word/header2.xml':wrap('hdr',p('Unused')),'word/footer1.xml':wrap('ftr',p('Footer')),'word/footer2.xml':wrap('ftr',p('First')),'word/settings.xml':wrap('settings','<w:mirrorMargins/>')});
 expect(r.document.paragraphs.map(p=>p.text)).not.toContain('Unused');
 expect(r.document.paragraphs.find(p=>p.text==='Header')?.at.sectionUses).toEqual([{section:1,variant:'default',kind:'header'},{section:2,variant:'default',kind:'header'}]);
 expect(r.document.sections[1].footers.first).toBeUndefined();expect(r.document.sections[0].properties.mirrorMargins.value).toBe(true);
 expect(r.document.paragraphs.filter(p=>p.role==='header'||p.role==='footer').every(p=>p.at.page.status==='unknown')).toBe(true);
});
it('checks each compound PAGE paragraph even when another is centered',async()=>{
 const page=(align:string)=>`<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PA</w:instrText></w:r><w:r><w:instrText>GE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
 const r=await report('<w:sectPr><w:footerReference w:type="default" r:id="footer"/></w:sectPr>',defaults,{'word/footer1.xml':wrap('ftr',page('center')+page('left'))});
 expect(r.results.filter(x=>x.ruleId==='footer.page').map(x=>x.status)).toEqual(['pass','fail']);
 expect(r.document.paragraphs.every(p=>p.runs.find(r=>r.text==='1')?.pageField)).toBe(true);
});
it('rejects incorrect content types and ignores a wrong footer relationship type',async()=>{
 const zip=completePackage(new JSZip().file('word/document.xml',wrap('document','<w:body/>')));
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="text/plain"/></Types>');
 await expect(checkDocx(await zip.generateAsync({type:'uint8array'}))).rejects.toThrow('Content Type');
 const rels=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="bad" Type="${R}image" Target="footer1.xml"/></Relationships>`;
 const r=await report('<w:sectPr><w:footerReference w:type="default" r:id="bad"/></w:sectPr>','',{'word/_rels/document.xml.rels':rels,'word/footer1.xml':wrap('ftr',p('Unused'))});
 expect(r.document.paragraphs).toHaveLength(0);expect(r.results.find(x=>x.ruleId==='footer.page')?.status).toBe('unknown');
});
it('applies style toggles relative to docDefaults and direct false absolutely',async()=>{
 const styles='<w:docDefaults><w:rPrDefault><w:rPr><w:b/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="P"><w:rPr><w:b/></w:rPr></w:style><w:style w:type="character" w:styleId="C"><w:rPr><w:b w:val="0"/></w:rPr></w:style>';
 const r=await report(p('A','<w:pStyle w:val="P"/>')+p('B','','<w:rStyle w:val="C"/>')+p('C','','<w:b w:val="0"/>'),styles);
 expect(r.document.paragraphs.map(p=>p.runs[0].properties.bold.value)).toEqual([false,true,false]);
});
it('keeps revised and unsupported areas at exact objects and disables cached hints',async()=>{
 const r=await report(`<w:p><w:r><w:lastRenderedPageBreak/><w:t>Known</w:t></w:r><w:ins w:id="1"><w:r><w:t>Pending</w:t></w:r></w:ins><w:r><w:lastRenderedPageBreak/></w:r></w:p><w:altChunk/>`,defaults);
 expect(r.document.paragraphs[0].text).toBe('Known');
 const areas=r.results.filter(x=>x.ruleId==='document.region');expect(areas).toHaveLength(2);
 expect(areas.every(x=>x.status==='unknown'&&x.at?.part==='word/document.xml')).toBe(true);
 expect(r.document.paragraphs[0].runs.every(r=>r.at.page.status==='unknown')).toBe(true);
});
it('does not treat ordinary nearby text as a malformed table caption',async()=>{
 const r=await report(p('Обычный абзац перед таблицей')+`<w:tbl><w:tr><w:tc>${p('Cell')}</w:tc></w:tr></w:tbl>`,defaults);
 expect(r.results.find(x=>x.ruleId==='table.caption')?.status).toBe('unknown');
 const bad=await report(p('Таблица 1 Неправильный разделитель')+`<w:tbl><w:tr><w:tc>${p('Cell')}</w:tc></w:tr></w:tbl>`,defaults);
 const finding=bad.findings.find(f=>f.id.startsWith('table.caption'))!;
 expect(finding.excerpt).toBe('Таблица 1 Неправильный разделитель');expect(finding.at?.paragraphId).toBe(bad.document.paragraphs[0].id);
});
it('defaults font/size rules to body scope and accepts explicit table scope',async()=>{
 const r=await report(`<w:tbl><w:tr><w:tc>${p('Cell','','<w:sz w:val="20"/>')}</w:tc></w:tr></w:tbl>`,defaults);
 expect(r.results.find(x=>x.ruleId==='text.size')?.status).toBe('unknown');
 const {checks}=await import('../src/checks/formatting');
 expect(checks(r.document,{...DEFAULT_REQUIREMENTS,textRoles:['table']}).find(x=>x.ruleId==='text.size')?.status).toBe('fail');
});
it('does not compare inside/outside or landscape margins with portrait left/right requirements',async()=>{
 const r=await report('<w:sectPr><w:pgMar w:left="1701" w:right="567"/></w:sectPr>',defaults,{'word/settings.xml':wrap('settings','<w:mirrorMargins/>')});
 expect(r.results.filter(x=>['section.margin.left','section.margin.right'].includes(x.ruleId)).map(x=>x.status)).toEqual(['unknown','unknown']);
});
it('does not invent automatic paragraph spacing from an unrelated spacing attribute',async()=>{
 const r=await report(p('Text','<w:spacing w:line="360"/>'),defaults);
 expect(r.document.paragraphs[0].properties.beforeAuto.status).toBe('unknown');
 expect(r.document.paragraphs[0].properties.afterAuto.status).toBe('unknown');
});
it('keeps invalid boolean and numeric lexical values unknown',async()=>{
 const r=await report(p('Text','<w:keepNext w:val="banana"/>','<w:sz w:val="1e2"/>'),defaults);
 expect(r.document.paragraphs[0].properties.keepNext.status).toBe('unknown');
 expect(r.results.find(x=>x.ruleId==='text.size')?.status).toBe('unknown');
});
it('does not hide a half-millimetre error inside a broad legacy tolerance',async()=>{
 const r=await report(p('Text','<w:ind w:firstLine="737"/><w:spacing w:line="348"/>'),defaults);
 expect(r.results.find(x=>x.ruleId==='paragraph.indent')?.status).toBe('fail');
 expect(r.results.find(x=>x.ruleId==='paragraph.spacing')?.status).toBe('fail');
});
it('does not mix old section settings or accept inserted table rows',async()=>{
 const body=p('Body')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:sectPrChange><w:sectPr><w:pgSz w:w="10000"/></w:sectPr></w:sectPrChange></w:sectPr><w:tbl><w:tr><w:trPr><w:ins w:id="1"/></w:trPr><w:tc>'+p('Pending row')+'</w:tc></w:tr></w:tbl>';
 const r=await report(body,defaults);
 expect(r.document.sections).toHaveLength(1);expect(r.document.paragraphs.map(p=>p.text)).toEqual(['Body']);
 expect(r.results.find(x=>x.ruleId==='section.width')?.status).toBe('unknown');
 expect(r.document.unsupported).toHaveLength(2);
});
