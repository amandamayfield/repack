import { useCallback, useState } from "react";
import Dialog from "../components/Dialog";

// Promise-based, in-app replacement for window.confirm / alert / prompt:
//
//   const { confirm, alert, prompt, dialog } = useDialog();
//   if (!(await confirm({ title: "Delete trip?", message: "..." }))) return;
//   const name = await prompt({ title: "Name it", label: "Name" }); // null on cancel
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
  const prompt = useCallback(
    (options) =>
      open({
        confirmLabel: "Save",
        initialValue: "",
        ...options,
        kind: "prompt",
      }),
    [open],
  );

  function settle(result) {
    request.resolve(result);
    setRequest(null);
  }

  const dialog = request && (
    <Dialog
      {...request.options}
      onConfirm={(value) =>
        settle(request.options.kind === "prompt" ? value : true)
      }
      onCancel={() => settle(request.options.kind === "prompt" ? null : false)}
    />
  );

  return { confirm, alert, prompt, dialog };
}
