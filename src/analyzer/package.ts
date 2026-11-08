import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
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
  if (!document || document.documentElement.namespaceURI !== W) throw new Error('Это не DOCX: отсутствует поддерживаемый word/document.xml.');
  const relationships = async (part: string) => {
    const slash = part.lastIndexOf('/');
    const doc = await read(`${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`);
    const map = new Map<string, string>();
    if (doc) for (const n of Array.from(doc.getElementsByTagNameNS('*', 'Relationship'))) {
      if (n.getAttribute('TargetMode') === 'External') continue;
      const target = n.getAttribute('Target') ?? '';
      const parts: string[] = [];
      for (const p of (target.startsWith('/') ? target.slice(1) : part.slice(0, slash + 1) + target).split('/')) {
        if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p);
      }
      map.set(n.getAttribute('Id') ?? '', parts.join('/'));
    }
    return map;
  };
  return { zip, read, document, relationships };
}
export type Package = Awaited<ReturnType<typeof openPackage>>;
