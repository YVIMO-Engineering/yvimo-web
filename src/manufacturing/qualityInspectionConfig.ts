import type { QualityPieceType } from './mesTypes';

export const qualityReportOnlyInspection = 'Just report';

export const qualityPieceTypeLabels: Record<QualityPieceType, string> = {
  hobs: 'Hobs',
  shaper: 'Shaper',
  shavers: 'Shavers',
  skiving: 'Skiving',
};

export const qualityInspectionsByPieceType: Record<QualityPieceType, string[]> = {
  hobs: [qualityReportOnlyInspection, 'Lead', 'Index', 'Rake', 'Runout'],
  shaper: [qualityReportOnlyInspection, 'Runout', 'Flatness', 'Profile', 'Lead', 'Index', 'Diameter', 'Height'],
  shavers: [
    qualityReportOnlyInspection,
    'Lead',
    'Index',
    'Profile',
    'Tooth Thickness',
    'Serration Condition',
    'Cutting Edge Condition',
    'Rake',
    'Roughness',
    'Runout',
    'Flatness',
  ],
  skiving: [qualityReportOnlyInspection, 'Face Step', 'Face Rake', 'Roughness', 'Runout', 'Profile', 'Lead'],
};

export const qualityPieceTypes = Object.keys(qualityPieceTypeLabels) as QualityPieceType[];
