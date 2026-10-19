'use client';

/**
 * Zones : carte Maps JavaScript avec les polygones colorés, modifiables (terra-draw — pas la
 * Drawing Library de Google, dépréciée), import/export GeoJSON, quartiers, tableau en direct.
 */
import { useEffect, useRef, useState } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';
import { rpc, useAdmin, type ZoneOpt } from '@/lib/admin';
import { useGoogleMap } from '@/components/GoogleMap';

type Ring = number[][];

export default function ZonesPage() {
  const { city, zones, reloadZones } = useAdmin();
  const { ref, map, error } = useGoogleMap({ lat: city?.center_lat ?? 6.1375, lng: city?.center_lng ?? 1.2123 }, 12);
  const draw = useRef<TerraDraw | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, Ring>>({});
  const [newZone, setNewZone] = useState<{ code: string; name: string; color: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Démarre terra-draw une fois la carte prête.
  useEffect(() => {
    if (!map || draw.current) return;
    const start = () => {
      const td = new TerraDraw({
        adapter: new TerraDrawGoogleMapsAdapter({ lib: google.maps, map, coordinatePrecision: 6 }),
        modes: [
          new TerraDrawSelectMode({
            flags: {
              polygon: { feature: { draggable: false, coordinates: { midpoints: true, draggable: true, deletable: true } } },
            },
          }),
          new TerraDrawPolygonMode(),
        ],
      });
      td.start();
      td.on('change', (ids) => {
        const snap = td.getSnapshot();
        setDirty((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            const f = snap.find((x) => x.id === id);
            if (f && f.geometry.type === 'Polygon') next[String(id)] = f.geometry.coordinates[0] as Ring;
          }
          return next;
        });
      });
      td.on('select', (id) => setSelected(String(id)));
      td.on('deselect', () => setSelected(null));
      draw.current = td;
      setReady(true);
    };
    if (map.getProjection()) start();
    else google.maps.event.addListenerOnce(map, 'projection_changed', start);
  }, [map]);

  // Charge les zones dans terra-draw (premier polygone de chaque MultiPolygon).
  useEffect(() => {
    const td = draw.current;
    if (!ready || !td) return;
    td.clear();
    const features: GeoJSONStoreFeatures[] = zones
      .filter((z) => z.geojson?.coordinates?.[0]?.[0])
      .map((z) => ({
        id: z.id,
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [z.geojson.coordinates[0]![0]!] },
        properties: {
          mode: 'polygon',
          polygonFillColor: z.color as `#${string}`,
          polygonOutlineColor: z.color as `#${string}`,
          polygonFillOpacity: 0.18,
        },
      }));
    const res = td.addFeatures(features);
    res.filter((r) => !r.valid).forEach((r) => console.warn('Zone invalide', r));
    td.setMode('select');
    setDirty({});
  }, [ready, zones]);

  async function save(z: ZoneOpt) {
    const ring = dirty[z.id];
    if (!ring) return;
    setBusy(true);
    await rpc('admin_save_zone', {
      p_zone: z.id, p_city: z.city_id, p_code: z.code, p_name: z.name, p_color: z.color,
      p_geojson: { type: 'MultiPolygon', coordinates: [[ring]] }, p_active: z.active, p_allow_overflow: z.allow_overflow,
    });
    setBusy(false);
    await reloadZones();
  }

  async function updateMeta(z: ZoneOpt, patch: Partial<ZoneOpt>) {
    const m = { ...z, ...patch };
    await rpc('admin_save_zone', {
      p_zone: z.id, p_city: z.city_id, p_code: z.code, p_name: m.name, p_color: m.color,
      p_geojson: dirty[z.id] ? { type: 'MultiPolygon', coordinates: [[dirty[z.id]]] } : z.geojson,
      p_active: m.active, p_allow_overflow: m.allow_overflow,
    });
    await reloadZones();
  }

  function startNewZone() {
    if (!draw.current) return;
    setNewZone({ code: `${(city?.name ?? 'ZONE').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)}_Z${zones.length + 1}`, name: '', color: '#9B51E0' });
    draw.current.setMode('polygon');
  }

  async function saveNewZone() {
    const td = draw.current;
    if (!td || !newZone || !city) return;
    const known = new Set(zones.map((z) => z.id));
    const f = td.getSnapshot().find((x) => !known.has(String(x.id)) && x.geometry.type === 'Polygon');
    if (!f || f.geometry.type !== 'Polygon') {
      alert('Dessinez d’abord le polygone sur la carte (double-clic pour terminer).');
      return;
    }
    await rpc('admin_save_zone', {
      p_zone: null, p_city: city.id, p_code: newZone.code, p_name: newZone.name || newZone.code, p_color: newZone.color,
      p_geojson: { type: 'MultiPolygon', coordinates: [f.geometry.coordinates] }, p_active: true, p_allow_overflow: true,
    });
    setNewZone(null);
    await reloadZones();
  }

  async function exportGeoJson() {
    if (!city) return;
    const fc = await rpc<object>('admin_export_zones', { p_city: city.id });
    if (!fc) return;
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zones-${city.name.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
  }

  async function importGeoJson(file: File) {
    if (!city) return;
    try {
      const fc = JSON.parse(await file.text());
      if (fc?.type !== 'FeatureCollection') throw new Error('Fichier GeoJSON FeatureCollection attendu');
      if (!confirm(`Importer ${fc.features?.length ?? 0} zone(s) ? Les zones de même code seront remplacées.`)) return;
      const n = await rpc<number>('admin_import_zones', { p_city: city.id, p_collection: fc });
      if (n != null) alert(`${n} zone(s) importée(s).`);
      await reloadZones();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Zones · {city?.name}</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn-sm bg-surface" onClick={startNewZone}>+ Nouvelle zone</button>
          <button className="btn-sm bg-surface" onClick={exportGeoJson}>Exporter GeoJSON</button>
          <label className="btn-sm cursor-pointer bg-surface">
            Importer GeoJSON
            <input type="file" accept=".geojson,.json,application/geo+json" className="hidden" onChange={(e) => e.target.files?.[0] && importGeoJson(e.target.files[0])} />
          </label>
        </div>
      </div>
      <p className="text-sm text-muted">Cliquez une zone pour la sélectionner, déplacez ses sommets (les points du milieu ajoutent un sommet, clic droit/suppr. pour en retirer), puis « Enregistrer le contour ». Les coursiers et les courses futures utilisent immédiatement le nouveau découpage.</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="relative h-[70dvh] overflow-hidden rounded-2xl border border-line">
          <div id="zones-map" ref={ref} className="absolute inset-0" />
          {error ? <p className="absolute inset-x-4 top-4 rounded-xl bg-white p-3 text-sm text-danger">{error}</p> : null}
        </div>

        <div className="space-y-3">
          {newZone ? (
            <div className="card space-y-2 ring-2 ring-accent">
              <p className="font-semibold">Nouvelle zone : dessinez-la sur la carte</p>
              <input className="input" placeholder="Code (ex. LOME_Z3)" value={newZone.code} onChange={(e) => setNewZone({ ...newZone, code: e.target.value.toUpperCase() })} />
              <input className="input" placeholder="Nom" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} />
              <input type="color" value={newZone.color} onChange={(e) => setNewZone({ ...newZone, color: e.target.value })} />
              <div className="flex gap-2">
                <button className="btn-sm bg-accent text-white" onClick={saveNewZone}>Créer</button>
                <button className="btn-sm bg-surface" onClick={() => { setNewZone(null); draw.current?.setMode('select'); reloadZones(); }}>Annuler</button>
              </div>
            </div>
          ) : null}
          {zones.map((z) => (
            <ZoneCard key={z.id} z={z} selected={selected === z.id} dirty={!!dirty[z.id]} busy={busy}
              onSave={() => save(z)} onMeta={(p) => updateMeta(z, p)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ZoneCard({ z, selected, dirty, busy, onSave, onMeta }: {
  z: ZoneOpt; selected: boolean; dirty: boolean; busy: boolean;
  onSave: () => void; onMeta: (p: Partial<ZoneOpt>) => void;
}) {
  const [hoods, setHoods] = useState(z.neighborhoods.join(', '));
  return (
    <div className={`card space-y-2 border-l-4 ${selected ? 'ring-2 ring-ink/30' : ''}`} style={{ borderLeftColor: z.color }}>
      <div className="flex items-center justify-between gap-2">
        <input className="input h-9 font-semibold" defaultValue={z.name} onBlur={(e) => e.target.value !== z.name && onMeta({ name: e.target.value })} />
        <input type="color" defaultValue={z.color} onBlur={(e) => e.target.value !== z.color && onMeta({ color: e.target.value })} />
      </div>
      <p className="text-xs text-muted">{z.code}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={z.active} onChange={(e) => onMeta({ active: e.target.checked })} /> Zone active (desservie)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={z.allow_overflow} onChange={(e) => onMeta({ allow_overflow: e.target.checked })} /> Débordement autorisé (vague 3, 3 km)</label>
      <textarea className="input h-16 py-2" value={hoods} onChange={(e) => setHoods(e.target.value)} placeholder="Quartiers, séparés par des virgules" />
      <div className="flex gap-2">
        <button className="btn-sm bg-surface" onClick={() => rpc('admin_set_neighborhoods', { p_zone: z.id, p_names: hoods.split(',').map((s) => s.trim()).filter(Boolean) })}>Enregistrer les quartiers</button>
        {dirty ? <button className="btn-sm bg-accent text-white" disabled={busy} onClick={onSave}>Enregistrer le contour</button> : null}
      </div>
    </div>
  );
}
