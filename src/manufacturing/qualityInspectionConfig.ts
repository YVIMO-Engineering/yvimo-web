import type { QualityPieceType } from './mesTypes';

export const qualityPieceTypeLabels: Record<QualityPieceType, string> = {
  hobs: 'Hobs',
  shaper: 'Shaper',
  shavers: 'Shavers',
  skiving: 'Skiving',
};

export const qualityInspectionsByPieceType: Record<QualityPieceType, string[]> = {
  hobs: ['Lead', 'Index', 'Rake', 'Runout'],
  shaper: ['Runout', 'Flatness', 'Profile', 'Lead', 'Index', 'Diameter', 'Height'],
  shavers: [
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
  skiving: ['Face Step', 'Face Rake', 'Roughness', 'Runout', 'Profile', 'Lead'],
};

export const qualityPieceTypes = Object.keys(qualityPieceTypeLabels) as QualityPieceType[];
