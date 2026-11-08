import type { Requirements } from '../types';
// Compatibility defaults; immutable normative rules are in requirements/catalog.ts.
export const DEFAULT_REQUIREMENTS: Requirements = {
  textRoles: ['body'],
  fontFamily: 'Times New Roman',
  fontSizePt: 14,
  allowedLineSpacing: [1, 1.5],
  firstLineIndentMm: 12.5,
  portraitMarginsMm: { top: 20, right: 10, bottom: 20, left: 30 },
  requireA4: true,
  requireJustified: true,
  requirePageNumbers: true,
  requiredSections: [],
  landscapeMarginsMm: {top:30,bottom:10,left:20,right:20},
};

