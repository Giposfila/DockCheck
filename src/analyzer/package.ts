import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
const PACKAGE_REL='http://schemas.openxmlformats.org/package/2006/relationships';
const CT='http://schemas.openxmlformats.org/package/2006/content-types';
export const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const children = (n: Document | Element): Element[] => Array.from(n.childNodes).filter((x): x is Element => x.nodeType === 1);
export const all = (n: Document | Element, name: string): Element[] => Array.from(n.getElementsByTagNameNS(W, name));
export const child = (n: Element | undefined, name: string) => n && children(n).find(x => x.namespaceURI === W && x.localName === name);
export const attr = (n: Element | undefined, name: string) => n?.hasAttributeNS(W, name) ? (n.getAttributeNS(W, name) ?? undefined) : undefined;
export function parse(xml: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({ errorHandler: { warning: x => errors.push(x), error: x => errors.push(x), fatalError: x => errors.push(x) } }).parseFromString(xml, 'application/xml');
  if (errors.length || !doc.documentElement) throw new Error('Внутренний XML документа повреждён.');
  return doc;
}
export async function openPackage(data: ArrayBuffer | Uint8Array) {
  const zip = await JSZip.loadAsync(data);
  const read = async (path: string) => { const f = zip.file(path); return f ? parse(await f.async('text')) : undefined; };
  const document = await read('word/document.xml');
  if (!document || (document.documentElement.namespaceURI !== W || document.documentElement.localName!=='document')) throw new Error('Это не DOCX: отсутствует поддерживаемый word/document.xml.');
  const relations = async (part: string) => {
    const slash = part.lastIndexOf('/');
    const doc = await read(part ? `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels` : '_rels/.rels');
    const map = new Map<string, {target:string;type:string}>();
    if(doc && (doc.documentElement.namespaceURI!==PACKAGE_REL || doc.documentElement.localName!=='Relationships'))throw new Error('Некорректное пространство имён relationships OPC.');
    if (doc) for (const n of Array.from(doc.getElementsByTagNameNS(PACKAGE_REL, 'Relationship'))) {
      if (n.getAttribute('TargetMode') === 'External') continue;
      const target = n.getAttribute('Target') ?? '';
      if(!target || !n.getAttribute('Id') || !n.getAttribute('Type') || map.has(n.getAttribute('Id')!)) throw new Error('Некорректная связь OPC.');
      const parts: string[] = [];
      for (const p of (target.startsWith('/') ? target.slice(1) : part.slice(0, slash + 1) + target).split('/')) {
        if (p === '..') {if(!parts.length)throw new Error('Связь OPC выходит за пределы пакета.');parts.pop();} else if (p && p !== '.') parts.push(p);
      }
      map.set(n.getAttribute('Id') ?? '', {target:parts.join('/'),type:n.getAttribute('Type') ?? ''});
    }
    return map;
  };
  const relationships=async(part:string)=>new Map([...(await relations(part))].map(([id,r])=>[id,r.target]));
  const contentTypes=await read('[Content_Types].xml');
  if(!contentTypes || (contentTypes.documentElement.namespaceURI!==CT || contentTypes.documentElement.localName!=='Types')) throw new Error('DOCX: отсутствуют корректные Content Types OPC.');
  const declaredType=(part:string)=>{
   const nodes=Array.from(contentTypes.getElementsByTagNameNS(CT,'Override'));
   const override=nodes.find(n=>n.getAttribute('PartName')==='/'+part)?.getAttribute('ContentType');
   return override ?? Array.from(contentTypes.getElementsByTagNameNS(CT,'Default')).find(n=>n.getAttribute('Extension')===part.split('.').at(-1))?.getAttribute('ContentType');
  };
  const roots=await relations('');
  if(![...roots.values()].some(r=>r.type===REL+'officeDocument'&&r.target==='word/document.xml')) throw new Error('DOCX: связь officeDocument не указывает на поддерживаемую основную часть.');
  const expected:Record<string,string>={officeDocument:'document.main',styles:'styles',numbering:'numbering',settings:'settings',header:'header',footer:'footer',footnotes:'footnotes',endnotes:'endnotes'};
  for(const relation of [{target:'word/document.xml',type:REL+'officeDocument'},...[...(await relations('word/document.xml')).values()]]) {
   if(!relation.type.startsWith(REL)) continue;
   const kind=relation.type.slice(REL.length);
   const type=kind==='theme'?'application/vnd.openxmlformats-officedocument.theme+xml':expected[kind]?`application/vnd.openxmlformats-officedocument.wordprocessingml.${expected[kind]}+xml`:undefined;
   if(type && zip.file(relation.target) && declaredType(relation.target)!==type) throw new Error(`DOCX: неверный Content Type части ${relation.target}.`);
   if(type && zip.file(relation.target)) {
    const xml=await read(relation.target),expectedRoot=({officeDocument:'document',styles:'styles',numbering:'numbering',settings:'settings',header:'hdr',footer:'ftr',footnotes:'footnotes',endnotes:'endnotes',theme:'theme'} as Record<string,string>)[kind];
    const ns=kind==='theme'?'http://schemas.openxmlformats.org/drawingml/2006/main':W;
    if(xml?.documentElement.localName!==expectedRoot || xml?.documentElement.namespaceURI!==ns)throw new Error(`DOCX: корень части ${relation.target} не соответствует типу relationships.`);
   }
  }
  return { zip, read, document, relationships, relations };
}
export type Package = Awaited<ReturnType<typeof openPackage>>;
