import { all, attr, child, children } from './package';
import { styles } from './styles';
import { unknown } from './model';
import { extract } from './extract';
export function numbering(doc: Document | undefined, id: string, level: string, stylesXml?:Document, seen=new Set<string>()): {p:import('./model').Properties;r:import('./model').Properties;invalid:boolean} {
 if(seen.has(id))return {p:{},r:{},invalid:true};seen.add(id);
 const num = doc && all(doc,'num').find(n=>attr(n,'numId')===id);
 const abstract = doc && all(doc,'abstractNum').find(n=>attr(n,'abstractNumId')===attr(child(num || undefined,'abstractNumId'),'val'));
 const override = num && children(num).find(n=>n.localName==='lvlOverride' && attr(n,'ilvl')===level);
 const lvl = child(override || undefined,'lvl') ?? (abstract && children(abstract).find(n=>n.localName==='lvl' && attr(n,'ilvl')===level));
 const linked=attr(child(abstract || undefined,'numStyleLink'),'val');
 const ownStyle=attr(child(abstract || undefined,'styleLink'),'val');
 if(linked) {
  const resolved=styles(stylesXml).chain(linked,new Set(),'numbering');
  const next=resolved.p.numId?.value;
  if(resolved.invalid || !next)return {p:{},r:{},invalid:true};
  const base=numbering(doc,String(next),level,stylesXml,seen);
  if(!override)return base;
  // Overrides belong to the concrete instance even when levels come from a link.
  if(!child(override,'lvl')) {
   const start=attr(child(override,'startOverride'),'val');
   return {...base,p:{...base.p,...(start?{numberStart:{value:start,status:'resolved' as const,source:{part:'word/numbering.xml',property:'startOverride'}}}:{})}};
  }
 }
 const p = extract(child(lvl || undefined,'pPr'),'word/numbering.xml');
 const r = extract(child(lvl || undefined,'rPr'),'word/numbering.xml');
 for (const [key,tag] of [['numberFormat','numFmt'],['numberText','lvlText'],['numberStart','start'],['numberRestart','lvlRestart']]) {
  const value = attr(child(lvl || undefined,tag),'val');
  if (value) p[key] = {value,status:'resolved',source:{part:'word/numbering.xml',property:key}};
 }
 const start = attr(child(override || undefined,'startOverride'),'val');
 if (start) p.numberStart = {value:start,status:'resolved',source:{part:'word/numbering.xml',property:'startOverride'}};
 p.visibleNumber=unknown('Настройки списка извлечены; видимый номер и перезапуск счётчика не вычисляются');
 return {p,r,invalid:!lvl || !!ownStyle && styles(stylesXml).chain(ownStyle,new Set(),'numbering').invalid};
}
