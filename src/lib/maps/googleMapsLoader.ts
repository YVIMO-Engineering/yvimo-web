import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

const googleMapsBrowserApiKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY;
export const googleMapsMapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

let configured = false;
let mapsLibrariesPromise: Promise<{
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
}> | null = null;
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null;

export class GoogleMapsConfigurationError extends Error {
  constructor(message = 'Google Maps API key is missing.') {
    super(message);
    this.name = 'GoogleMapsConfigurationError';
  }
}

function configureGoogleMapsLoader() {
  if (configured) return;

  if (!googleMapsBrowserApiKey) {
    throw new GoogleMapsConfigurationError();
  }

  setOptions({
    key: googleMapsBrowserApiKey,
    v: 'weekly',
    libraries: ['maps', 'marker', 'places'],
    mapIds: [googleMapsMapId],
  });

  configured = true;
}

export function loadGoogleMapsLibraries() {
  configureGoogleMapsLoader();

  mapsLibrariesPromise ??= Promise.all([
    importLibrary('maps'),
    importLibrary('marker'),
  ]).then(([maps, marker]) => ({ maps, marker }));

  return mapsLibrariesPromise;
}

export function loadGooglePlacesLibrary() {
  configureGoogleMapsLoader();

  placesLibraryPromise ??= importLibrary('places') as Promise<google.maps.PlacesLibrary>;

  return placesLibraryPromise;
}
