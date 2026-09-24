// jsdom has no layout or pointer capture; real browser checks cover geometry.
import { vi } from "vitest";
if (!Element.prototype.scrollIntoView)
  Element.prototype.scrollIntoView = vi.fn();
if (!Element.prototype.hasPointerCapture)
  Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture)
  Element.prototype.setPointerCapture = vi.fn();
if (!Element.prototype.releasePointerCapture)
  Element.prototype.releasePointerCapture = vi.fn();
if (!window.PointerEvent)
  window.PointerEvent = MouseEvent as typeof PointerEvent;

// Floating UI needs a layout engine. Only geometry is substituted; real Reka
// portals, focus scopes, selection and outside-interaction logic still run.
vi.mock("@floating-ui/vue", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const { ref } = await import("vue");
  return {
    ...original,
    useFloating: () => ({
      floatingStyles: ref({ position: "fixed", top: "0px", left: "0px" }),
      placement: ref("bottom"),
      isPositioned: ref(true),
      middlewareData: ref({}),
      update: vi.fn(),
    }),
  };
});

if (!globalThis.ResizeObserver)
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
