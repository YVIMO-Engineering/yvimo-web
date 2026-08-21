import React from 'react';
import { GoogleMapsConfigurationError, googleMapsMapId, loadGoogleMapsLibraries } from '../../lib/maps/googleMapsLoader';
import type { WorkCenterStatus } from '../../manufacturing/mesTypes';

type GoogleWorkCenterMapItem = {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  stationCount?: number;
  status: WorkCenterStatus;
  activeDowntime?: boolean;
};

type GoogleWorkCentersMapProps = {
  workCenters: GoogleWorkCenterMapItem[];
  selectedWorkCenterId: string;
  expanded?: boolean;
  opacityMode?: boolean;
  onSelectWorkCenter: (workCenterId: string) => void;
};

const monterreyCenter = { lat: 25.6866, lng: -100.3161 };
const compactMarkerLabelSize = { cardHeight: 54, height: 54, width: 178 };
const expandedMarkerLabelSize = { cardHeight: 58, height: 94, width: 260 };

function getMarkerLabelCandidates(labelSize: typeof compactMarkerLabelSize) {
  return [18, 44, 72, 104, 138, 176, 218, 266, 318].flatMap((distance) => [
  { labelX: distance, labelY: -(labelSize.height / 2) },
  { labelX: -labelSize.width - distance, labelY: -(labelSize.height / 2) },
  { labelX: -(labelSize.width / 2), labelY: distance },
  { labelX: -(labelSize.width / 2), labelY: -labelSize.height - distance },
  { labelX: distance, labelY: distance },
  { labelX: -labelSize.width - distance, labelY: distance },
  { labelX: distance, labelY: -labelSize.height - distance },
  { labelX: -labelSize.width - distance, labelY: -labelSize.height - distance },
]).concat(
  [-176, -104, -32, 40, 112, 184].flatMap((labelY) => [
    { labelX: -labelSize.width - 22, labelY },
    { labelX: 22, labelY },
  ]),
  [-228, -146, -64, 18, 100, 182].flatMap((labelX) => [
    { labelX, labelY: -labelSize.height - 22 },
    { labelX, labelY: 22 },
  ]),
);
}

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

type MarkerLayout = {
  labelX: number;
  labelY: number;
  connectorEndX: number;
  connectorEndY: number;
};

function labelsOverlap(
  first: { left: number; top: number; right: number; bottom: number },
  second: { left: number; top: number; right: number; bottom: number },
) {
  const gap = 8;
  return !(
    first.right + gap < second.left
    || second.right + gap < first.left
    || first.bottom + gap < second.top
    || second.bottom + gap < first.top
  );
}

function pointInsideBox(
  point: { x: number; y: number },
  box: { left: number; top: number; right: number; bottom: number },
  padding = 0,
) {
  return point.x >= box.left - padding
    && point.x <= box.right + padding
    && point.y >= box.top - padding
    && point.y <= box.bottom + padding;
}

function orientation(first: { x: number; y: number }, second: { x: number; y: number }, third: { x: number; y: number }) {
  const value = ((second.y - first.y) * (third.x - second.x)) - ((second.x - first.x) * (third.y - second.y));
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(first: { x: number; y: number }, point: { x: number; y: number }, second: { x: number; y: number }) {
  return point.x <= Math.max(first.x, second.x)
    && point.x >= Math.min(first.x, second.x)
    && point.y <= Math.max(first.y, second.y)
    && point.y >= Math.min(first.y, second.y);
}

function lineSegmentsIntersect(
  firstStart: { x: number; y: number },
  firstEnd: { x: number; y: number },
  secondStart: { x: number; y: number },
  secondEnd: { x: number; y: number },
) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) return true;
  if (firstOrientation === 0 && pointOnSegment(firstStart, secondStart, firstEnd)) return true;
  if (secondOrientation === 0 && pointOnSegment(firstStart, secondEnd, firstEnd)) return true;
  if (thirdOrientation === 0 && pointOnSegment(secondStart, firstStart, secondEnd)) return true;
  if (fourthOrientation === 0 && pointOnSegment(secondStart, firstEnd, secondEnd)) return true;

  return false;
}

function lineIntersectsBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
  box: { left: number; top: number; right: number; bottom: number },
  padding = 0,
) {
  const paddedBox = {
    left: box.left - padding,
    top: box.top - padding,
    right: box.right + padding,
    bottom: box.bottom + padding,
  };

  if (pointInsideBox(start, paddedBox) || pointInsideBox(end, paddedBox)) return true;

  return [
    [{ x: paddedBox.left, y: paddedBox.top }, { x: paddedBox.right, y: paddedBox.top }],
    [{ x: paddedBox.right, y: paddedBox.top }, { x: paddedBox.right, y: paddedBox.bottom }],
    [{ x: paddedBox.right, y: paddedBox.bottom }, { x: paddedBox.left, y: paddedBox.bottom }],
    [{ x: paddedBox.left, y: paddedBox.bottom }, { x: paddedBox.left, y: paddedBox.top }],
  ].some(([edgeStart, edgeEnd]) => lineSegmentsIntersect(start, end, edgeStart, edgeEnd));
}

function getPixelPoint(map: google.maps.Map, workCenter: GoogleWorkCenterMapItem) {
  const projection = map.getProjection();
  const zoom = map.getZoom();
  if (!projection || typeof zoom !== 'number') return null;

  const point = projection.fromLatLngToPoint(new google.maps.LatLng(workCenter.latitude, workCenter.longitude));
  if (!point) return null;

  const scale = 2 ** zoom;
  return {
    x: point.x * scale,
    y: point.y * scale,
  };
}

function getConnectorEnd(layout: Pick<MarkerLayout, 'labelX' | 'labelY'>, labelSize: typeof compactMarkerLabelSize) {
  const left = layout.labelX;
  const top = layout.labelY;
  const right = layout.labelX + labelSize.width;
  const bottom = layout.labelY + labelSize.height;
  const x = Math.min(right, Math.max(left, 0));
  const y = Math.min(bottom, Math.max(top, 0));

  if (x === 0 && y === 0) {
    const distances = [
      { x: left + (labelSize.width / 2), y: top, distance: Math.abs(top) },
      { x: left + (labelSize.width / 2), y: bottom, distance: Math.abs(bottom) },
      { x: left, y: top + (labelSize.height / 2), distance: Math.abs(left) },
      { x: right, y: top + (labelSize.height / 2), distance: Math.abs(right) },
    ].sort((first, second) => first.distance - second.distance);
    return {
      connectorEndX: distances[0].x * 0.92,
      connectorEndY: distances[0].y * 0.92,
    };
  }

  return { connectorEndX: x * 0.92, connectorEndY: y * 0.92 };
}

function withConnectorEnd(layout: Pick<MarkerLayout, 'labelX' | 'labelY'>, labelSize: typeof compactMarkerLabelSize): MarkerLayout {
  return {
    ...layout,
    ...getConnectorEnd(layout, labelSize),
  };
}

function getMarkerLayouts(map: google.maps.Map, workCenters: GoogleWorkCenterMapItem[], labelSize: typeof compactMarkerLabelSize) {
  const markerLabelCandidates = getMarkerLabelCandidates(labelSize);
  const placedLabels: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const placedConnectors: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> = [];
  const placedAnchors: Array<{ x: number; y: number }> = [];
  const layouts = new Map<string, MarkerLayout>();
  const projection = map.getProjection();
  const zoom = map.getZoom();
  const center = map.getCenter();
  const mapElement = map.getDiv();
  const viewport = projection && typeof zoom === 'number' && center && mapElement
    ? (() => {
      const centerPoint = projection.fromLatLngToPoint(center);
      if (!centerPoint) return null;
      const scale = 2 ** zoom;
      const centerPixel = { x: centerPoint.x * scale, y: centerPoint.y * scale };
      const width = mapElement.clientWidth;
      const height = mapElement.clientHeight;

      return {
        left: centerPixel.x - (width / 2) + 10,
        top: centerPixel.y - (height / 2) + 10,
        right: centerPixel.x + (width / 2) - 10,
        bottom: centerPixel.y + (height / 2) - 24,
      };
    })()
    : null;
  const points = workCenters.map((workCenter, index) => ({
    index,
    point: getPixelPoint(map, workCenter),
    workCenter,
  })).sort((first, second) => {
    if (!first.point || !second.point) return first.index - second.index;
    return first.point.y - second.point.y || first.point.x - second.point.x;
  });
  const allAnchors = points
    .map(({ point }) => point)
    .filter((point): point is { x: number; y: number } => Boolean(point));

  points.forEach(({ index, point, workCenter }) => {
    if (!point) {
      layouts.set(workCenter.id, withConnectorEnd(markerLabelCandidates[index % markerLabelCandidates.length], labelSize));
      return;
    }

    const getLabelBox = (option: MarkerLayout) => ({
      left: point.x + option.labelX,
      top: point.y + option.labelY,
      right: point.x + option.labelX + labelSize.width,
      bottom: point.y + option.labelY + labelSize.height,
    });
    const fitsViewport = (labelBox: ReturnType<typeof getLabelBox>) => !viewport || (
      labelBox.left >= viewport.left
      && labelBox.top >= viewport.top
      && labelBox.right <= viewport.right
      && labelBox.bottom <= viewport.bottom
    );
    const overlapArea = (
      first: ReturnType<typeof getLabelBox>,
      second: { left: number; top: number; right: number; bottom: number },
    ) => {
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      return width * height;
    };
    const collisionScore = (labelBox: ReturnType<typeof getLabelBox>) => placedLabels
      .reduce((score, placedLabel) => score + overlapArea(labelBox, placedLabel), 0);
    const viewportOverflowScore = (labelBox: ReturnType<typeof getLabelBox>) => {
      if (!viewport) return 0;
      return Math.max(0, viewport.left - labelBox.left)
        + Math.max(0, labelBox.right - viewport.right)
        + Math.max(0, viewport.top - labelBox.top)
        + Math.max(0, labelBox.bottom - viewport.bottom);
    };
    const labelAnchorConflictCount = (labelBox: ReturnType<typeof getLabelBox>) => allAnchors
      .filter((anchor) => pointInsideBox(anchor, labelBox, 18))
      .length;
    const getConnector = (option: Pick<MarkerLayout, 'labelX' | 'labelY'>) => {
      const connectorEnd = getConnectorEnd(option, labelSize);
      return {
        start: point,
        end: {
          x: point.x + connectorEnd.connectorEndX,
          y: point.y + connectorEnd.connectorEndY,
        },
      };
    };
    const connectorConflictScore = (option: Pick<MarkerLayout, 'labelX' | 'labelY'>, labelBox: ReturnType<typeof getLabelBox>) => {
      const connector = getConnector(option);
      const labelAnchorConflicts = labelAnchorConflictCount(labelBox);
      const connectorThroughLabelConflicts = placedLabels.filter((placedLabel) => lineIntersectsBox(connector.start, connector.end, placedLabel, 8)).length;
      const existingConnectorThroughLabelConflicts = placedConnectors.filter((placedConnector) => lineIntersectsBox(placedConnector.start, placedConnector.end, labelBox, 8)).length;
      const connectorCrossConflicts = placedConnectors.filter((placedConnector) => lineSegmentsIntersect(connector.start, connector.end, placedConnector.start, placedConnector.end)).length;
      const anchorNearConnectorConflicts = placedAnchors.filter((anchor) => lineIntersectsBox(connector.start, connector.end, {
        left: anchor.x - 10,
        top: anchor.y - 10,
        right: anchor.x + 10,
        bottom: anchor.y + 10,
      })).length;

      return (labelAnchorConflicts * 90000)
        + (connectorThroughLabelConflicts * 70000)
        + (existingConnectorThroughLabelConflicts * 70000)
        + (anchorNearConnectorConflicts * 50000)
        + (connectorCrossConflicts * 8000);
    };
    const candidate = markerLabelCandidates.find((option) => {
      const labelBox = getLabelBox(option);

      return fitsViewport(labelBox)
        && labelAnchorConflictCount(labelBox) === 0
        && connectorConflictScore(option, labelBox) === 0
        && placedLabels.every((placedLabel) => !labelsOverlap(labelBox, placedLabel));
    }) ?? [...markerLabelCandidates]
      .sort((first, second) => {
        const firstBox = getLabelBox(first);
        const secondBox = getLabelBox(second);
        const firstScore = collisionScore(firstBox)
          + (viewportOverflowScore(firstBox) * 28)
          + (labelAnchorConflictCount(firstBox) * 250000)
          + connectorConflictScore(first, firstBox)
          + Math.hypot(first.labelX, first.labelY);
        const secondScore = collisionScore(secondBox)
          + (viewportOverflowScore(secondBox) * 28)
          + (labelAnchorConflictCount(secondBox) * 250000)
          + connectorConflictScore(second, secondBox)
          + Math.hypot(second.labelX, second.labelY);

        return firstScore - secondScore;
      })[0] ?? markerLabelCandidates[index % markerLabelCandidates.length];

    placedLabels.push({
      left: point.x + candidate.labelX,
      top: point.y + candidate.labelY,
      right: point.x + candidate.labelX + labelSize.width,
      bottom: point.y + candidate.labelY + labelSize.height,
    });
    placedConnectors.push(getConnector(candidate));
    placedAnchors.push(point);
    layouts.set(workCenter.id, withConnectorEnd(candidate, labelSize));
  });

  return layouts;
}

function applyMarkerLayoutStyles(marker: HTMLElement, layout: MarkerLayout, labelSize: typeof compactMarkerLabelSize) {
  marker.style.setProperty('--label-x', `${layout.labelX}px`);
  marker.style.setProperty('--label-y', `${layout.labelY}px`);
  marker.style.setProperty('--label-width', `${labelSize.width}px`);
  marker.style.setProperty('--label-height', `${labelSize.height}px`);
  marker.style.setProperty('--label-card-height', `${labelSize.cardHeight}px`);
  marker.style.setProperty('--line-length', `${Math.hypot(layout.connectorEndX, layout.connectorEndY)}px`);
  marker.style.setProperty('--line-angle', `${Math.atan2(layout.connectorEndY, layout.connectorEndX)}rad`);
  marker.style.setProperty('--line-end-x', `${layout.connectorEndX}px`);
  marker.style.setProperty('--line-end-y', `${layout.connectorEndY}px`);
}

function getMarkerClassName(workCenter: GoogleWorkCenterMapItem, selected: boolean, layer: 'connector' | 'label') {
  return [
    'google-work-center-marker',
    `google-work-center-marker-${layer}-layer`,
    `status-${getMarkerStatus(workCenter.status)}`,
    selected ? 'selected' : '',
    workCenter.activeDowntime ? 'alert' : '',
  ].filter(Boolean).join(' ');
}

function createConnectorMarkerContent(workCenter: GoogleWorkCenterMapItem, selected: boolean, layout: MarkerLayout, labelSize: typeof compactMarkerLabelSize) {
  const marker = document.createElement('button');
  marker.className = getMarkerClassName(workCenter, selected, 'connector');
  marker.type = 'button';
  marker.title = `${workCenter.name} / ${workCenter.code}`;
  applyMarkerLayoutStyles(marker, layout, labelSize);

  const anchor = document.createElement('span');
  anchor.className = 'google-work-center-marker-anchor';

  const connector = document.createElement('span');
  connector.className = 'google-work-center-marker-connector';

  const connectorEnd = document.createElement('span');
  connectorEnd.className = 'google-work-center-marker-connector-end';

  marker.append(connector, connectorEnd, anchor);
  return marker;
}

function createLabelMarkerContent(workCenter: GoogleWorkCenterMapItem, index: number, selected: boolean, layout: MarkerLayout, labelSize: typeof compactMarkerLabelSize, expanded: boolean) {
  const marker = document.createElement('button');
  marker.className = getMarkerClassName(workCenter, selected, 'label');
  marker.type = 'button';
  marker.title = `${workCenter.name} / ${workCenter.code}`;
  applyMarkerLayoutStyles(marker, layout, labelSize);

  const card = document.createElement('span');
  card.className = 'google-work-center-marker-card';

  const badge = document.createElement('span');
  badge.className = 'google-work-center-marker-badge';
  badge.textContent = String(index + 1);

  const label = document.createElement('strong');
  label.textContent = workCenter.name;

  const code = document.createElement('em');
  code.textContent = workCenter.code;

  card.append(badge, label, code);
  marker.append(card);

  if (expanded) {
    const stationSummary = document.createElement('span');
    stationSummary.className = 'google-work-center-marker-stations';
    stationSummary.textContent = `${workCenter.stationCount ?? 0} stations`;
    marker.append(stationSummary);
  }

  return marker;
}

export function GoogleWorkCentersMap({
  workCenters,
  selectedWorkCenterId,
  expanded = false,
  opacityMode = false,
  onSelectWorkCenter,
}: GoogleWorkCentersMapProps) {
  const mapElementRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markerLibraryRef = React.useRef<google.maps.MarkerLibrary | null>(null);
  const markersRef = React.useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const onSelectWorkCenterRef = React.useRef(onSelectWorkCenter);
  const [mapViewVersion, setMapViewVersion] = React.useState(0);
  const [mapStatus, setMapStatus] = React.useState<'ready' | 'missing-key' | 'configuration-error' | 'load-error'>('ready');

  onSelectWorkCenterRef.current = onSelectWorkCenter;
  const workCentersSignature = workCenters.map((workCenter) => [
    workCenter.id,
    workCenter.code,
    workCenter.name,
    workCenter.latitude,
    workCenter.longitude,
    workCenter.stationCount ?? 0,
    workCenter.status,
    workCenter.activeDowntime ? 1 : 0,
  ].join(':')).join('|');
  const validWorkCenters = React.useMemo(
    () => workCenters.filter(hasValidCoordinates),
    // The signature deliberately prevents the one-second workspace clock from rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workCentersSignature],
  );
  const markerLabelSize = expanded ? expandedMarkerLabelSize : compactMarkerLabelSize;

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
    if (!map || mapStatus !== 'ready') return undefined;

    const idleListener = map.addListener('idle', () => {
      setMapViewVersion((current) => current + 1);
    });
    const projectionListener = map.addListener('projection_changed', () => {
      setMapViewVersion((current) => current + 1);
    });

    return () => {
      idleListener.remove();
      projectionListener.remove();
    };
  }, [mapStatus]);

  React.useEffect(() => {
    if (mapStatus !== 'ready') return undefined;
    const frame = window.requestAnimationFrame(() => {
      setMapViewVersion((current) => current + 1);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [expanded, mapStatus]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== 'ready') return;

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
  }, [expanded, mapStatus, validWorkCenters]);

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

      const markerLayouts = getMarkerLayouts(map, validWorkCenters, markerLabelSize);

      validWorkCenters.forEach((workCenter, index) => {
        const markerLabelCandidates = getMarkerLabelCandidates(markerLabelSize);
        const layout = markerLayouts.get(workCenter.id) ?? withConnectorEnd(markerLabelCandidates[index % markerLabelCandidates.length], markerLabelSize);
        const connectorMarkerContent = createConnectorMarkerContent(
          workCenter,
          workCenter.id === selectedWorkCenterId,
          layout,
          markerLabelSize,
        );
        const labelMarkerContent = createLabelMarkerContent(
          workCenter,
          index,
          workCenter.id === selectedWorkCenterId,
          layout,
          markerLabelSize,
          expanded,
        );
        connectorMarkerContent.addEventListener('click', () => onSelectWorkCenterRef.current(workCenter.id));
        labelMarkerContent.addEventListener('click', () => onSelectWorkCenterRef.current(workCenter.id));

        const connectorMarker = new markerLibrary.AdvancedMarkerElement({
          map,
          position: { lat: workCenter.latitude, lng: workCenter.longitude },
          title: `${workCenter.name} / ${workCenter.code}`,
          content: connectorMarkerContent,
          anchorLeft: '0px',
          anchorTop: '0px',
          zIndex: 10 + index,
        });
        const labelMarker = new markerLibrary.AdvancedMarkerElement({
          map,
          position: { lat: workCenter.latitude, lng: workCenter.longitude },
          title: `${workCenter.name} / ${workCenter.code}`,
          content: labelMarkerContent,
          anchorLeft: '0px',
          anchorTop: '0px',
          zIndex: (workCenter.id === selectedWorkCenterId ? 3000 : 1000) + index,
        });

        markersRef.current.push(connectorMarker, labelMarker);
      });
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
  }, [mapStatus, mapViewVersion, markerLabelSize, selectedWorkCenterId, validWorkCenters]);

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
    <div className={['google-work-center-map', expanded ? 'expanded' : '', opacityMode ? 'opacity-mode' : ''].filter(Boolean).join(' ')}>
      <div className="google-work-center-map-canvas" ref={mapElementRef} />
      {validWorkCenters.length === 0 ? (
        <div className="google-work-center-map-empty">No Work Centers with saved coordinates.</div>
      ) : null}
    </div>
  );
}
