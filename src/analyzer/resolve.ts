import { all, attr, child, children, W, type Package } from './package';
import { extract } from './extract';
import { tableStyle, tableGeometry } from './tables';
import { complete, textKeys, paragraphKeys, sectionKeys, overlay } from './properties';
import { styles } from './styles';
import { numbering } from './numbering';
import { resolveFont, resolveColor } from './theme';
import { unknown, type DocumentModel, type Paragraph, type Properties } from './model';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export async function analyze(pkg: Package): Promise<DocumentModel> {
 const rels = await pkg.relationships('word/document.xml');
 const stylesXml = await pkg.read('word/styles.xml');
 const style = styles(stylesXml);
 const nums = await pkg.read('word/numbering.xml');
 const themePath = [...rels.values()].find(p=>p.includes('/theme/'));
 const theme = await pkg.read(themePath ?? 'word/theme/theme1.xml');
 const limitations = new Set<string>();
 const paragraphs: Paragraph[] = [];
 let tables = 0, images = 0;
 const objects: DocumentModel['objects']=[];
 function neighborText(node:Element,direction:number) {
  let sibling=direction<0?node.previousSibling:node.nextSibling;
  while(sibling) {if(sibling.nodeType===1) {const e=sibling as Element;if(e.localName==='p') {const text=all(e,'t').map(n=>n.textContent ?? '').join('');if(text.trim())return text;} else break;} sibling=direction<0?sibling.previousSibling:sibling.nextSibling;}
  return '';
 }
 function walk(node: Element, part: string, location: string, role: Paragraph['role'] = 'body') {
  if (node.namespaceURI !== W) { limitations.add(`Неподдерживаемая конструкция: ${node.namespaceURI} ${node.localName}`); return; }
  if (['del','ins','moveFrom','moveTo','pPrChange','rPrChange'].includes(node.localName)) { limitations.add('Исправления не приняты: их содержимое не проверяется'); return; }
  if (node.localName==='tbl') { tables++; role='table'; location+=` → таблица ${tables}`;  }
  if (['tbl','tr','tc'].includes(node.localName)) objects.push({location,kind:node.localName,caption:node.localName==='tbl'?neighborText(node,-1):undefined,properties:tableGeometry(node,part)});
  if (node.localName==='tr' || node.localName==='tc') location+=` → ${node.localName==='tr'?'строка':'ячейка'} ${children(node.parentNode as Element).filter(n=>n.localName===node.localName).indexOf(node)+1}`;
  if (node.localName==='drawing') images++;
  if (node.localName==='p') {
   const pp = child(node,'pPr'); const id = attr(child(pp,'pStyle'),'val') ?? style.defaults.paragraph;
   const base = style.chain(id); const table = tableStyle(node,stylesXml);
   let p: Properties = {...style.p,...table.p,...base.p,...extract(pp,part)};
   let invalid = table.invalid || base.invalid || all(node,'pPrChange').length>0;
   let list: ReturnType<typeof numbering> | undefined;
   if (p.numId && p.numId.value!=='0') { list=numbering(nums,String(p.numId.value),String(p.level?.value ?? '0')); p={...list.p,...p}; role='list'; }
   invalid ||= !!list?.invalid;
   if (invalid) limitations.add('Цикл, отсутствующий стиль, уровень списка или исправления свойств');
   const heading = /heading|заголов/i.test(id ?? '') || !!child(pp,'outlineLvl');
   const paragraph: Paragraph = {explicit:extract(pp,part),pageField:/\bPAGE\b/i.test(all(node,'instrText').map(n=>n.textContent ?? '').join('')) || all(node,'fldSimple').some(n=>/\bPAGE\b/i.test(attr(n,'instr') ?? '')),id:`${part}:p${paragraphs.length+1}`,location:`${location} → абзац ${paragraphs.filter(p=>p.id.startsWith(part+':')).length+1}`,text:'',role:heading?'heading':role,properties:p,runs:[]};
   function runs(n: Element) {
    if (n!==node && ['p','txbxContent'].includes(n.localName)) return;
    if (['del','ins','moveFrom','moveTo'].includes(n.localName)) { limitations.add('Исправления не приняты: их содержимое не проверяется'); return; }
    if (n.namespaceURI!==W) {limitations.add(`Неподдерживаемая конструкция ${n.localName}`);return;}
    if (n.localName==='r') {
     const rp=child(n,'rPr'); const rs=style.chain(attr(child(rp,'rStyle'),'val') ?? style.defaults.character);
     const inherited=overlay(style.r,table.r,base.r);
     const charProps={...rs.r};
     for(const key of ['bold','italic']) if(charProps[key]) charProps[key]={...charProps[key],value:charProps[key].value ? !inherited[key]?.value : inherited[key]?.value ?? false};
     const props: Properties=overlay(inherited,charProps,extract(rp,part));
     let text='';
     for (const c of children(n)) if (c.localName==='t') text+=c.textContent ?? ''; else if (c.localName==='tab') text+='\t'; else if(c.localName==='br'||c.localName==='cr') text+='\n';
     const field=/\bPAGE\b/i.test(all(n,'instrText').map(x=>x.textContent ?? '').join(''));
     props.font=resolveFont(props,text || (field?'0':''),theme);
     const color=resolveColor(props,theme); if(color) props.color=props.colorTint||props.colorShade?{...color,value:null,status:'unsupported',reason:'Тонирование тематического цвета не разрешено'}:color;
     if (invalid || rs.invalid || all(n,'rPrChange').length) for (const key of [...Object.keys(props),'font','fontSize','bold']) props[key]={...unknown(),status:'unsupported',reason:'Не разрешены стили, условная область таблицы или исправления'};
     paragraph.runs.push({text,pageField:field,explicit:extract(rp,part),properties:complete(props,textKeys)}); paragraph.text+=text;
     return;
    }
    for (const c of children(n)) runs(c);
   }
   runs(node);
   images+=all(node,'drawing').length;
   if(all(node,'drawing').length) objects.push({location:paragraph.location,kind:'drawing',properties:{},caption:neighborText(node,1)});
   if(invalid) for(const key of [...Object.keys(p),'align','firstLine','line']) p[key]={...unknown(),status:'unsupported',reason:'Стили или исправления не разрешены'};
   complete(p,paragraphKeys);
   paragraphs.push(paragraph);
   // Text boxes form separate stories; do not count their text twice.
   for (const box of all(node,'txbxContent')) for (const c of children(box)) walk(c,part,location+' → текстовый блок',role);
   return;
  }
  for (const c of children(node)) walk(c,part,location,role);
 }
 walk(pkg.document.documentElement,'word/document.xml','Основной текст');
 const sections: DocumentModel['sections']=[];
 let inherited: Record<string,string|null>={};
 for (const sect of all(pkg.document,'sectPr')) {
  inherited={...inherited};
  for(const ref of children(sect).filter(n=>n.localName==='footerReference')) {
   const target=rels.get(ref.getAttributeNS(R,'id') ?? '');
   inherited[attr(ref,'type') ?? 'default']=target ?? null;
  }
  const active={...inherited};
  const enabled=(n:Element|undefined)=>!!n&&!['0','false','off'].includes(attr(n,'val') ?? '');
  if(!enabled(child(sect,'titlePg'))) delete active.first;
  const settings=await pkg.read('word/settings.xml');
  if(!enabled(settings ? all(settings,'evenAndOddHeaders')[0]:undefined)) delete active.even;
  sections.push({properties:complete(extract(sect,'word/document.xml'),sectionKeys),footers:active});
 }
 if([...rels.values()].some(p=>/\/header/.test(p))) limitations.add('Области действия верхних колонтитулов по секциям не разрешены');
 const related = new Set([...sections.flatMap(s=>Object.values(s.footers)),...Array.from(rels.values()).filter(p=>/\/(footnotes|endnotes|header[^/]*)\.xml$/.test(p))]);
 for(const part of related) {
  if(!part) { limitations.add('Отсутствующая связь колонтитула'); continue; }
  const xml=await pkg.read(part);
  if(xml) walk(xml.documentElement,part,part,/footer/.test(part)?'footer':'note');
  else limitations.add(`Отсутствует связанная часть ${part}`);
 }
 if(!sections.length) limitations.add('Параметры секции отсутствуют');
 return {objects,paragraphs,sections,limitations:[...limitations],tables,images};
}
