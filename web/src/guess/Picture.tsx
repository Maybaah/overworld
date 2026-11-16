import { useEffect, useState } from 'react';
import { loadGameDetail } from '../data/loader';

const BASE = 'https://images.igdb.com/igdb/image/upload/';

type Source = { kind: 'loading' } | { kind: 'shot'; id: string } | { kind: 'cover' } | { kind: 'none' };

export function Picture({ gameId, cover }: { gameId: number; cover: string }) {
  const [source, setSource] = useState<Source>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setSource({ kind: 'loading' });
    loadGameDetail(gameId)
      .then((detail) => {
        if (!live) return;
        const shot = detail.screenshots[0];
        setSource(shot ? { kind: 'shot', id: shot } : { kind: 'cover' });
      })
      .catch(() => {
        if (live) setSource({ kind: 'cover' });
      });
    return () => {
      live = false;
    };
  }, [gameId]);

  const failed = () => setSource((s) => (s.kind === 'shot' ? { kind: 'cover' } : { kind: 'none' }));

  let src: string | null = null;
  if (source.kind === 'shot') src = `${BASE}t_screenshot_big/${source.id}.jpg`;
  else if (source.kind === 'cover') src = `${BASE}t_cover_big/${cover}.jpg`;

  return (
    <div className="gs-picture" data-kind={source.kind}>
      {src ? (
        <img key={src} src={src} alt="Picture from the game to place" onError={failed} />
      ) : (
        <p className="gs-muted" role={source.kind === 'none' ? 'alert' : 'status'}>
          {source.kind === 'none' ? 'Picture unavailable' : 'Loading picture…'}
        </p>
      )}
    </div>
  );
}
