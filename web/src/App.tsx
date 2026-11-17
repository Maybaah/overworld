import { useEffect } from 'react';
import { useStore } from './data/store';
import { GlobeView } from './globe/GlobeView';
import { Loader } from './ui/Loader';
import { Overlay } from './ui/Overlay';
import { useUrlState } from './share/urlState';

export function App() {
  const status = useStore((s) => s.status);
  const meta = useStore((s) => s.meta);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  useUrlState();

  return (
    <>
      {status === 'ready' && meta && (
        <>
          <GlobeView />
          <Overlay />
        </>
      )}
      <Loader />
    </>
  );
}
