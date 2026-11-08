import { all, attr, child, children, W, REL, type Package } from './package';
import { extract } from './extract';
import { tableStyle, tableGeometry } from './tables';
import { complete, textKeys, paragraphKeys, sectionKeys, overlay, applyStyle } from './properties';
import { styles } from './styles';
import { numbering } from './numbering';
import { resolveFont, resolveColor } from './theme';
import { unknown, type DocumentModel, type Paragraph, type Properties } from './model';
import { unknownPage, locationLabel, assignSavedPages } from './location';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export async function analyze(pkg: Package): Promise<DocumentModel> {
 const relations=await pkg.relations('word/document.xml');
 const rels=new Map([...relations].filter(([,r])=>r.type.startsWith(REL)).map(([id,r])=>[id,r.target]));
 const target=(kind:string)=>[...relations.values()].find(r=>r.type===REL+kind)?.target;
 const stylesXml = target('styles') ? await pkg.read(target('styles')!):undefined;
 const style = styles(stylesXml);
 const nums = target('numbering') ? await pkg.read(target('numbering')!):undefined;
 const themePath = target('theme');
 const theme = themePath ? await pkg.read(themePath):undefined;
 const limitations = new Set<string>();
 const sectionNodes=all(pkg.document,'sectPr').filter(node=>{for(let n=node.parentNode;n&&n.nodeType===1;n=n.parentNode)if(/Change$/.test((n as Element).localName))return false;return true;});
 const paragraphs: Paragraph[] = [];
 const unsupported:DocumentModel['unsupported']=[];
 let tables = 0, images = 0, sectionNumber = 1;
 const paragraphCounts = new Map<string,number>();
 const tableIds = new Map<Element,number>();
 function address(node:Element,part:string,paragraph=true): Paragraph['at'] {
  const ancestors:Element[]=[];
  for(let n:Node|null=node.parentNode;n && n.nodeType===1;n=n.parentNode) ancestors.unshift(n as Element);
  if(!paragraph)ancestors.push(node);
  const tablePath=ancestors.filter(n=>n.localName==='tbl').map(t=>{
   const pos=ancestors.indexOf(t);
   const row=ancestors.slice(pos+1).find(n=>n.localName==='tr');
   const cell=ancestors.slice(pos+1).find(n=>n.localName==='tc');
   const ordinal=(n:Element|undefined)=>n?children(n.parentNode as Element).filter(x=>x.localName===n.localName).indexOf(n)+1:0;
   return {table:tableIds.get(t) ?? 0,row:ordinal(row),cell:ordinal(cell)};
  });
  const box=ancestors.find(n=>n.localName==='txbxContent');
  const note=ancestors.find(n=>['footnote','endnote'].includes(n.localName));
  const area=box?'textbox':ancestors.some(n=>n.localName==='ftr')?'footer':ancestors.some(n=>n.localName==='hdr')?'header':note?'note':tablePath.length?'table':'body';
  const storyId=box?`блок ${all(node.ownerDocument!,'txbxContent').indexOf(box)+1}`:note?`${note.localName} ${attr(note,'id')}`:undefined;
  const scope=JSON.stringify([part,area,storyId,tablePath]);
  const paragraphNumber=(paragraphCounts.get(scope) ?? 0)+1;if(paragraph)paragraphCounts.set(scope,paragraphNumber);
  const xmlPath=[...ancestors.filter(n=>n!==node),node].map(n=>`${n.localName}[${n.parentNode?children(n.parentNode as Element).filter(x=>x.localName===n.localName&&x.namespaceURI===n.namespaceURI).indexOf(n)+1:1}]`).join('/');
  return {xmlPath,part,area,storyId,tablePath,paragraphNumber:paragraph?paragraphNumber:undefined,section:part==='word/document.xml'?sectionNumber:undefined,page:unknownPage(area==='header'||area==='footer'?'Колонтитул может повторяться на нескольких страницах':undefined)};
 }
 const noteRefs={footnote:new Set(all(pkg.document,'footnoteReference').map(n=>attr(n,'id'))),endnote:new Set(all(pkg.document,'endnoteReference').map(n=>attr(n,'id')))};
 const objects: DocumentModel['objects']=[];
 const paragraphNodes=new Map<Element,Paragraph>();
 const captionNodes=new Map<DocumentModel['objects'][number],Element>();
 function neighborParagraph(node:Element,direction:number):Element|undefined {
  let sibling=direction<0?node.previousSibling:node.nextSibling;
  while(sibling) {
   if(sibling.nodeType===1){const e=sibling as Element;if(e.localName!=='p')return;if(all(e,'t').some(t=>t.textContent?.trim()))return e;}
   sibling=direction<0?sibling.previousSibling:sibling.nextSibling;
  }
 }
 function addObject(obj:DocumentModel['objects'][number],caption?:Element) {objects.push(obj);if(caption)captionNodes.set(obj,caption);}
 function unsupportedAt(reason:string,node:Element,part:string,at=address(node,part,false)) {unsupported.push({at,reason});}
 function walk(node: Element, part: string, location: string, role: Paragraph['role'] = 'body') {
  if((node.localName==='footnote'||node.localName==='endnote') && (!noteRefs[node.localName].has(attr(node,'id')) || ['separator','continuationSeparator'].includes(attr(node,'type') ?? '')))return;
  if (node.namespaceURI !== W) { unsupportedAt(`Неподдерживаемая конструкция: ${node.namespaceURI} ${node.localName}`,node,part); return; }
  if (['del','ins','moveFrom','moveTo','pPrChange','rPrChange'].includes(node.localName)) { unsupportedAt('Исправления не приняты: их содержимое не проверяется',node,part); return; }
  if(['altChunk','subDoc','contentPart','customXml'].includes(node.localName)) {unsupportedAt(`Конструкция ${node.localName} требует ручной проверки`,node,part);return;}
  if(node.localName==='tr' && children(child(node,'trPr') ?? node).some(n=>['ins','del','moveFrom','moveTo'].includes(n.localName))) {unsupportedAt('Исправления строки таблицы не приняты: строка не проверяется',node,part);return;}
  if (node.localName==='tbl') { tables++; tableIds.set(node,tables); role='table'; location+=` → таблица ${tables}`;  }
  if (['tbl','tr','tc'].includes(node.localName)) addObject({at:address(node,part,false),location:locationLabel(address(node,part,false)),kind:node.localName,properties:tableGeometry(node,part)},node.localName==='tbl'?neighborParagraph(node,-1):undefined);
  if (node.localName==='tr' || node.localName==='tc') location+=` → ${node.localName==='tr'?'строка':'ячейка'} ${children(node.parentNode as Element).filter(n=>n.localName===node.localName).indexOf(node)+1}`;
  if (node.localName==='drawing') images++;
  if (node.localName==='p') {
   const pp = child(node,'pPr'); const id = attr(child(pp,'pStyle'),'val') ?? style.defaults.paragraph;
   const base = style.chain(id,new Set(),'paragraph'); const table = tableStyle(node,stylesXml);
   let p: Properties = overlay(style.p,table.p,base.p,extract(pp,part));
   let invalid = table.invalid || base.invalid || all(node,'pPrChange').length>0;
   let list: ReturnType<typeof numbering> | undefined;
   if (p.numId && p.numId.value!=='0') { list=numbering(nums,String(p.numId.value),String(p.level?.value ?? '0'),stylesXml); p=overlay(style.p,table.p,base.p,list.p,extract(pp,part)); role='list'; }
   invalid ||= !!list?.invalid;
   if (invalid) limitations.add('Цикл, отсутствующий стиль, уровень списка или исправления свойств');
   const namedStyle=stylesXml && all(stylesXml,'style').find(s=>attr(s,'styleId')===id);
   const styleName=attr(child(namedStyle,'name'),'val') ?? id ?? '';
   const heading = /heading|заголов/i.test(styleName) || p.outlineLevel?.status==='resolved' && Number(p.outlineLevel.value)<9;
   const effectiveRole=atRole();
   function atRole():Paragraph['role'] {
    if(/caption|подпис|название.*(таблиц|рисун)/i.test(styleName))return 'caption';
    if(address(node,part,false).area==='textbox')return 'textbox';
    return heading?'heading':role;
   }
   const at=address(node,part);
   const paragraph: Paragraph = {at,savedBreaks:[],explicit:extract(pp,part),fieldStatus:'none',pageField:all(node,'fldSimple').some(n=>/^\s*PAGE(?:\s|$)/i.test(attr(n,'instr') ?? '')),id:`${part}:p${paragraphs.length+1}`,location:locationLabel(at),text:'',role:effectiveRole,properties:p,runs:[]};
   at.paragraphId=paragraph.id;
   paragraph.location=locationLabel(at);
   const fields:{instruction:string;start:number}[]=[];
   function runs(n: Element) {
    if (n!==node && ['p','txbxContent'].includes(n.localName)) return;
    if (['del','ins','moveFrom','moveTo'].includes(n.localName)) { unsupportedAt('Исправления не приняты: их содержимое не проверяется',n,part,{...at,range:undefined}); return; }
    if (n.namespaceURI!==W) {unsupportedAt(`Неподдерживаемая конструкция ${n.namespaceURI} ${n.localName}`,n,part,{...at,range:undefined});return;}
    if (n.localName==='r') {
     const rp=child(n,'rPr'); const rs=style.chain(attr(child(rp,'rStyle'),'val') ?? style.defaults.character,new Set(),'character');
     const inherited=applyStyle(applyStyle(style.r,table.r),base.r);
     const charProps={...rs.r};
     for(const key of ['bold','italic']) if(charProps[key]) charProps[key]={...charProps[key],value:charProps[key].value ? !inherited[key]?.value : inherited[key]?.value ?? false};
     const props: Properties=overlay(inherited,charProps,extract(rp,part));
     let text='';
     const chunks:string[]=[];
     for (const c of children(n)) {
      if(c.localName==='lastRenderedPageBreak') {chunks.push(text);paragraph.savedBreaks.push(paragraph.text.length+chunks.join('').length);text='';}
      else if(['sym','object','pict','contentPart'].includes(c.localName) || c.namespaceURI!==W) unsupportedAt(`Содержимое ${c.localName} не интерпретировано`,c,part,{...at,range:undefined});
      else if (c.localName==='t') text+=c.textContent ?? ''; else if (c.localName==='tab') text+='\t'; else if(c.localName==='br'||c.localName==='cr') text+='\n';
     }
     chunks.push(text); text=chunks.join('');
     for(const c of children(n)) {
      if(c.localName==='fldChar') {
       const type=attr(c,'fldCharType');
       if(type==='begin') {if(fields.length)paragraph.fieldStatus='unsupported';fields.push({instruction:'',start:paragraph.runs.length});}
       if(type==='end') {const f=fields.pop();if(f && /^\s*PAGE(?:\s|$)/i.test(f.instruction)) {paragraph.pageField=true;if(paragraph.fieldStatus!=='unsupported')paragraph.fieldStatus='resolved';for(const r of paragraph.runs.slice(f.start))r.pageField=true;}}
      }
      if(c.localName==='instrText') {if(fields.length)fields.at(-1)!.instruction+=c.textContent ?? '';else paragraph.fieldStatus='unsupported';}
     }
     let simple:Element|undefined;
     for(let a:Node|null=n.parentNode;a && a!==node;a=a.parentNode) if((a as Element).localName==='fldSimple')simple=a as Element;
     const field=!!simple && /\bPAGE\b/i.test(attr(simple,'instr') ?? '') || /\bPAGE\b/i.test(all(n,'instrText').map(x=>x.textContent ?? '').join(''));
     if(/[\u0590-\u08ff]/u.test(text)) props.fontSize={...unknown('Для сложных письменностей требуется отдельное разрешение szCs и bidi'),status:'unsupported'};
     props.font=resolveFont(props,text || (field?'0':''),theme);
     const color=resolveColor(props,theme); if(color) props.color=color;
     if (invalid || rs.invalid || all(n,'rPrChange').length) for (const key of [...Object.keys(props),'font','fontSize','bold']) props[key]={...unknown(),status:'unsupported',reason:'Не разрешены стили, условная область таблицы или исправления'};
     for(const chunk of chunks) {
      const start=paragraph.text.length;const id=`${paragraph.id}:r${paragraph.runs.length+1}`;
      const fontRanges:{start:number;end:number;property:ReturnType<typeof resolveFont>}[]=[];
      let offset=start;
      for(const character of Array.from(chunk)) {
       if(!/\s/u.test(character)) {
        const property=invalid||rs.invalid?props.font:resolveFont(props,character,theme);
        const last=fontRanges.at(-1);
        if(last && last.property.value===property.value && last.property.status===property.status)last.end=offset+character.length;
        else fontRanges.push({start:offset,end:offset+character.length,property});
       }
       offset+=character.length;
      }
      paragraph.runs.push({fontRanges,id,at:{...at,fragmentId:id,range:{start,end:start+chunk.length,unit:'utf16'}},text:chunk,pageField:field,explicit:extract(rp,part),properties:complete({...props},textKeys)});paragraph.text+=chunk;
     }
     return;
    }
    for (const c of children(n)) runs(c);
   }
   runs(node);
   if(paragraph.pageField && paragraph.fieldStatus==='none')paragraph.fieldStatus='resolved';
   if(fields.length || paragraph.fieldStatus==='unsupported') {paragraph.fieldStatus='unsupported';limitations.add(`Незавершённое составное поле: ${paragraph.location}`);paragraph.pageField=false;}
   images+=all(node,'drawing').length;
   if(all(node,'drawing').length) addObject({at:{...paragraph.at,range:undefined},location:paragraph.location,kind:'drawing',properties:{}},neighborParagraph(node,1));
   if(invalid) for(const key of [...Object.keys(p),'align','firstLine','line']) p[key]={...unknown(),status:'unsupported',reason:'Стили или исправления не разрешены'};
   complete(p,paragraphKeys);
   at.range={start:0,end:paragraph.text.length,unit:"utf16"};
   paragraphs.push(paragraph);paragraphNodes.set(node,paragraph);
   // Text boxes form separate stories; do not count their text twice.
   for (const box of all(node,'txbxContent').filter(box=>{for(let a=box.parentNode;a && a!==node;a=a.parentNode)if(['txbxContent','AlternateContent'].includes((a as Element).localName))return false;return true;})) for (const c of children(box)) walk(c,part,location+' → текстовый блок',role);
   if(part==='word/document.xml' && child(pp,'sectPr')) sectionNumber++;
   return;
  }
  for (const c of children(node)) walk(c,part,location,role);
 }
 walk(pkg.document.documentElement,'word/document.xml','Основной текст');
 for(const alternate of Array.from(pkg.document.getElementsByTagNameNS('http://schemas.openxmlformats.org/markup-compatibility/2006','AlternateContent')))unsupportedAt('Альтернативные представления AlternateContent не выбираются: Choice/Fallback не учитываются повторно',alternate,'word/document.xml');
 const sections: DocumentModel['sections']=[];
 let inherited: Record<'header'|'footer',Record<string,string|null>>={header:{},footer:{}};
 const settings=target('settings') ? await pkg.read(target('settings')!):undefined;
 const enabled=(n:Element|undefined)=>!!n&&!['0','false','off'].includes(attr(n,'val') ?? '');
 const even=enabled(settings ? all(settings,'evenAndOddHeaders')[0]:undefined);
 for (const sect of sectionNodes) {
  const active:typeof inherited={header:{},footer:{}};
  for(const kind of ['header','footer'] as const) {
   inherited[kind]={...inherited[kind]};
   for(const ref of children(sect).filter(n=>n.localName===kind+'Reference')) {
    const relation=relations.get(ref.getAttributeNS(R,'id') ?? '');
    inherited[kind][attr(ref,'type') ?? 'default']=relation?.type===REL+kind?relation.target:null;
   }
   active[kind]={...inherited[kind]};
   if(!enabled(child(sect,'titlePg')))delete active[kind].first;
   if(!even)delete active[kind].even;
  }
  const props=complete(extract(sect,'word/document.xml'),sectionKeys);
  props.mirrorMargins={value:enabled(settings ? all(settings,'mirrorMargins')[0]:undefined),status:'resolved',source:{part:target('settings') ?? 'word/settings.xml',property:'mirrorMargins'}};
  if(child(sect,'sectPrChange')) {unsupportedAt('Изменённые свойства секции не приняты',sect,'word/document.xml');for(const key of Object.keys(props))props[key]={...unknown('Изменённые свойства секции не приняты'),status:'unsupported'};}
  sections.push({properties:props,footers:active.footer,headers:active.header});
 }
 const related = new Set([...sections.flatMap(s=>[...Object.values(s.footers),...Object.values(s.headers)]),...[...relations.values()].filter(r=>['footnotes','endnotes'].some(kind=>r.type===REL+kind)).map(r=>r.target)]);
 for(const part of related) {
  if(!part) { limitations.add('Отсутствующая связь колонтитула'); continue; }
  const xml=await pkg.read(part);
  const kind=[...relations.values()].find(r=>r.target===part)?.type.slice(REL.length);
  const expectedRoot=kind ? ({footer:'ftr',header:'hdr',footnotes:'footnotes',endnotes:'endnotes'} as Record<string,string>)[kind]:undefined;
  if(xml && (xml.documentElement.namespaceURI!==W || xml.documentElement.localName!==expectedRoot))unsupportedAt('Корневая конструкция связанной части не соответствует типу relationships',xml.documentElement,part);
  else if(xml) walk(xml.documentElement,part,part,xml.documentElement.localName==='ftr'?'footer':xml.documentElement.localName==='hdr'?'header':'note');
  else limitations.add(`Отсутствует связанная часть ${part}`);
 }
 for(const p of paragraphs) {
  const uses:NonNullable<Paragraph['at']['sectionUses']>=[];
  sections.forEach((s,i)=>{for(const kind of ['header','footer'] as const) for(const [variant,part] of Object.entries(kind==='header'?s.headers:s.footers)) if(part===p.at.part)uses.push({section:i+1,variant,kind});});
  if(uses.length) {p.at.sectionUses=uses;p.at.storyId=uses.map(u=>`раздел ${u.section}, ${u.variant}`).join('; ');p.location=locationLabel(p.at);for(const r of p.runs)r.at.sectionUses=uses;}
 }
 if(!sections.length) limitations.add('Параметры секции отсутствуют');
 assignSavedPages(paragraphs,sectionNodes.length>1 || all(pkg.document,'br').some(n=>attr(n,'type')==='page') || paragraphs.some(p=>p.properties.pageBreakBefore?.value===true) || unsupported.length>0);
 for(const [obj,node] of captionNodes){const p=paragraphNodes.get(node);if(p){obj.caption=p.text;obj.captionParagraphId=p.id;if(/^(Таблица|Рисунок)\s+\S/u.test(p.text))p.role='caption';}}
 const sourcePaths:Record<string,string|undefined>={'word/styles.xml':target('styles'),'word/numbering.xml':target('numbering')};
 const fixSource=(props:Properties)=>{for(const p of Object.values(props))if(p.source && sourcePaths[p.source.part])p.source={...p.source,part:sourcePaths[p.source.part]!};};
 for(const p of paragraphs){fixSource(p.properties);fixSource(p.explicit);for(const r of p.runs){fixSource(r.properties);fixSource(r.explicit);for(const span of r.fontRanges)if(span.property.source && sourcePaths[span.property.source.part])span.property={...span.property,source:{...span.property.source,part:sourcePaths[span.property.source.part]!}};}}
 for(const region of unsupported)limitations.add(region.reason);
 return {objects,paragraphs,sections,unsupported,limitations:[...limitations],tables,images};
}
