import { all, attr, child } from './package';
import { extract } from './extract';
import { overlay } from './properties';
import type { Properties } from './model';
export function styles(doc?: Document) {
 const map = new Map<string, {type?: string; base?: string; p: Properties; r: Properties}>();
 const defaults: Record<string,string> = {};
 const dd = doc && all(doc,'docDefaults')[0];
 if (doc) for (const s of all(doc,'style')) {
  const id = attr(s,'styleId'); if (!id) continue;
  const type = attr(s,'type') ?? 'paragraph';
  if (['1','true','on'].includes(attr(s,'default') ?? '')) defaults[type ?? ''] = id;
  map.set(id,{type,base:attr(child(s,'basedOn'),'val'),p:extract(child(s,'pPr'),'word/styles.xml',id),r:extract(child(s,'rPr'),'word/styles.xml',id)});
 }
 const chain = (id?: string, seen = new Set<string>(), expectedType?:string): {p: Properties;r: Properties; invalid: boolean} => {
  if (!id) return {p:{},r:{},invalid:false};
  if (seen.has(id) || !map.has(id)) return {p:{},r:{},invalid:true};
  seen.add(id); const s = map.get(id)!; const base = chain(s.base,seen,expectedType ?? s.type);
  if(expectedType && s.type!==expectedType) return {p:{},r:{},invalid:true};
  const r = overlay(base.r,s.r);
  for (const key of ['bold','italic']) if (s.r[key]) r[key] = {...s.r[key],value:s.r[key].value ? !base.r[key]?.value : base.r[key]?.value ?? false};
  return {p:overlay(base.p,s.p),r,invalid:base.invalid};
 };
 return {chain,defaults,p:extract(child(child(dd || undefined,'pPrDefault'),'pPr'),'word/styles.xml'),r:extract(child(child(dd || undefined,'rPrDefault'),'rPr'),'word/styles.xml')};
}
