'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Device = 'android' | 'iphone' | 'desktop' | null;

function detect(): Device {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iphone';
  return 'desktop';
}

function size(b: number | null): string {
  if (!b) return '—';
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export function DownloadChooser(props: {
  apkPath: string; version: string | null; publishedAt: string | null; sizeBytes: number | null; sha256: string | null; siteUrl: string;
}) {
  const [device, setDevice] = useState<Device>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const d = detect();
    setDevice(d);
    if (d === 'desktop') {
      QRCode.toDataURL(`${props.siteUrl}/telecharger`, { margin: 1, width: 220 }).then(setQr);
    }
  }, [props.siteUrl]);

  const meta = (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted">Version</dt><dd>{props.version ?? '—'}</dd>
      <dt className="text-muted">Date</dt><dd>{props.publishedAt ? new Date(props.publishedAt).toLocaleDateString('fr-FR') : '—'}</dd>
      <dt className="text-muted">Taille</dt><dd>{size(props.sizeBytes)}</dd>
      <dt className="text-muted">SHA-256</dt><dd className="break-all font-mono text-[11px]">{props.sha256 ?? '—'}</dd>
    </dl>
  );

  return (
    <div className="card space-y-5">
      {device === 'iphone' ? (
        <>
          <p className="text-lg">Sur iPhone, Koursa s’utilise comme une application web, sans App Store.</p>
          <a href="/app" className="btn-primary w-full">Ouvrir l’application web</a>
          <p className="text-sm text-muted">Puis « Partager → Sur l’écran d’accueil » (voir ci-dessous).</p>
        </>
      ) : device === 'android' ? (
        <>
          <a href={props.apkPath} className="btn-primary w-full">Télécharger pour Android</a>
          <a href="/app" className="btn-secondary w-full">Ou utiliser sans installer</a>
          {meta}
        </>
      ) : device === 'desktop' ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {qr ? <img src={qr} alt="QR code vers la page de téléchargement" width={220} height={220} className="rounded-xl" /> : <div className="h-[220px] w-[220px] rounded-xl bg-surface" />}
          <div className="space-y-3">
            <p className="text-lg font-semibold">Scannez avec votre téléphone</p>
            <p className="text-muted">Le QR code ouvre cette page sur votre téléphone, avec le bon bouton (Android ou iPhone).</p>
            <a href={props.apkPath} className="text-sm underline">Télécharger l’APK quand même</a>
            {meta}
          </div>
        </div>
      ) : (
        <div className="h-14 animate-pulse rounded-xl bg-surface" />
      )}
    </div>
  );
}
