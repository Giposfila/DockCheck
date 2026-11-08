import { all, attr, child, children } from './package';
import { extract } from './extract';
import type { Properties } from './model';
// Conditional regions with unambiguous precedence. Banding and corner conflicts
// are deliberately unresolved until tblLook, cnfStyle and gridSpan are modeled.
export function tableStyle(p: Element, doc?: Document) {
 let cell: Element | undefined, row: Element | undefined, table: Element | undefined;
 let n=p.parentNode;
 while(n && n.nodeType===1) { const e=n as Element; if(e.localName==='tc'&&!cell)cell=e; if(e.localName==='tr'&&!row)row=e; if(e.localName==='tbl'){table=e;break;} n=n.parentNode; }
 if(!table) return {p:{},r:{},invalid:false};
 const id=attr(child(child(table,'tblPr'),'tblStyle'),'val');
 if(!id) return {p:{},r:{},invalid:false};
 const seen=new Set<string>(); let props:Properties={},runs:Properties={},invalid=false;
 function apply(styleId:string) {
  if(seen.has(styleId)){invalid=true;return;} seen.add(styleId);
  const s=doc && all(doc,'style').find(s=>attr(s,'styleId')===styleId);
  if(!s){invalid=true;return;}
  const base=attr(child(s,'basedOn'),'val'); if(base)apply(base);
  props={...props,...extract(child(s,'pPr'),'word/styles.xml',styleId)}; runs={...runs,...extract(child(s,'rPr'),'word/styles.xml',styleId)};
  const look=child(child(table,'tblPr'),'tblLook');
  const mask=parseInt(attr(look,'val') ?? '0',16);
  const on=(key:string,bit:number)=>attr(look,key)!==undefined ? !['0','false','off'].includes(attr(look,key)!):!!(mask&bit);
  const rows=children(table!).filter(n=>n.localName==='tr'); const cells=row?children(row).filter(n=>n.localName==='tc'):[];
  const active=['wholeTable'];
  if(on('firstRow',32)&&row===rows[0])active.push('firstRow');
  if(on('lastRow',64)&&row===rows.at(-1))active.push('lastRow');
  if(on('firstColumn',128)&&cell===cells[0])active.push('firstCol');
  if(on('lastColumn',256)&&cell===cells.at(-1))active.push('lastCol');
  const conditionals=children(s).filter(n=>n.localName==='tblStylePr');
  if(conditionals.some(n=>/band|Cell/.test(attr(n,'type') ?? '')) || active.length>2) invalid=true;
  for(const region of active) for(const c of conditionals.filter(n=>attr(n,'type')===region)) {
   props={...props,...extract(child(c,'pPr'),'word/styles.xml',styleId)}; runs={...runs,...extract(child(c,'rPr'),'word/styles.xml',styleId)};
  }
 }
 apply(id);
 return {p:props,r:runs,invalid};
}
export function tableGeometry(node: Element, part:string):Properties {
 const result:Properties={};
 function visit(n:Element,path:string){
  for(const a of Array.from(n.attributes)) if(a.namespaceURI?.includes('wordprocessingml')) result[`${path}@${a.localName}`]={value:a.value,raw:a.value,status:'resolved',source:{part,property:`${path}@${a.localName}`},unit:['w','h','val'].includes(a.localName)?'OOXML (см. type/hRule)':'enum'};
  children(n).forEach((c,i)=>visit(c,`${path}/${c.localName}[${i}]`));
 }
 for(const tag of ['tblPr','tblGrid','trPr','tcPr']) {const p=child(node,tag);if(p)visit(p,tag);}
 return result;
}
