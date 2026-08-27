export const coatingProviders = ['Balzers', 'Voestalpine'] as const;

export type CoatingProvider = (typeof coatingProviders)[number];

export const coatingProviderOptions = coatingProviders.map((provider) => ({
  value: provider,
  label: provider,
}));
