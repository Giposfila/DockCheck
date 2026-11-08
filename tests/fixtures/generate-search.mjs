import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
const zip=await JSZip.loadAsync(await readFile(new URL('correct.docx',import.meta.url)));
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const run=(text,size=28)=>`<w:r><w:rPr><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>
<w:p>${run('😀 Начало. '+ 'Контекст для поиска. '.repeat(12))}<w:hyperlink>${run('Одинаковая цитата',24)}</w:hyperlink>${run(' После первого места. ')}${run('Одинаковая цитата',24)}<w:r><w:tab/><w:br/></w:r></w:p>
<w:p><w:r><w:lastRenderedPageBreak/></w:r>${run('Между сохранёнными маркерами',24)}</w:p>
<w:p><w:r><w:lastRenderedPageBreak/></w:r>${run('После последнего маркера')}</w:p>
<w:tbl><w:tr><w:tc><w:p>${run('Ошибка в таблице',24)}</w:p><w:tbl><w:tr><w:tc><w:p>${run('Вложенная таблица',24)}</w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>

<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="567" w:bottom="1134" w:left="1701"/></w:sectPr>
</w:body></w:document>`);
await writeFile(new URL('search.docx',import.meta.url),await zip.generateAsync({type:'nodebuffer'}));

// A VML text box is preserved as a separate story; its shape is unsupported.
zip.file('word/document.xml',`<w:document xmlns:w="${W}" xmlns:v="urn:schemas-microsoft-com:vml"><w:body><w:p><w:r><w:pict><v:shape id="TextBox1" style="width:180pt;height:60pt"><v:textbox><w:txbxContent><w:p>${run('Текстовый блок',24)}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p><w:sectPr/></w:body></w:document>`);
await writeFile(new URL('textbox.docx',import.meta.url),await zip.generateAsync({type:'nodebuffer'}));
