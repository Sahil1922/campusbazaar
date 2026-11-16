import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks { data, error, loading }. `reload` re-runs it.
 * Results from an outdated call are ignored, so fast changes (e.g. filters) can't show stale data.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const callId = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller passes the loader's dependencies.
  const run = useCallback(loader, deps);

  const reload = useCallback(() => {
    const id = ++callId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(run)
      .then(
        (data) => id === callId.current && setState({ data, error: null, loading: false }),
        (error) => id === callId.current && setState({ data: null, error, loading: false }),
      );
  }, [run]);

  useEffect(reload, [reload]);
  return { ...state, reload, setData: (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })) };
}
