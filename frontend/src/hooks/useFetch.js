import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useFetch(path) {
  const [state, setState] = useState({
    data: null,
    error: null,
    resolvedPath: null,
  });
  const [tick, setTick] = useState(0);

  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let active = true;
    api(path)
      .then(
        (d) =>
          active &&
          setState({ data: d, error: null, resolvedPath: path }),
      )
      .catch(
        (e) =>
          active &&
          setState({ data: null, error: e, resolvedPath: path }),
      );
    return () => {
      active = false;
    };
  }, [path, tick]);

  const loading = state.resolvedPath !== path;
  return { data: state.data, error: state.error, loading, reload };
}
