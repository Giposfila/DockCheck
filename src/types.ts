export type Severity = 'error' | 'warning';
export type Category = 'page' | 'text' | 'structure' | 'heading' | 'table' | 'figure' | 'references';

export interface Requirements {
  textRoles?: import("./analyzer/model").Paragraph["role"][];
  fontFamily: string;
  fontSizePt: number;
  allowedLineSpacing: number[];
  firstLineIndentMm: number;
  landscapeMarginsMm?: { top: number; right: number; bottom: number; left: number };
  portraitMarginsMm: { top: number; right: number; bottom: number; left: number };
  requireA4: boolean;
  requireJustified: boolean;
  requirePageNumbers: boolean;
  requiredSections: string[];
}

export interface Finding {
  normSource?: import("./requirements/schema").NormSource;
  modality?: import("./requirements/schema").Modality;
  origin?: CheckResult["origin"];
  reasonCode?: CheckResult["reasonCode"];
  evidence?: CheckResult["evidence"];
  id: string;
  severity: Severity;
  category: Category;
  title: string;
  location: string;
  actual: string;
  expected: string;
  clause: string;
  excerpt?: string;
  at?: import("./analyzer/model").DocumentLocation;
  paragraphText?: string;
  explanation?: string;
  unit?: string;
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
  profile?: import("./requirements/profile").WorkProfile;
  profileConflicts?: string[];
  stale?: boolean;
  catalogCoverage?: {total:number;implemented:number;unknown:number;notApplicable:number};
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
  scope?: string; tolerance?: number; property?: string;
  normSource?: import("./requirements/schema").NormSource;
  profileVersion?: string; modality?: import("./requirements/schema").Modality;
  origin?: "standard"|"local"|"analysis";
  applicability?: import("./requirements/schema").Truth;
  reasonCode?: "unknown_context"|"ambiguous_role"|"missing_fact"|"unsupported"|"needs_layout"|"external_standard"|"external_artifact"|"unimplemented";
  evidence?: {kind:string;detail:string;source?:import("./analyzer/model").Source|null}[];
  at?: import("./analyzer/model").DocumentLocation; paragraphText?: string; unit?: string;
  ruleId: string; status: CheckStatus; severity: Severity; category: Category;
  location: string; title: string; actual: unknown; expected: unknown;
  source: import('./analyzer/model').Source | null; clause: string;
  explanation: string; recommendation: string;
}
