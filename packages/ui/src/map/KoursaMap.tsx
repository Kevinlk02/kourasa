// Android : react-native-maps avec le fournisseur Google (clé Android dans app.config.ts).
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { MARKER_COLORS, type KoursaMapProps } from './types';

const DELTA_BY_ZOOM = (zoom: number) => 360 / 2 ** zoom;

export function KoursaMap({
  center, zoom = 15, markers = [], polygons = [], fitToMarkers, showsUserLocation, onCenterChange, style, bottomPadding = 0,
}: KoursaMapProps) {
  const ref = useRef<MapView>(null);
  const initialRegion = useMemo<Region>(() => ({
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: DELTA_BY_ZOOM(zoom),
    longitudeDelta: DELTA_BY_ZOOM(zoom),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => {
    if (fitToMarkers && markers.length > 1) {
      ref.current?.fitToCoordinates(markers.map((m) => ({ latitude: m.lat, longitude: m.lng })), {
        edgePadding: { top: 80, right: 60, bottom: bottomPadding + 60, left: 60 },
        animated: true,
      });
    } else if (!onCenterChange) {
      ref.current?.animateToRegion({ ...initialRegion, latitude: center.lat, longitude: center.lng }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToMarkers, markers.map((m) => `${m.id}:${m.lat.toFixed(5)},${m.lng.toFixed(5)}`).join('|'), center.lat, center.lng]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <MapView
        ref={ref}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        mapPadding={{ top: 0, right: 0, bottom: bottomPadding, left: 0 }}
        onRegionChangeComplete={(r) => onCenterChange?.({ lat: r.latitude, lng: r.longitude })}
      >
        {polygons.flatMap((p) =>
          p.rings.map((ring, i) => (
            <Polygon
              key={`${p.id}-${i}`}
              coordinates={ring.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
              strokeColor={p.color}
              fillColor={p.color + '22'}
              strokeWidth={2}
            />
          )),
        )}
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            pinColor={m.color ?? MARKER_COLORS[m.kind]}
            title={m.title}
            tracksViewChanges={false}
          />
        ))}
      </MapView>
    </View>
  );
}
