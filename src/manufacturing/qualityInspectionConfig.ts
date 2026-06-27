import type { QualityPieceType } from './mesTypes';

export const qualityPieceTypeLabels: Record<QualityPieceType, string> = {
  hobs: 'Hobs',
  shaper: 'Shaper',
  shavers: 'Shavers',
  skiving: 'Skiving',
};

export const qualityInspectionsByPieceType: Record<QualityPieceType, string[]> = {
  hobs: ['Lead', 'Index', 'Rake', 'Runout'],
  shaper: ['Runout', 'Planicidad', 'Profile', 'Lead', 'Index'],
  shavers: [
    'Lead',
    'Index',
    'Profile',
    'Tooth Thickness',
    'Serration Condition',
    'Cutting Edge Condition',
    'Rake',
    'Rugosidad',
    'Runout',
    'Planicidad',
  ],
  skiving: ['Face Step', 'Face Rake', 'Rugosidad', 'Runout', 'Profile', 'Lead'],
};

export const qualityPieceTypes = Object.keys(qualityPieceTypeLabels) as QualityPieceType[];
