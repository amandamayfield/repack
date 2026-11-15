import "@testing-library/jest-dom";

// jsdom doesn't implement <dialog>'s modal API. Mimic just enough of it: the
// `open` attribute toggles, and close() fires "close" like a browser would.
const dialogProto = (globalThis.HTMLDialogElement ?? HTMLElement).prototype;
if (!dialogProto.showModal) {
  dialogProto.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  dialogProto.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  if (!("open" in dialogProto)) {
    Object.defineProperty(dialogProto, "open", {
      configurable: true,
      get() {
        return this.hasAttribute("open");
      },
    });
  }
}

// Node 25+ has its own experimental localStorage global, undefined unless Node
// runs with --localstorage-file, and it shadows jsdom's. Put jsdom's back.
/* global jsdom -- the jsdom instance Vitest's jsdom environment exposes */
if (typeof localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: jsdom.window.localStorage,
  });
}
