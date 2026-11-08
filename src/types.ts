export type Severity = 'error' | 'warning';
export type Category = 'page' | 'text' | 'structure' | 'heading' | 'table' | 'figure' | 'references';

export interface Requirements {
  fontFamily: string;
  fontSizePt: number;
  allowedLineSpacing: number[];
  firstLineIndentMm: number;
  portraitMarginsMm: { top: number; right: number; bottom: number; left: number };
  requireA4: boolean;
  requireJustified: boolean;
  requirePageNumbers: boolean;
  requireContentsOverPages: number;
  requiredSections: string[];
}

export interface Finding {
  id: string;
  severity: Severity;
  category: Category;
  title: string;
  location: string;
  actual: string;
  expected: string;
  clause: string;
  excerpt?: string;
  source?: import("./analyzer/model").Source | null;
  recommendation?: string;
}

export interface ManualCheck {
  title: string;
  reason: string;
  clause: string;
}

export interface CheckReport {
  fileName?: string;
  results: CheckResult[];
  coverage: Record<CheckStatus, number>;
  document: import("./analyzer/model").DocumentModel;
  findings: Finding[];
  manualChecks: ManualCheck[];
  stats: {
    paragraphs: number;
    tables: number;
    images: number;
    sections: number;
    estimatedPages?: number;
  };
  checkedAt: string;
}

export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'not_applicable';
export interface CheckResult {
  ruleId: string; status: CheckStatus; severity: Severity; category: Category;
  location: string; title: string; actual: unknown; expected: unknown;
  source: import('./analyzer/model').Source | null; clause: string;
  explanation: string; recommendation: string;
}
