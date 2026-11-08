import JSZip from 'jszip';
import { writeFile } from 'node:fs/promises';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/package/2006/relationships';
for (const kind of ['correct','incorrect','partial']) {
 const zip=new JSZip();
 zip.file('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
 zip.file('_rels/.rels',`<Relationships xmlns="${R}"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
 zip.file('word/_rels/document.xml.rels',`<Relationships xmlns="${R}"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
 zip.file('word/styles.xml',`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:pPr><w:jc w:val="both"/><w:ind w:firstLine="709"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="${kind==='incorrect'?'Arial':'Times New Roman'}" w:hAnsi="${kind==='incorrect'?'Arial':'Times New Roman'}"/><w:sz w:val="${kind==='incorrect'?22:28}"/></w:rPr></w:style></w:styles>`);
 zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body><w:p>${kind==='partial'?'<w:pPr><w:pStyle w:val="Missing"/></w:pPr>':''}<w:r><w:t>Проверочный документ DockCheck.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="567" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
 await writeFile(new URL(`${kind}.docx`,import.meta.url),await zip.generateAsync({type:'nodebuffer'}));
}
