export interface Source { part: string; property: string; styleId?: string; nodeId?: string }
export interface ResolvedProperty<T = string | number | boolean> {
  value: T | null; status: 'resolved' | 'unknown' | 'unsupported'; source: Source | null;
  unit?: string; raw?: string; reason?: string;
}
export type Properties = Record<string, ResolvedProperty>;
export type PageReference =
 | {status:'confirmed';source:'compatible-layout';physical:number;printed?:{value:string;format:string};reason:string}
 | {status:'saved';source:'lastRenderedPageBreak';physical:number;printed?:{value:string;format:string};reason:string}
 | {status:'unknown';source:'none';reason:string};
export interface DocumentLocation {
 xmlPath?: string; part: string; area: 'body'|'table'|'header'|'footer'|'note'|'textbox'|'section'|'document';
 sectionUses?: {section:number;variant:string;kind:'header'|'footer'}[];
 storyId?: string; paragraphId?: string; paragraphNumber?: number;
 tablePath: {table:number;row:number;cell:number}[]; fragmentId?: string;
 range?: {start:number;end:number;unit:'utf16'}; section?: number; page: PageReference;
}
export interface Run { fontRanges: {start:number;end:number;property:ResolvedProperty}[]; id: string; at: DocumentLocation; pageField: boolean; explicit: Properties; text: string; properties: Properties }
export interface Paragraph { at: DocumentLocation; savedBreaks: number[]; fieldStatus:'resolved'|'unsupported'|'none'; explicit: Properties; pageField: boolean; id: string; location: string; text: string; role: 'body'|'heading'|'table'|'footer'|'header'|'note'|'list'|'caption'|'textbox'|'unknown'; properties: Properties; runs: Run[] }
export interface Section { properties: Properties; headers: Record<string, string | null>; footers: Record<string, string | null> }
export interface DocumentModel { objects: {at:DocumentLocation;location:string;properties:Properties;kind:string;caption?:string;captionParagraphId?:string}[]; paragraphs: Paragraph[]; sections: Section[]; unsupported: {at:DocumentLocation;reason:string}[]; limitations: string[]; tables: number; images: number }
export const unknown = (reason = 'Свойство отсутствует или не разрешено'): ResolvedProperty => ({ value: null, status: 'unknown', source: null, reason });
