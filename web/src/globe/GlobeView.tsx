import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '../data/store';
import { buildRoleArcs, type LabelSpec, type RoleArcs } from './arcs';
import { COLORS } from './colors';
import { loadCountryShapes } from './countries';
import { DebugHud, type Readout } from './DebugHud';
import { gameTarget, placeTarget, type Target } from './flight';
import { FrameStats } from './frameStats';
import { layoutCompanies } from './layout';
import { MarkersLayer } from './markersLayer';
import { PointsLayer, type PickedPoint } from './pointsLayer';

declare global {
  interface Window {
    __overworld?: {
      fps(): number;
      frameTimes(): number[];
      level(): string;
      pointCount(): number;
      setYear(y: number): void;
      playYears(msPerYear: number): Promise<void>;
    };
  }
}

const EMPTY_ARCS: RoleArcs = { arcs: [], markers: [], labels: [] };
const FLY_MS = 1200;
const CLICK_SLOP_PX = 5;

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function makeCountryNamer(): (code: string) => string {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = null;
  }
  return (code) => {
    try {
      return names?.of(code) ?? code;
    } catch {
      return code;
    }
  };
}

function labelElement(d: object): HTMLElement {
  const l = d as LabelSpec;
  const el = document.createElement('div');
  el.textContent = l.name;
  el.style.cssText = [
    `color:${l.color}`,
    'font:600 11px system-ui,sans-serif',
    'white-space:nowrap',
    'pointer-events:none',
    'transform:translate(10px,-50%)',
    'text-shadow:0 0 3px #07090d,0 0 6px #07090d',
  ].join(';');
  return el;
}

const tooltipStyle = {
  position: 'absolute',
  left: 0,
  top: 0,
  display: 'none',
  pointerEvents: 'none',
  padding: '4px 8px',
  background: 'rgba(7, 9, 13, 0.92)',
  border: '1px solid #2b3a4f',
  borderRadius: 4,
  color: '#e6e9ef',
  font: '12px system-ui, sans-serif',
  whiteSpace: 'nowrap',
  zIndex: 10,
} as const;

export function GlobeView() {
  const indexes = useStore((s) => s.indexes);
  const timeline = useStore((s) => s.timeline);
  const detail = useStore((s) => s.selectedGameDetail);
  const enabledRoles = useStore((s) => s.enabledRoles);
  const { w, h } = useWindowSize();

  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<PointsLayer | null>(null);
  const markersRef = useRef<MarkersLayer | null>(null);
  const statsRef = useRef(new FrameStats());
  const dirtyRef = useRef(false);
  const [ready, setReady] = useState(false);

  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  const shapes = useMemo(() => loadCountryShapes(), []);
  const countryName = useMemo(makeCountryNamer, []);
  const materials = useMemo(
    () => ({
      globe: new THREE.MeshBasicMaterial({ color: COLORS.globe }),
      cap: new THREE.MeshBasicMaterial({ color: COLORS.countryFill }),
    }),
    [],
  );
  useEffect(
    () => () => {
      materials.globe.dispose();
      materials.cap.dispose();
    },
    [materials],
  );

  const layout = useMemo(() => (indexes ? layoutCompanies(indexes.companies) : null), [indexes]);
  const companyIndex = useMemo(() => {
    const m = new Map<number, number>();
    indexes?.companies.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [indexes]);

  const arcs = useMemo<RoleArcs>(() => {
    if (!indexes || !layout || !detail) return EMPTY_ARCS;
    const game = indexes.gameById.get(detail.id);
    if (!game) return EMPTY_ARCS;
    return buildRoleArcs({
      leadCompanyId: game.leadCompanyId,
      roles: detail.roles,
      enabledRoles,
      companyById: indexes.companyById,
      displayPosition: (c) => {
        const i = companyIndex.get(c.id);
        return i === undefined || layout.hidden[i] ? null : { lat: layout.lat[i]!, lng: layout.lng[i]! };
      },
    });
  }, [indexes, layout, detail, enabledRoles, companyIndex]);
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;

  const onZoom = useCallback((pov: { altitude: number }) => {
    layerRef.current?.setAltitude(pov.altitude);
    dirtyRef.current = true;
  }, []);
  const onGlobeReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    const controls = globe.controls();
    const stopRotation = () => {
      controls.autoRotate = false;
    };
    const st = useStore.getState();
    controls.autoRotate = !reducedMotion && st.selectedGameId === null && st.selectedPlace === null;
    controls.autoRotateSpeed = 0.35;
    controls.addEventListener('start', stopRotation);
    return () => controls.removeEventListener('start', stopRotation);
  }, [ready, reducedMotion]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !indexes || !timeline || !layout) return;
    const scene = globe.scene();
    const renderer = globe.renderer();
    const camera = globe.camera();
    const canvas = renderer.domElement;
    const tooltip = tooltipRef.current;

    const layer = new PointsLayer({
      globe,
      scene,
      indexes,
      timeline,
      layout,
      pixelRatio: renderer.getPixelRatio(),
      countryName,
    });
    layer.setYear(useStore.getState().year);
    layer.setAltitude(globe.pointOfView().altitude);
    layerRef.current = layer;
    const markers = new MarkersLayer(globe, scene, renderer.getPixelRatio());
    markers.set(arcsRef.current.markers);
    markersRef.current = markers;

    const pointer = { x: 0, y: 0, inside: false, down: false, downX: 0, downY: 0 };
    let hovered: PickedPoint | null = null;

    const setHover = (p: PickedPoint | null) => {
      hovered = p;
      canvas.style.cursor = p ? 'pointer' : '';
      if (!tooltip) return;
      if (!p) {
        tooltip.style.display = 'none';
        return;
      }
      const year = useStore.getState().year;
      tooltip.textContent = `${p.name}\n${p.count} ${p.count === 1 ? 'game' : 'games'} led by ${year}`;
      tooltip.style.display = 'block';
      tooltip.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 14}px)`;
    };

    const pickAt = (x: number, y: number) =>
      layer.pick(x, y, camera, canvas.clientWidth, canvas.clientHeight);

    const localXY = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };

    const onMove = (ev: PointerEvent) => {
      const p = localXY(ev);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      dirtyRef.current = true;
    };
    const onLeave = () => {
      pointer.inside = false;
      pointer.down = false;
      setHover(null);
    };
    const onDown = (ev: PointerEvent) => {
      const p = localXY(ev);
      pointer.down = true;
      pointer.downX = p.x;
      pointer.downY = p.y;
      setHover(null);
    };
    const onUp = (ev: PointerEvent) => {
      if (!pointer.down) return;
      pointer.down = false;
      const p = localXY(ev);
      if (Math.hypot(p.x - pointer.downX, p.y - pointer.downY) > CLICK_SLOP_PX) return;
      const hit = pickAt(p.x, p.y);
      if (!hit) return;
      useStore.getState().selectPlace({ level: hit.level, key: layer.keyAt(hit.level, hit.index) });
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    const fly = (target: Target | null) => {
      if (!target) return;
      globe.controls().autoRotate = false;
      globe.pointOfView(target, FLY_MS);
    };
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.year !== prev.year) {
        layer.setYear(s.year);
        dirtyRef.current = true;
      }
      if (s.selectedPlace !== prev.selectedPlace && s.selectedPlace) {
        fly(placeTarget(indexes, layout, companyIndex, s.selectedPlace));
      }
      if (s.selectedGameId !== prev.selectedGameId && s.selectedGameId !== null) {
        fly(gameTarget(indexes, layout, companyIndex, s.selectedGameId));
      }
    });

    const stats = statsRef.current;
    let last = performance.now();
    let raf = requestAnimationFrame(function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      stats.push(now, dt);
      layer.frame(dt);
      if (dirtyRef.current) {
        dirtyRef.current = false;
        if (pointer.inside && !pointer.down) {
          const p = pickAt(pointer.x, pointer.y);
          if (p?.level !== hovered?.level || p?.index !== hovered?.index || p?.count !== hovered?.count) setHover(p);
          else if (p && tooltip) tooltip.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 14}px)`;
        }
      }
    });

    if (debug) {
      window.__overworld = {
        fps: () => stats.fps(performance.now()),
        frameTimes: () => stats.frameTimes(),
        level: () => layer.level(),
        pointCount: () => layer.pointCount(),
        setYear: (y) => useStore.getState().setYear(y),
        playYears: (msPerYear) =>
          new Promise<void>((resolve) => {
            const { minYear, maxYear } = timeline;
            const start = performance.now();
            let lastYear = -1;
            const step = (t: number) => {
              const y = Math.min(maxYear, minYear + Math.floor((t - start) / msPerYear));
              if (y !== lastYear) {
                lastYear = y;
                useStore.getState().setYear(y);
              }
              if (y >= maxYear) resolve();
              else requestAnimationFrame(step);
            };
            step(start);
          }),
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.style.cursor = '';
      if (tooltip) tooltip.style.display = 'none';
      if (debug) delete window.__overworld;
      layer.dispose();
      markers.dispose();
      layerRef.current = null;
      markersRef.current = null;
    };
  }, [ready, indexes, timeline, layout, companyIndex, countryName, debug]);

  useEffect(() => {
    markersRef.current?.set(arcs.markers);
  }, [arcs]);

  const readout = useCallback(
    (): Readout => ({
      fps: statsRef.current.fps(performance.now()),
      level: layerRef.current?.level() ?? '-',
      points: layerRef.current?.pointCount() ?? 0,
    }),
    [],
  );

  if (!indexes || !timeline) return null;

  const dashed = !reducedMotion;
  return (
    <div style={{ position: 'fixed', inset: 0, background: COLORS.background, overflow: 'hidden' }}>
      <Globe
        ref={globeRef}
        width={w}
        height={h}
        backgroundColor={COLORS.background}
        globeMaterial={materials.globe}
        atmosphereColor={COLORS.atmosphere}
        atmosphereAltitude={0.18}
        enablePointerInteraction={false}
        onGlobeReady={onGlobeReady}
        onZoom={onZoom}
        polygonsData={shapes}
        polygonGeoJsonGeometry="geometry"
        polygonCapMaterial={materials.cap}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={() => COLORS.countryStroke}
        polygonAltitude={0.004}
        polygonsTransitionDuration={0}
        arcsData={arcs.arcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcAltitude="altitude"
        arcStroke="stroke"
        arcDashLength={dashed ? 0.35 : 1}
        arcDashGap={dashed ? 0.25 : 0}
        arcDashAnimateTime={dashed ? 2400 : 0}
        arcsTransitionDuration={0}
        htmlElementsData={arcs.labels}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.02}
        htmlElement={labelElement}
        htmlTransitionDuration={0}
      />
      <div ref={tooltipRef} style={{ ...tooltipStyle, whiteSpace: 'pre' }} />
      {debug && <DebugHud read={readout} />}
    </div>
  );
}
