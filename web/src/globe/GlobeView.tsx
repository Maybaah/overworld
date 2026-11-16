import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '../data/store';
import { baseAltitude, buildRoleArcs, distanceKm, type ArcSpec, type RoleArcs } from './arcs';
import { COLORS } from './colors';
import {
  loadCountryShapes,
  loadDetailedCountryShapes,
  type CountryShape,
} from './countries';
import { nearShapes, prepareDetail, upgradeShapes, type DetailShape } from './detail';
import { DebugHud, type Readout } from './DebugHud';
import { frameTarget, gameTarget, placeTarget, type Target } from './flight';
import { FrameStats } from './frameStats';
import { LabelManager, type LabelFrame, type LabelItem } from './labels';
import { MapLabels } from './mapLabels';
import { countryAnchors } from './placeNames';
import type { Rect } from './rectGrid';
import { layoutCompanies } from './layout';
import { CITY_FROM, LEVELS } from './levels';
import { CountriesLayer } from './countriesLayer';
import { CoversLayer, type CoverEntry } from './coversLayer';
import { MarkersLayer, type MarkerItem } from './markersLayer';
import { MosaicLayer } from './mosaicLayer';
import { PICK_RADIUS_PX } from './picking';
import { isClick, pointerToCanvas } from './pointer';
import { POINT_ALTITUDE, PointsLayer, type PickedPoint } from './pointsLayer';
import {
  findTileEngine,
  IMAGERY_LIGHT,
  IMAGERY_TINT,
  imageryVerdict,
  loadedTileCount,
  TILE_MAX_LEVEL,
  TileRepair,
  browserTileChecks,
  tileUrl,
  type ImageryState,
} from './tiles';

declare global {
  interface Window {
    __overworld?: {
      fps(): number;
      frameTimes(): number[];
      level(): string;
      pointCount(): number;
      coverCount(): number;
      coversLoaded(): number;
      imagesLoaded(): number;
      visibleCovers(): string[];
      imagery(): string;
      mosaic(): import("./mosaicLayer").MosaicStats;
      namesPlaced(): number;
      lastLayoutMs(): number;
      setYear(y: number): void;
      playYears(msPerYear: number): Promise<void>;
    };
  }
}

const NO_ARCS: RoleArcs = { arcs: [], markers: [], labels: [] };
const FLY_MS = 1200;
const SHADE_TOP = '#2f8f9d';
const EXTRA_STROKE = 0.45;
const BASE_RADIUS = 99.6;
const SETTLE_MS = 160;
const MOVING_LAYOUT_MS = 650;
const TILE_PROPS = { globeTileEngineMaxLevel: TILE_MAX_LEVEL } as Record<string, unknown>;

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
  whiteSpace: 'pre',
  zIndex: 10,
} as const;

// Over the North Atlantic, so North America, Europe and Africa are all in view at load.
const START_VIEW = { lat: 36, lng: -32, altitude: 2.1 };

export function GlobeView() {
  const indexes = useStore((s) => s.indexes);
  const hasTimeline = useStore((s) => s.timeline !== null);
  const detail = useStore((s) => s.selectedGameDetail);
  const enabledRoles = useStore((s) => s.enabledRoles);
  const extraArcs = useStore((s) => s.extraArcs);
  const extraMarkers = useStore((s) => s.extraMarkers);
  const countryShade = useStore((s) => s.countryShade);
  const { w, h } = useWindowSize();

  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const labelRootRef = useRef<HTMLDivElement>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<PointsLayer | null>(null);
  const coversRef = useRef<CoversLayer | null>(null);
  const relayoutRef = useRef<'none' | 'sticky' | 'fresh'>('fresh');
  const markersRef = useRef<MarkersLayer | null>(null);
  const countriesRef = useRef<CountriesLayer | null>(null);
  const labelsRef = useRef<LabelManager | null>(null);
  const statsRef = useRef(new FrameStats());
  const dirtyRef = useRef(false);
  const detailRequested = useRef(false);
  const detailRef = useRef<DetailShape[] | null>(null);
  const upgradedRef = useRef(new Set<string>());
  const needUpgrade = useRef(false);
  const mountedRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [imagery, setImagery] = useState<ImageryState>('off');
  const imageryRef = useRef(imagery);
  imageryRef.current = imagery;
  const [shapes, setShapes] = useState<CountryShape[]>(() => loadCountryShapes());
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;

  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  const countryName = useMemo(makeCountryNamer, []);
  const anchors = useMemo(() => countryAnchors(loadCountryShapes()), []);
  const globeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.globe }), []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      globeMaterial.dispose();
    };
  }, [globeMaterial]);

  const layout = useMemo(() => (indexes ? layoutCompanies(indexes.companies) : null), [indexes]);
  const companyIndex = useMemo(() => {
    const m = new Map<number, number>();
    indexes?.companies.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [indexes]);

  const arcs = useMemo<RoleArcs>(() => {
    if (!indexes || !layout || !detail) return NO_ARCS;
    const game = indexes.gameById.get(detail.id);
    if (!game) return NO_ARCS;
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

  const extraArcData = useMemo(
    () =>
      extraArcs.map<ArcSpec & { id: string }>((a) => ({
        id: a.id,
        companyId: -1,
        role: 'support',
        startLat: a.startLat,
        startLng: a.startLng,
        endLat: a.endLat,
        endLng: a.endLng,
        color: a.color,
        altitude: baseAltitude(distanceKm(a.startLat, a.startLng, a.endLat, a.endLng)),
        stroke: a.width ?? EXTRA_STROKE,
        approx: false,
      })),
    [extraArcs],
  );
  const arcsData = useMemo(() => (extraArcData.length ? [...arcs.arcs, ...extraArcData] : arcs.arcs), [arcs.arcs, extraArcData]);

  const markerItems = useMemo<MarkerItem[]>(
    () => [
      ...arcs.markers.map<MarkerItem>((m) => ({ lat: m.lat, lng: m.lng, color: m.color, kind: m.lead ? 'lead' : 'ring' })),
      ...extraMarkers.map<MarkerItem>((m) => ({ lat: m.lat, lng: m.lng, color: m.color, kind: m.kind })),
    ],
    [arcs.markers, extraMarkers],
  );

  const labelItems = useMemo<LabelItem[]>(() => {
    const items: LabelItem[] = [];
    const labelled = new Set(arcs.labels.map((l) => l.companyId));
    arcs.labels.forEach((l, i) => {
      const lead = arcs.markers.find((m) => m.companyId === l.companyId)?.lead ?? false;
      items.push({
        id: `c:${l.companyId}`,
        name: l.name,
        lat: l.lat,
        lng: l.lng,
        color: l.color,
        mode: lead ? 'always' : 'auto',
        priority: i,
        radius: lead ? 15 : 8,
      });
    });
    for (const m of arcs.markers) {
      if (labelled.has(m.companyId)) continue;
      items.push({ id: `c:${m.companyId}`, name: m.name, lat: m.lat, lng: m.lng, color: m.color, mode: 'hover', priority: 1000, radius: 8 });
    }
    for (const m of extraMarkers) {
      if (!m.label) continue;
      items.push({ id: `xm:${m.id}`, name: m.label, lat: m.lat, lng: m.lng, color: m.color, mode: 'auto', priority: 0.5, radius: m.kind === 'pin' ? 7 : 8 });
    }
    for (const a of extraArcs) {
      if (!a.label) continue;
      items.push({ id: `xa:${a.id}`, name: a.label, lat: a.endLat, lng: a.endLng, color: a.color, mode: 'auto', priority: 0.6, radius: 3 });
    }
    return items;
  }, [arcs, extraMarkers, extraArcs]);

  const markerItemsRef = useRef(markerItems);
  markerItemsRef.current = markerItems;
  const labelItemsRef = useRef(labelItems);
  labelItemsRef.current = labelItems;

  const onZoom = useCallback((pov: { altitude: number }) => {
    layerRef.current?.setAltitude(pov.altitude);
    dirtyRef.current = true;
    if (pov.altitude < CITY_FROM && !detailRequested.current) {
      detailRequested.current = true;
      loadDetailedCountryShapes()
        .then((s) => {
          detailRef.current = prepareDetail(s);
          needUpgrade.current = true;
        })
        .catch(() => {
          detailRequested.current = false;
        });
    }
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
    if (st.selectedGameId === null && st.selectedPlace === null) globe.pointOfView(START_VIEW, 0);
    controls.autoRotate = !reducedMotion && st.selectedGameId === null && st.selectedPlace === null;
    controls.autoRotateSpeed = 0.35;
    controls.addEventListener('start', stopRotation);
    return () => controls.removeEventListener('start', stopRotation);
  }, [ready, reducedMotion]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    const scene = globe.scene();
    const base = new THREE.Mesh(
      new THREE.SphereGeometry(BASE_RADIUS, 64, 32),
      new THREE.MeshBasicMaterial({ color: COLORS.globe }),
    );
    base.renderOrder = -1;
    scene.add(base);
    globe.lights([new THREE.AmbientLight(IMAGERY_TINT, IMAGERY_LIGHT * Math.PI)]);
    return () => {
      scene.remove(base);
      base.geometry.dispose();
      base.material.dispose();
    };
  }, [ready]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || imagery !== 'pending') return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const engine = findTileEngine(globe.scene());
      const verdict = imageryVerdict(engine ? loadedTileCount(engine) : 0, performance.now() - start);
      if (verdict !== 'pending') setImagery(verdict);
    }, 400);
    return () => window.clearInterval(id);
  }, [ready, imagery]);

  useEffect(() => {
    countriesRef.current?.setImagery(imagery === 'on');
    if (imagery === 'off') globeRef.current?.globeTileEngineClearCache();
  }, [imagery]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || imagery !== 'on') return;
    const repair = new TileRepair(browserTileChecks);
    let engine: ReturnType<typeof findTileEngine> = null;
    const id = window.setInterval(() => {
      engine ??= findTileEngine(globe.scene());
      if (engine) repair.tick(engine);
    }, 200);
    return () => window.clearInterval(id);
  }, [ready, imagery]);

  useEffect(() => {
    const globe = globeRef.current;
    const timeline = useStore.getState().timeline;
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
      animate: !reducedMotion,
    });
    const initial = useStore.getState();
    layer.setTimeline(timeline, initial.gameFilter === null);
    layer.setYear(initial.year);
    layer.setVisible(false);
    layer.setAltitude(globe.pointOfView().altitude);
    layerRef.current = layer;
    const markers = new MarkersLayer(globe, scene, renderer.getPixelRatio());
    markers.set(markerItemsRef.current);
    markersRef.current = markers;
    const outline = new CountriesLayer(scene, COLORS.countryFill, COLORS.countryStroke, SHADE_TOP);
    outline.set(shapesRef.current);
    outline.setShade(useStore.getState().countryShade);
    outline.setImagery(imageryRef.current === 'on');
    countriesRef.current = outline;
    const labels = labelRootRef.current ? new LabelManager(labelRootRef.current, globe) : null;
    const names = mapRootRef.current ? new MapLabels(mapRootRef.current, globe, anchors, indexes.cities, !reducedMotion) : null;
    const covers = new CoversLayer({
      scene,
      renderer,
      indexes,
      positions: { country: layer.positions('country'), city: layer.positions('city'), company: layer.positions('company') },
      hidden: { country: null, city: null, company: layout.hidden },
      animate: !reducedMotion,
    });
    covers.setTimeline(timeline, initial.gameFilter);
    covers.setYear(initial.year);
    covers.setVisible(false);
    coversRef.current = covers;
    names?.setPillsVisible(false);
    const mosaic = new MosaicLayer(scene, renderer, () => performance.now() / 1000);
    mosaic.init(
      indexes.games.flatMap((g) => {
        const c = indexes.companyById.get(g.leadCompanyId);
        if (!c || !c.country || c.lat === null || c.lng === null) return [];
        return [{ id: g.id, cover: g.cover, popularity: g.popularity, lat: c.lat, lng: c.lng, country: c.country, exact: c.precision === 'city', year: g.year }];
      }),
    );
    const mosaicShown = (s: { pointsVisible: boolean; countryShade: unknown }) => s.pointsVisible && s.countryShade === null;
    const requestMosaic = (s: { year: number; gameFilter: Set<number> | null; timeline: { maxYear: number } | null }) => {
      if (s.timeline) mosaic.request(s.year, s.timeline.maxYear, s.gameFilter);
    };
    requestMosaic(initial);
    mosaic.setVisible(mosaicShown(initial));
    mosaic.setSelected(initial.selectedGameId);
    let mosaicHover: number | null = null;
    let mosaicPicking = false;
    let mosaicMovedAt = -Infinity;
    let mosaicSettled = true;
    let mosaicPickedAt = -Infinity;
    relayoutRef.current = 'fresh';
    let lastMove = -Infinity;
    let lastLayout = -Infinity;
    let layoutMs = 0;
    let pendingSettle = false;
    let lastLevel = layer.level();
    const layoutPlaces = (frame: LabelFrame, sticky: boolean) => {
      const t0 = performance.now();
      const level = layer.level();
      const arcRects = labels?.obstacles() ?? [];
      const chosen = covers.select({ frame, level, counts: layer.counts(level), sticky, obstacles: arcRects });
      for (const l of LEVELS) covers.coveredMask(l, layer.coveredMask(l));
      layer.applyCovered();
      if (names) {
        const st = useStore.getState();
        const cityCounts = st.timeline ? st.timeline.levelAt('city', st.year) : new Uint32Array(0);
        const cityRects = new Map<number, Rect>();
        if (level === 'city') for (const e of chosen) cityRects.set(e.index, e.rect);
        names.layout({
          frame,
          altitude: globe.pointOfView().altitude,
          showCities: level !== 'country',
          cityCounts,
          obstacles: [...covers.rects(), ...arcRects],
          cityAround: (i, x, y) => cityRects.get(i) ?? { x: x - 5, y: y - 5, w: 10, h: 10 },
          sticky,
        });
        names.setPills(covers.pills(level), frame);
      }
      layoutMs = performance.now() - t0;
    };
    const currentFrame = (): LabelFrame => {
      const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      return { viewProjection: m.elements, camera: camera.position, width: canvas.clientWidth, height: canvas.clientHeight };
    };
    labels?.setItems(labelItemsRef.current);
    labelsRef.current = labels;

    const pointer = { x: 0, y: 0, lx: 0, ly: 0, inside: false, down: false, downX: 0, downY: 0 };
    let hovered: PickedPoint | null = null;
    let hoveredLabel: string | null = null;

    const placeTooltip = () => {
      if (tooltip) tooltip.style.transform = `translate(${pointer.lx + 14}px, ${pointer.ly + 14}px)`;
    };

    const setHover = (p: PickedPoint | null) => {
      hovered = p;
      canvas.style.cursor = p ? 'pointer' : '';
      if (!tooltip) return;
      if (!p) {
        tooltip.style.display = 'none';
        return;
      }
      const year = useStore.getState().year;
      const games = `${p.count} ${p.count === 1 ? 'game' : 'games'} led by ${year}`;
      tooltip.textContent = p.game ? `${p.game}\n${p.name}\n${games}` : `${p.name}\n${games}`;
      tooltip.style.display = 'block';
      placeTooltip();
    };

    const setMosaicTooltip = (id: number | null) => {
      canvas.style.cursor = id !== null ? 'pointer' : '';
      if (!tooltip) return;
      const g = id !== null ? indexes.gameById.get(id) : undefined;
      if (!g) {
        tooltip.style.display = 'none';
        return;
      }
      const c = indexes.companyById.get(g.leadCompanyId);
      const where = c ? [c.name, c.city, c.country].filter(Boolean).join(', ') : '';
      tooltip.textContent = `${g.name}${g.year ? ` (${g.year})` : ''}
${where}`;
      tooltip.style.display = 'block';
      placeTooltip();
    };

    const pointsPickable = () => {
      const s = useStore.getState();
      return s.mode !== 'guess' && s.pointsVisible;
    };

    const track = (ev: PointerEvent) => {
      const p = pointerToCanvas(ev.clientX, ev.clientY, canvas.getBoundingClientRect());
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.lx = p.nx * canvas.clientWidth;
      pointer.ly = p.ny * canvas.clientHeight;
      return p;
    };

    const pickAt = (x: number, y: number, frame: LabelFrame): (PickedPoint & { entry: CoverEntry | null }) | null => {
      const c = covers.pick(x, y, frame);
      if (c) {
        const e = c.entry;
        return {
          level: e.level,
          index: e.index,
          name: layer.nameAt(e.level, e.index),
          count: layer.counts(e.level)[e.index] ?? 0,
          game: c.game?.name,
          entry: e,
        };
      }
      const d = layer.pick(x, y, camera, frame.width, frame.height);
      return d ? { ...d, entry: null } : null;
    };

    const onMove = (ev: PointerEvent) => {
      track(ev);
      pointer.inside = true;
      dirtyRef.current = true;
    };
    const onLeave = () => {
      pointer.inside = false;
      pointer.down = false;
      setHover(null);
      covers.setHover(null);
      labels?.setHover(null);
      hoveredLabel = null;
      mosaicHover = null;
      mosaic.setHover(null);
    };
    const onDown = (ev: PointerEvent) => {
      const p = track(ev);
      pointer.down = ev.button === 0;
      pointer.downX = p.x;
      pointer.downY = p.y;
      setHover(null);
      covers.setHover(null);
    };
    const onUp = (ev: PointerEvent) => {
      if (!pointer.down) return;
      pointer.down = false;
      const p = track(ev);
      if (!isClick(pointer.downX, pointer.downY, p.x, p.y)) return;
      if (mosaic.visible) {
        const geo = globe.toGlobeCoords(p.nx * canvas.clientWidth, p.ny * canvas.clientHeight);
        if (!geo) return;
        void mosaic.pick(geo.lat, geo.lng).then((id) => {
          if (id !== null) void useStore.getState().selectGame(id);
          else useStore.getState().reportGlobeClick(geo.lat, geo.lng);
        });
        return;
      }
      const hit = pointsPickable() ? pickAt(p.x, p.y, currentFrame()) : null;
      if (hit) {
        useStore.getState().selectPlace({ level: hit.level, key: layer.keyAt(hit.level, hit.index) });
        return;
      }
      const geo = globe.toGlobeCoords(p.nx * canvas.clientWidth, p.ny * canvas.clientHeight);
      if (geo) useStore.getState().reportGlobeClick(geo.lat, geo.lng);
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
    let lastCameraSeq = initial.cameraRequest?.seq ?? 0;
    const opened = useStore.getState();
    if (opened.selectedGameId !== null) fly(gameTarget(indexes, layout, companyIndex, opened.selectedGameId));
    else if (opened.selectedPlace) fly(placeTarget(indexes, layout, companyIndex, opened.selectedPlace));
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.timeline !== prev.timeline || s.gameFilter !== prev.gameFilter || s.year !== prev.year) requestMosaic(s);
      if (s.pointsVisible !== prev.pointsVisible || s.countryShade !== prev.countryShade) mosaic.setVisible(mosaicShown(s));
      if (s.selectedGameId !== prev.selectedGameId) mosaic.setSelected(s.selectedGameId);
      if (s.timeline !== prev.timeline || s.gameFilter !== prev.gameFilter) {
        if (s.timeline) {
          layer.setTimeline(s.timeline, s.gameFilter === null);
          covers.setTimeline(s.timeline, s.gameFilter);
        }
        dirtyRef.current = true;
        if (relayoutRef.current === 'none') relayoutRef.current = 'sticky';
      }
      if (s.year !== prev.year) {
        layer.setYear(s.year);
        covers.setYear(s.year);
        dirtyRef.current = true;
        if (relayoutRef.current === 'none') relayoutRef.current = 'sticky';
      }
      if (s.pointsVisible !== prev.pointsVisible) {
        relayoutRef.current = 'fresh';
        if (!s.pointsVisible) {
          setHover(null);
          covers.setHover(null);
        }
      }
      if (s.selectedPlace !== prev.selectedPlace && s.selectedPlace) {
        fly(placeTarget(indexes, layout, companyIndex, s.selectedPlace));
      }
      if (s.selectedGameId !== prev.selectedGameId && s.selectedGameId !== null) {
        fly(gameTarget(indexes, layout, companyIndex, s.selectedGameId));
      }
      if (s.cameraRequest && s.cameraRequest.seq !== lastCameraSeq) {
        lastCameraSeq = s.cameraRequest.seq;
        fly({ lat: s.cameraRequest.lat, lng: s.cameraRequest.lng, altitude: s.cameraRequest.altitude });
      }
    });

    const stats = statsRef.current;
    const vp = new THREE.Matrix4();
    const lastWorld = new Float64Array(16);
    let last = performance.now();
    let lastUpgrade = 0;
    let raf = requestAnimationFrame(function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      stats.push(now, dt);
      layer.frame(dt);

      const world = camera.matrixWorld.elements;
      let moved = false;
      for (let i = 0; i < 16; i++) {
        if (world[i] !== lastWorld[i]) {
          moved = true;
          lastWorld[i] = world[i]!;
        }
      }
      if (moved) {
        needUpgrade.current = true;
        mosaicMovedAt = now;
        mosaicSettled = false;
      }
      if (!mosaicSettled && (now - mosaicMovedAt > 250 || now - mosaicPickedAt > 400)) {
        mosaicSettled = now - mosaicMovedAt > 250;
        mosaicPickedAt = now;
        mosaic.cameraMoved();
      }
      mosaic.frame(camera as THREE.PerspectiveCamera, canvas.clientHeight);
      if (needUpgrade.current && detailRef.current && now - lastUpgrade > 350) {
        const pov = globe.pointOfView();
        if (pov.altitude < CITY_FROM) {
          const next = nearShapes(detailRef.current, pov.lat, pov.lng, pov.altitude).find((d) => !upgradedRef.current.has(d.key));
          if (next) {
            upgradedRef.current.add(next.key);
            lastUpgrade = now;
            setShapes((prev) => upgradeShapes(prev, next));
          } else needUpgrade.current = false;
        } else needUpgrade.current = false;
      }
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const frame: LabelFrame = { viewProjection: vp.elements, camera: camera.position, width: canvas.clientWidth, height: canvas.clientHeight };
      labels?.tick(frame, moved, now);
      if (moved) {
        lastMove = now;
        pendingSettle = true;
      }
      const level = layer.level();
      if (level !== lastLevel) {
        lastLevel = level;
        relayoutRef.current = 'fresh';
      }
      const settled = now - lastMove >= SETTLE_MS;
      const relayout = relayoutRef.current;
      if (relayout !== 'none' || (settled && pendingSettle) || (!settled && now - lastLayout >= MOVING_LAYOUT_MS)) {
        layoutPlaces(frame, relayout === 'sticky' || (!settled && relayout !== 'fresh'));
        relayoutRef.current = 'none';
        lastLayout = now;
        if (settled) pendingSettle = false;
      } else if (moved) names?.follow(frame);
      covers.frame(frame.width, frame.height);

      if (dirtyRef.current) {
        dirtyRef.current = false;
        if (pointer.inside && !pointer.down && mosaic.visible) {
          const geo = globe.toGlobeCoords(pointer.lx, pointer.ly);
          if (!geo) {
            mosaicHover = null;
            mosaic.setHover(null);
            setMosaicTooltip(null);
          } else if (!mosaicPicking) {
            mosaicPicking = true;
            void mosaic.pick(geo.lat, geo.lng).then((id) => {
              mosaicPicking = false;
              if (id !== mosaicHover) {
                mosaicHover = id;
                mosaic.setHover(id);
                setMosaicTooltip(id);
              } else placeTooltip();
            });
          }
        } else if (pointer.inside && !pointer.down) {
          const rect = canvas.getBoundingClientRect();
          const w2 = rect.width;
          const h2 = rect.height;
          const p = pointsPickable() ? pickAt(pointer.x, pointer.y, { ...frame, width: w2, height: h2 }) : null;
          covers.setHover(p?.entry ?? null);
          if (p?.level !== hovered?.level || p?.index !== hovered?.index || p?.count !== hovered?.count || p?.game !== hovered?.game) setHover(p);
          else if (p) placeTooltip();
          if (labels) {
            const id = labels.nearest(pointer.x, pointer.y, PICK_RADIUS_PX);
            if (id !== hoveredLabel) {
              hoveredLabel = id;
              labels.setHover(id);
            }
          }
        }
      }
    });

    if (debug) {
      window.__overworld = {
        fps: () => stats.fps(performance.now()),
        frameTimes: () => stats.frameTimes(),
        level: () => layer.level(),
        pointCount: () => layer.pointCount(),
        coverCount: () => covers.coverCount(),
        mosaic: () => mosaic.stats(),
        coversLoaded: () => covers.loadedCovers(),
        imagesLoaded: () => covers.imagesLoaded(),
        visibleCovers: () => covers.visibleGames(),
        imagery: () => imageryRef.current,
        namesPlaced: () => names?.placedCount() ?? 0,
        lastLayoutMs: () => layoutMs,
        setYear: (y) => useStore.getState().setYear(y),
        playYears: (msPerYear) =>
          new Promise<void>((resolve) => {
            const tl = useStore.getState().timeline!;
            const { minYear, maxYear } = tl;
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
      covers.dispose();
      mosaic.dispose();
      coversRef.current = null;
      markers.dispose();
      outline.dispose();
      labels?.dispose();
      names?.dispose();
      countriesRef.current = null;
      layerRef.current = null;
      markersRef.current = null;
      labelsRef.current = null;
    };
  }, [ready, indexes, layout, companyIndex, countryName, debug, anchors, reducedMotion]);

  useEffect(() => {
    countriesRef.current?.set(shapes);
  }, [shapes]);

  useEffect(() => {
    countriesRef.current?.setShade(countryShade);
  }, [countryShade]);

  useEffect(() => {
    markersRef.current?.set(markerItems);
  }, [markerItems]);

  useEffect(() => {
    const globe = globeRef.current;
    const covers = coversRef.current;
    if (!ready || !globe || !covers || !indexes) return;
    const lead = arcs.markers.find((m) => m.lead);
    const game = detail ? indexes.gameById.get(detail.id) ?? null : null;
    covers.setSelectedGame(game && lead ? game : null, lead ? globe.getCoords(lead.lat, lead.lng, POINT_ALTITUDE) : null);
    relayoutRef.current = 'sticky';
  }, [arcs.markers, detail, indexes, ready, layout]);

  useEffect(() => {
    labelsRef.current?.setItems(labelItems);
  }, [labelItems]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !detail) return;
    const lead = arcs.markers.find((m) => m.lead);
    if (!lead) return;
    globe.controls().autoRotate = false;
    globe.pointOfView(frameTarget(lead, arcs.markers.filter((m) => !m.lead)), FLY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, ready]);

  const readout = useCallback(
    (): Readout => ({
      fps: statsRef.current.fps(performance.now()),
      level: layerRef.current?.level() ?? '-',
      points: layerRef.current?.pointCount() ?? 0,
      covers: coversRef.current?.coverCount() ?? 0,
    }),
    [],
  );

  if (!indexes || !hasTimeline) return null;

  const animated = !reducedMotion;
  return (
    <div style={{ position: 'fixed', inset: 0, background: COLORS.background, overflow: 'hidden' }}>
      <Globe
        ref={globeRef}
        width={w}
        height={h}
        backgroundColor={COLORS.background}
        globeMaterial={globeMaterial}
        globeTileEngineUrl={imagery === 'off' ? null : tileUrl}
        {...TILE_PROPS}
        atmosphereColor={COLORS.atmosphere}
        atmosphereAltitude={0.18}
        enablePointerInteraction={false}
        onGlobeReady={onGlobeReady}
        onZoom={onZoom}
        arcsData={arcsData}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcAltitude="altitude"
        arcStroke="stroke"
        arcDashLength={animated ? 0.35 : 1}
        arcDashGap={animated ? 0.25 : 0}
        arcDashAnimateTime={animated ? 2400 : 0}
        arcsTransitionDuration={0}
      />
      <div ref={mapRootRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
      <div ref={labelRootRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
      <div ref={tooltipRef} style={tooltipStyle} />
      {debug && <DebugHud read={readout} />}
    </div>
  );
}
