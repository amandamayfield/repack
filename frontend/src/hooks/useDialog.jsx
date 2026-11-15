import { useCallback, useState } from "react";
import Dialog from "../components/Dialog";

// Promise-based, in-app replacement for window.confirm / window.alert:
//
//   const { confirm, alert, dialog } = useDialog();
//   if (!(await confirm({ title: "Delete trip?", message: "..." }))) return;
//   ...
//   return <>{dialog}...</>;
export function useDialog() {
  const [request, setRequest] = useState(null); // { options, resolve }

  const open = useCallback(
    (options) => new Promise((resolve) => setRequest({ options, resolve })),
    [],
  );
  const confirm = useCallback(
    (options) => open({ confirmLabel: "Delete", ...options, kind: "confirm" }),
    [open],
  );
  const alert = useCallback(
    (options) => open({ confirmLabel: "OK", ...options, kind: "alert" }),
    [open],
  );

  function settle(result) {
    request.resolve(result);
    setRequest(null);
  }

  const dialog = request && (
    <Dialog
      {...request.options}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, alert, dialog };
}
