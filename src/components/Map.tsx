import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
// MapLibre 6 does its tile work in a separate module worker: bundle it with the app and tell MapLibre where it is.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import { fillExpression } from '../lib/colors';
import { levelForZoom, metricByKey, ZOOM_CONCELHO, ZOOM_FREGUESIA, type AreaProps, type Level, LEVEL_LABEL } from '../lib/metrics';

maplibregl.setWorkerUrl(mapWorkerUrl);

const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';
// Used when the basemap can't be reached (offline, or pages that block outside requests): the choropleth still works, without place names.
const FALLBACK_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#f2f1ed' } }] };
const LEVELS: Level[] = ['distrito', 'concelho', 'freguesia'];

interface Props {
  data: Record<Level, FeatureCollection>;
  metric: string;
  breaks: Record<Level, number[]>;
  selected: { level: Level; id: string } | null;
  flyTo: { level: Level; id: string; n: number } | null;
  onSelect: (s: { level: Level; id: string } | null) => void;
  onLevel: (l: Level) => void;
  /** Values of the areas on screen, for a colour scale fitted to the current view. */
  onVisible?: (level: Level, values: number[]) => void;
}

export default function Map({ data, metric, breaks, selected, flyTo, onSelect, onLevel, onVisible }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const latest = useRef({ onVisible, metric, breaks, onSelect, onLevel });
  latest.current = { onVisible, metric, breaks, onSelect, onLevel };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: BASEMAP,
      center: [-8.1, 39.6],
      zoom: 5.9,
      minZoom: 5,
      maxZoom: 14,
      maxBounds: [[-13, 35.8], [-3.5, 43.2]],
      attributionControl: { compact: true, customAttribution: 'Dados: <a href="https://www.ine.pt">INE</a> · Limites: CAOP, <a href="https://www.dgterritorio.gov.pt">DGT</a>' },
    });
    map.current = m;
    let fellBack = false;
    m.on('error', () => {
      if (!fellBack && !ready.current && !m.isStyleLoaded()) { fellBack = true; m.setStyle(FALLBACK_STYLE); }
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });

    m.on('load', () => {
      const firstSymbol = m.getStyle().layers.find(l => l.type === 'symbol')?.id;
      // Fade basemap fills so the choropleth reads clearly.
      for (const l of m.getStyle().layers) if (l.type === 'fill' && !l.id.startsWith('area-')) m.setPaintProperty(l.id, 'fill-opacity', 0.4);

      for (const level of LEVELS) {
        m.addSource(level, { type: 'geojson', data: data[level], promoteId: 'id' });
      }
      const { metric: k, breaks: b } = latest.current;
      m.addLayer({ id: 'area-distrito', type: 'fill', source: 'distrito', maxzoom: ZOOM_CONCELHO,
        paint: { 'fill-color': fillExpression(k, b.distrito) as never, 'fill-opacity': 0.82 } }, firstSymbol);
      m.addLayer({ id: 'area-concelho', type: 'fill', source: 'concelho', minzoom: ZOOM_CONCELHO,
        paint: { 'fill-color': fillExpression(k, b.concelho) as never,
          // Under the freguesias, concelhos stay faintly visible where freguesias have no data.
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], ZOOM_FREGUESIA - 0.3, 0.82, ZOOM_FREGUESIA, 0.3] } }, firstSymbol);
      m.addLayer({ id: 'area-freguesia', type: 'fill', source: 'freguesia', minzoom: ZOOM_FREGUESIA, filter: ['has', k],
        paint: { 'fill-color': fillExpression(k, b.freguesia) as never, 'fill-opacity': 0.85 } }, firstSymbol);

      m.addLayer({ id: 'line-freguesia', type: 'line', source: 'freguesia', minzoom: ZOOM_FREGUESIA,
        paint: { 'line-color': '#ffffff', 'line-width': 0.6, 'line-opacity': 0.9 } }, firstSymbol);
      m.addLayer({ id: 'line-concelho', type: 'line', source: 'concelho', minzoom: ZOOM_CONCELHO,
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 10, 1.6] } }, firstSymbol);
      m.addLayer({ id: 'line-distrito', type: 'line', source: 'distrito',
        paint: { 'line-color': '#52514e', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 2], 'line-opacity': 0.7 } }, firstSymbol);
      for (const level of LEVELS) {
        m.addLayer({ id: `hover-${level}`, type: 'line', source: level, filter: ['==', ['get', 'id'], ''],
          paint: { 'line-color': '#0b0b0b', 'line-width': 1.5 } });
        m.addLayer({ id: `selected-${level}`, type: 'line', source: level, filter: ['==', ['get', 'id'], ''],
          paint: { 'line-color': '#eb6834', 'line-width': 3 } });
      }
      ready.current = true;
      onLevel(levelForZoom(m.getZoom()));
      m.fire('moveend');
    });

    const hit = (e: MapLayerMouseEvent | maplibregl.MapMouseEvent) => {
      const level = levelForZoom(m.getZoom());
      const layers = level === 'freguesia' ? ['area-freguesia', 'area-concelho'] : [`area-${level}`];
      const f = m.queryRenderedFeatures(e.point, { layers })[0];
      if (!f) return null;
      return { level: f.layer.id.replace('area-', '') as Level, props: f.properties as AreaProps };
    };

    m.on('mousemove', e => {
      if (!ready.current) return;
      const h = hit(e);
      for (const level of LEVELS) m.setFilter(`hover-${level}`, ['==', ['get', 'id'], h && h.level === level ? h.props.id : '']);
      m.getCanvas().style.cursor = h ? 'pointer' : '';
      if (!h) { popup.remove(); return; }
      const { metric: k } = latest.current;
      const mt = metricByKey[k];
      const v = h.props[k];
      const note = h.level === 'concelho' && levelForZoom(m.getZoom()) === 'freguesia' ? '<div style="color:#8a8984">freguesia sem dados · valor do concelho</div>' : '';
      popup.setLngLat(e.lngLat).setHTML(
        `<div style="color:#52514e;font-size:11px">${LEVEL_LABEL[h.level]}</div><strong>${escape(h.props.name)}</strong>` +
        `<div>${typeof v === 'number' ? mt.format(v) : '<span style="color:#8a8984">sem dados</span>'}</div>${note}`,
      ).addTo(m);
    });
    m.on('mouseout', () => popup.remove());
    m.on('click', e => {
      const h = hit(e);
      latest.current.onSelect(h ? { level: h.level, id: h.props.id } : null);
    });
    m.on('zoomend', () => latest.current.onLevel(levelForZoom(m.getZoom())));
    m.on('moveend', () => {
      if (!ready.current || !latest.current.onVisible) return;
      const level = levelForZoom(m.getZoom());
      const k = latest.current.metric;
      const seen = new Set<string>();
      const values: number[] = [];
      for (const f of m.queryRenderedFeatures({ layers: [`area-${level}`] })) {
        const id = f.properties?.id as string;
        const v = f.properties?.[k];
        if (!seen.has(id) && typeof v === 'number') { seen.add(id); values.push(v); }
      }
      latest.current.onVisible(level, values);
    });

    return () => { popup.remove(); m.remove(); map.current = null; ready.current = false; };
  }, []);

  // Restyle on metric change.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const level of LEVELS) m.setPaintProperty(`area-${level}`, 'fill-color', fillExpression(metric, breaks[level]) as never);
    m.setFilter('area-freguesia', ['has', metric]);
  }, [metric, breaks]);

  // New values on the map (another indicator or filter): report what is on screen again.
  useEffect(() => {
    const m = map.current;
    if (m && ready.current) m.once('idle', () => m.fire('moveend'));
  }, [data, metric]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const level of LEVELS) m.setFilter(`selected-${level}`, ['==', ['get', 'id'], selected?.level === level ? selected.id : '']);
  }, [selected]);

  useEffect(() => {
    const m = map.current;
    if (!m || !flyTo) return;
    const f = data[flyTo.level].features.find(x => x.properties?.id === flyTo.id);
    if (!f) return;
    const bb = bbox(f.geometry);
    const minZoom = flyTo.level === 'distrito' ? 5 : flyTo.level === 'concelho' ? ZOOM_CONCELHO + 0.1 : ZOOM_FREGUESIA + 0.1;
    const cam = m.cameraForBounds(bb, { padding: 60 });
    if (cam) m.flyTo({ ...cam, zoom: Math.max(minZoom, Math.min(cam.zoom ?? minZoom, flyTo.level === 'distrito' ? ZOOM_CONCELHO - 0.1 : 13)) });
  }, [flyTo]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const level of LEVELS) (m.getSource(level) as GeoJSONSource | undefined)?.setData(data[level]);
  }, [data]);

  // maplibre-gl.css sets position: relative on the map element, so size it from a wrapper.
  return <div className="absolute inset-0"><div ref={el} style={{ width: "100%", height: "100%" }} /></div>;
}

function escape(s: string) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function bbox(g: GeoJSON.Geometry): [number, number, number, number] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [x, y] = c as number[];
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    } else (c as unknown[]).forEach(walk);
  };
  walk((g as GeoJSON.Polygon).coordinates);
  return [x0, y0, x1, y1];
}
