import { loadGooglePlacesLibrary } from './googleMapsLoader';

export type GooglePlacesAddressMatch = {
  address: string;
  latitude: string;
  longitude: string;
  placeId?: string;
  placePrediction?: google.maps.places.PlacePrediction;
};

let autocompleteSessionToken: google.maps.places.AutocompleteSessionToken | null = null;

function makeAbortError() {
  return new DOMException('The address lookup was aborted.', 'AbortError');
}

function getMatchKey(match: GooglePlacesAddressMatch) {
  return match.placeId ?? `${match.latitude}:${match.longitude}:${match.address}`;
}

export function resetGooglePlacesAddressSession() {
  autocompleteSessionToken = null;
}

export async function searchGooglePlacesAddressMatches(query: string, limit = 5, signal?: AbortSignal): Promise<GooglePlacesAddressMatch[]> {
  const input = query.trim();
  if (!input) return [];
  if (signal?.aborted) throw makeAbortError();

  const places = await loadGooglePlacesLibrary();
  if (signal?.aborted) throw makeAbortError();
  if (!places.AutocompleteSuggestion || !places.AutocompleteSessionToken) {
    throw new Error('Google Places autocomplete is unavailable.');
  }

  autocompleteSessionToken ??= new places.AutocompleteSessionToken();

  const request: google.maps.places.AutocompleteRequest = {
    input,
    language: 'en',
    region: 'mx',
    sessionToken: autocompleteSessionToken,
  };

  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
  if (signal?.aborted) throw makeAbortError();

  const matches = (suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((placePrediction): placePrediction is google.maps.places.PlacePrediction => Boolean(placePrediction))
    .map((placePrediction) => ({
      address: placePrediction.text.toString(),
      latitude: '',
      longitude: '',
      placeId: placePrediction.placeId,
      placePrediction,
    }));

  return Array.from(new Map(matches.map((match) => [getMatchKey(match), match])).values()).slice(0, limit);
}

export async function resolveGooglePlacesAddressMatch(match: GooglePlacesAddressMatch, signal?: AbortSignal): Promise<GooglePlacesAddressMatch | null> {
  if (match.latitude && match.longitude) return match;
  if (!match.placePrediction) return null;
  if (signal?.aborted) throw makeAbortError();

  const place = match.placePrediction.toPlace();
  await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
  if (signal?.aborted) throw makeAbortError();

  const location = place.location;
  if (!location) return null;

  resetGooglePlacesAddressSession();

  return {
    address: place.formattedAddress ?? place.displayName ?? match.address,
    latitude: String(location.lat()),
    longitude: String(location.lng()),
    placeId: match.placeId,
  };
}
