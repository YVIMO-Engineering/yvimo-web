import React from 'react';
import { GoogleMapsConfigurationError, googleMapsMapId, loadGoogleMapsLibraries } from '../../lib/maps/googleMapsLoader';
import type { WorkCenterStatus } from '../../manufacturing/mesTypes';

type GoogleWorkCenterMapItem = {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  status: WorkCenterStatus;
  activeDowntime?: boolean;
};

type GoogleWorkCentersMapProps = {
  workCenters: GoogleWorkCenterMapItem[];
  selectedWorkCenterId: string;
  opacityMode?: boolean;
  onSelectWorkCenter: (workCenterId: string) => void;
};

const monterreyCenter = { lat: 25.6866, lng: -100.3161 };

function hasValidCoordinates(workCenter: GoogleWorkCenterMapItem) {
  return Number.isFinite(workCenter.latitude)
    && Number.isFinite(workCenter.longitude)
    && workCenter.latitude >= -90
    && workCenter.latitude <= 90
    && workCenter.longitude >= -180
    && workCenter.longitude <= 180;
}

function getMarkerStatus(status: WorkCenterStatus) {
  if (status === 'running' || status === 'idle' || status === 'down' || status === 'maintenance') return status;
  if (status === 'offline') return 'down';
  if (status === 'setup') return 'maintenance';
  return 'idle';
}

function createMarkerContent(workCenter: GoogleWorkCenterMapItem, index: number, selected: boolean) {
  const marker = document.createElement('button');
  marker.className = [
    'google-work-center-marker',
    `status-${getMarkerStatus(workCenter.status)}`,
    selected ? 'selected' : '',
    workCenter.activeDowntime ? 'alert' : '',
  ].filter(Boolean).join(' ');
  marker.type = 'button';
  marker.title = `${workCenter.name} / ${workCenter.code}`;

  const badge = document.createElement('span');
  badge.className = 'google-work-center-marker-badge';
  badge.textContent = String(index + 1);

  const label = document.createElement('strong');
  label.textContent = workCenter.name;

  const code = document.createElement('em');
  code.textContent = workCenter.code;

  marker.append(badge, label, code);
  return marker;
}

export function GoogleWorkCentersMap({
  workCenters,
  selectedWorkCenterId,
  opacityMode = false,
  onSelectWorkCenter,
}: GoogleWorkCentersMapProps) {
  const mapElementRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markerLibraryRef = React.useRef<google.maps.MarkerLibrary | null>(null);
  const markersRef = React.useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [mapStatus, setMapStatus] = React.useState<'ready' | 'missing-key' | 'configuration-error' | 'load-error'>('ready');

  const validWorkCenters = React.useMemo(() => workCenters.filter(hasValidCoordinates), [workCenters]);

  React.useEffect(() => {
    let cancelled = false;

    const initializeMap = async () => {
      if (!mapElementRef.current) return;

      try {
        const { maps, marker } = await loadGoogleMapsLibraries();
        if (cancelled || !mapElementRef.current) return;

        markerLibraryRef.current = marker;

        mapRef.current ??= new maps.Map(mapElementRef.current, {
          center: monterreyCenter,
          zoom: 11,
          mapId: googleMapsMapId,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });

        setMapStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setMapStatus(error instanceof GoogleMapsConfigurationError ? 'missing-key' : 'load-error');
      }
    };

    void initializeMap();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const markerLibrary = markerLibraryRef.current;
    if (!map || !markerLibrary || mapStatus !== 'ready') return;

    try {
      const mapCapabilities = map.getMapCapabilities?.();
      if (mapCapabilities && mapCapabilities.isAdvancedMarkersAvailable === false) {
        setMapStatus('configuration-error');
        return;
      }

      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];

      validWorkCenters.forEach((workCenter, index) => {
        const markerContent = createMarkerContent(workCenter, index, workCenter.id === selectedWorkCenterId);
        markerContent.addEventListener('click', () => onSelectWorkCenter(workCenter.id));

        const marker = new markerLibrary.AdvancedMarkerElement({
          map,
          position: { lat: workCenter.latitude, lng: workCenter.longitude },
          title: `${workCenter.name} / ${workCenter.code}`,
          content: markerContent,
        });

        markersRef.current.push(marker);
      });

      if (validWorkCenters.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        validWorkCenters.forEach((workCenter) => bounds.extend({ lat: workCenter.latitude, lng: workCenter.longitude }));
        map.fitBounds(bounds, 62);
      } else if (validWorkCenters.length === 1) {
        map.setCenter({ lat: validWorkCenters[0].latitude, lng: validWorkCenters[0].longitude });
        map.setZoom(14);
      } else {
        map.setCenter(monterreyCenter);
        map.setZoom(11);
      }
    } catch (error) {
      console.error('[maps] google work centers marker render error', error);
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];
      setMapStatus('load-error');
    }

    return () => {
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];
    };
  }, [mapStatus, onSelectWorkCenter, selectedWorkCenterId, validWorkCenters]);

  if (mapStatus === 'missing-key') {
    return <div className="google-work-center-map-fallback">Google Maps API key is missing.</div>;
  }

  if (mapStatus === 'configuration-error') {
    return <div className="google-work-center-map-fallback">Google Maps is blocked by the current API key configuration.</div>;
  }

  if (mapStatus === 'load-error') {
    return <div className="google-work-center-map-fallback">Unable to load Google Maps.</div>;
  }

  return (
    <div className={['google-work-center-map', opacityMode ? 'opacity-mode' : ''].filter(Boolean).join(' ')}>
      <div className="google-work-center-map-canvas" ref={mapElementRef} />
      {validWorkCenters.length === 0 ? (
        <div className="google-work-center-map-empty">No Work Centers with saved coordinates.</div>
      ) : null}
    </div>
  );
}
