export interface Source { part: string; property: string; styleId?: string; nodeId?: string }
export interface ResolvedProperty<T = string | number | boolean> {
  value: T | null; status: 'resolved' | 'unknown' | 'unsupported'; source: Source | null;
  unit?: string; raw?: string; reason?: string;
}
export type Properties = Record<string, ResolvedProperty>;
export interface Run { pageField: boolean; explicit: Properties; text: string; properties: Properties }
export interface Paragraph { explicit: Properties; pageField: boolean; id: string; location: string; text: string; role: 'body'|'heading'|'table'|'footer'|'note'|'list'; properties: Properties; runs: Run[] }
export interface Section { properties: Properties; footers: Record<string, string | null> }
export interface DocumentModel { objects: {location:string;properties:Properties;kind:string;caption?:string}[]; paragraphs: Paragraph[]; sections: Section[]; limitations: string[]; tables: number; images: number }
export const unknown = (reason = 'Свойство отсутствует или не разрешено'): ResolvedProperty => ({ value: null, status: 'unknown', source: null, reason });
