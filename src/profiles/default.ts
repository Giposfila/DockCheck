import type { Requirements } from '../types';
// Inherited configurable profile; clauses have not been independently verified.
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
  requireContentsOverPages: 24,
  requiredSections: ['ВВЕДЕНИЕ', 'ЗАКЛЮЧЕНИЕ', 'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ'],
};

