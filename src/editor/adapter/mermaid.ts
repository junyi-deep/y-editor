import chatgptIcon from "../../assets/icons/chatgpt.svg";
let sequence = 0;
let rendering = Promise.resolve();
interface DiagramState {
  source: string;
  generation: number;
  status: "waiting" | "queued" | "ready" | "error";
  theme: boolean;
}
export function createMermaidRenderer(
  dark: () => boolean,
  autoRender: () => boolean = () => true,
  hooks: {
    reference?: (source: string, host: HTMLElement) => void;
    immersive?: (active: boolean) => void;
    changed?: () => void;
    source?: (host: HTMLElement) => string;
    edit?: (host: HTMLElement) => void;
    update?: (host: HTMLElement, source: string) => void;
    /** True while the diagram's Markdown source is open for editing. */
    editing?: (host: HTMLElement) => boolean;
    readonly?: () => boolean;
  } = {},
) {
  const origins = new WeakMap<HTMLElement, HTMLElement>();
  const states = new Map<HTMLElement, DiagramState>();
  const dialogs = new Set<HTMLDialogElement>();
  const sizes = new Map<HTMLElement, ResizeObserver>();
  function releaseSize(host: HTMLElement) {
    sizes.get(host)?.disconnect();
    sizes.delete(host);
  }
  let disposed = false;
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const host = entry.target as HTMLElement;
          const state = states.get(host);
          if (state?.status === "waiting") {
            observer.unobserve(host);
            void draw(host, state);
          }
        }
      }),
    { rootMargin: "240px" },
  );
  function edit(host: HTMLElement) {
    if (hooks.readonly?.()) return;
    hooks.edit?.(host);
  }
  function isolate(host: HTMLElement) {
    host.contentEditable = "false";
    for (const type of ["mousedown", "click", "pointerdown"])
      host.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === "mousedown" || type === "click") event.preventDefault();
      });
    host.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      edit(host);
    });
  }
  async function png(svg: string): Promise<Blob> {
    const image = new Image();
    // A self-contained data SVG remains origin-clean with Mermaid foreignObject labels.
    // Blob SVGs containing those labels taint Canvas in Chromium/WebKit.
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = parsed.documentElement;
    const box = root.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
    if (box?.length === 4 && box.every(Number.isFinite)) {
      root.setAttribute("width", String(Math.max(1, box[2])));
      root.setAttribute("height", String(Math.max(1, box[3])));
    }
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("无法绘制 PNG"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      const ratio = Math.min(
        2,
        4096 / Math.max(image.width || 800, image.height || 600),
      );
      canvas.width = (image.width || 800) * ratio;
      canvas.height = (image.height || 600) * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 不可用");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("无法生成 PNG"))),
          "image/png",
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function controls(host: HTMLElement, svg: string, presentation = false) {
    releaseSize(host);
    const viewport = document.createElement("div");
    viewport.className = "diagram-viewport";
    const stage = document.createElement("div");
    stage.className = "diagram-stage";
    stage.innerHTML = svg;
    viewport.append(stage);
    host.replaceChildren(viewport);
    const bar = document.createElement("div");
    bar.className = "diagram-controls";
    host.append(bar);
    let scale = 1,
      x = 0,
      y = 0;
    const vector = stage.querySelector("svg");
    const box = vector?.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
    const width = box?.[2] || Number(vector?.getAttribute("width")) || 800;
    const height = box?.[3] || Number(vector?.getAttribute("height")) || 600;
    const transform = () => {
      const available = viewport.clientWidth || width;
      const fit = Math.min(
        1,
        available / width,
        (window.innerHeight * 0.7) / height,
      );
      // Resize vector geometry so WebKit rerasterizes labels at every zoom level.
      // A CSS scale on a composited layer merely magnifies its old bitmap.
      if (vector) {
        vector.style.width = `${width * fit * scale}px`;
        vector.style.height = `${height * fit * scale}px`;
        vector.style.maxWidth = "none";
        vector.style.maxHeight = "none";
      }
      if (!presentation)
        viewport.style.height = `${Math.max(120, height * fit)}px`;
      stage.style.transform = `translate(${x}px,${y}px)`;
      stage.dataset.zoom = String(scale);
    };
    const size = new ResizeObserver(transform);
    size.observe(viewport);
    sizes.set(host, size);
    transform();
    let drag:
      | { x: number; y: number; fromX: number; fromY: number }
      | undefined;
    viewport.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        scale = Math.max(0.2, Math.min(6, scale * Math.exp(-e.deltaY * 0.005)));
        transform();
      },
      { passive: false },
    );
    viewport.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, fromX: x, fromY: y };
      viewport.setPointerCapture?.(e.pointerId);
      viewport.classList.add("dragging");
    };
    viewport.onpointermove = (e) => {
      if (drag) {
        x = drag.fromX + e.clientX - drag.x;
        y = drag.fromY + e.clientY - drag.y;
        transform();
      }
    };
    const release = () => {
      drag = undefined;
      viewport.classList.remove("dragging");
    };
    viewport.onpointerup = release;
    viewport.onpointercancel = release;
    const add = (label: string, action: () => void | Promise<void>) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title =
        label === "关闭"
          ? "关闭 · Esc"
          : ["+", "−"].includes(label)
            ? `${label === "+" ? "放大" : "缩小"} · Ctrl+滚轮`
            : `${label} · 未设置快捷键`;
      button.setAttribute("aria-label", label);
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          Promise.resolve(action()).catch((error) => {
            button.title = String(error);
            button.textContent = "复制失败";
          });
        } catch (error) {
          button.title = String(error);
          button.textContent = "复制失败";
        }
      };
      bar.append(button);
      return button;
    };
    add("−", () => {
      scale = Math.max(0.2, scale - 0.2);
      transform();
    });
    add("+", () => {
      scale = Math.min(6, scale + 0.2);
      transform();
    });
    add("重置", () => {
      scale = 1;
      x = 0;
      y = 0;
      transform();
    });
    add("复制 SVG", () => navigator.clipboard.writeText(svg));
    add("复制 PNG", () => {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("当前系统不支持复制 PNG");
      return navigator.clipboard.write([
        new ClipboardItem({ "image/png": png(svg) }),
      ]);
    });
    if (!presentation) {
      add("演示", () => present(svg));
      const reference = add("引用到 AI", () =>
        hooks.reference?.(
          states.get(host)?.source ?? "",
          origins.get(host) ?? host,
        ),
      );
      reference.replaceChildren();
      const icon = document.createElement("img");
      icon.src = chatgptIcon;
      icon.width = 16;
      icon.height = 16;
      icon.alt = "引用到 AI";
      reference.append(icon);
      if (!origins.has(host)) add("沉浸编辑", () => immersive(host));
      const hint = document.createElement("small");
      hint.className = "diagram-hint";
      hint.textContent = "双击进行编辑";
      host.append(hint);
    } else
      add("关闭", () => {
        (host as HTMLDialogElement).close();
      });
  }
  let immersion: HTMLDivElement | undefined;
  let cleanupImmersion: (() => void) | undefined;
  function immersive(host: HTMLElement) {
    if (hooks.readonly?.()) return;
    cleanupImmersion?.();
    if (!hooks.source) return;
    const panel = document.createElement("div");
    panel.className = "diagram-immersive";
    immersion = panel;
    const editorHost = document.querySelector<HTMLElement>(".editor-host");
    if (editorHost) editorHost.style.visibility = "hidden";
    const source = document.createElement("textarea");
    source.value = hooks.source(host);
    source.setAttribute("aria-label", "Mermaid 沉浸源码");
    source.spellcheck = false;
    const divider = document.createElement("div");
    divider.className = "resize-handle";
    const preview = document.createElement("div");
    preview.className = "immersive-preview";
    origins.set(preview, host);
    const exit = document.createElement("button");
    exit.textContent = "完成";
    exit.className = "immersive-exit";
    panel.append(source, divider, preview, exit);
    document.querySelector(".editor-column")?.append(panel);
    hooks.immersive?.(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const renderPreview = () => {
      const state: DiagramState = {
        source: source.value,
        generation: 0,
        status: "waiting",
        theme: dark(),
      };
      states.set(preview, state);
      void draw(preview, state);
    };
    renderPreview();
    source.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(renderPreview, 350);
    };
    divider.onpointerdown = (e) => {
      e.preventDefault();
      divider.setPointerCapture(e.pointerId);
      divider.onpointermove = (event) => {
        const rect = panel.getBoundingClientRect();
        panel.style.gridTemplateColumns = `${Math.max(15, Math.min(75, ((event.clientX - rect.left) / rect.width) * 100))}% 5px 1fr`;
      };
      divider.onpointerup = () => {
        divider.onpointermove = null;
      };
    };
    cleanupImmersion = () => {
      clearTimeout(timer);
      states.delete(preview);
      releaseSize(preview);
      panel.remove();
      if (editorHost) editorHost.style.visibility = "";
      immersion = undefined;
      cleanupImmersion = undefined;
      hooks.immersive?.(false);
    };
    exit.title = "完成 · Esc";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Mermaid 沉浸编辑");
    panel.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exit.click();
      }
    };
    source.focus();
    exit.onclick = () => {
      hooks.update?.(host, source.value);
      hooks.changed?.();
      cleanupImmersion?.();
      const state: DiagramState = {
        source: source.value,
        generation: 0,
        status: "waiting",
        theme: dark(),
      };
      states.set(host, state);
      host.hidden = false;
      void draw(host, state);
    };
  }
  function present(svg: string) {
    const dialog = document.createElement("dialog");
    dialog.className = "diagram-presentation";
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (shell) {
      const style = getComputedStyle(shell);
      // A dialog outside the shell inherits nothing, so copy every app token:
      // colours, radii, shadows and the backdrop all resolve from here.
      for (const key of Array.from(style))
        if (key.startsWith("--y-"))
          dialog.style.setProperty(key, style.getPropertyValue(key));
    }
    dialogs.add(dialog);
    document.body.append(dialog);
    controls(dialog, svg, true);
    document.documentElement.classList.add("diagram-presenting");
    dialog.onclose = () => {
      releaseSize(dialog);
      dialogs.delete(dialog);
      dialog.remove();
      if (!dialogs.size)
        document.documentElement.classList.remove("diagram-presenting");
    };
    dialog.showModal();
  }
  async function draw(host: HTMLElement, state: DiagramState) {
    // A theme change re-renders every diagram; keep the ones whose source is
    // open behind their editor instead of covering it.
    if (!immersion && hooks.editing?.(host)) {
      host.hidden = true;
      state.status = "waiting";
      return;
    }
    host.hidden = false;
    const generation = ++state.generation;
    state.status = "queued";
    state.theme = dark();
    host.textContent = "正在绘制图表…";
    rendering = rendering
      .catch(() => {})
      .then(async () => {
        if (
          disposed ||
          !host.isConnected ||
          states.get(host) !== state ||
          state.generation !== generation
        )
          return;
        try {
          const { default: mermaid } = await import("mermaid");
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: state.theme ? "dark" : "default",
            maxTextSize: 200000,
            maxEdges: 5000,
          });
          const { svg } = await mermaid.render(
            `y-diagram-${++sequence}`,
            state.source,
          );
          if (
            disposed ||
            !host.isConnected ||
            states.get(host) !== state ||
            state.generation !== generation
          )
            return;
          state.status = "ready";
          controls(host, svg);
        } catch (error) {
          if (states.get(host) !== state || state.generation !== generation)
            return;
          state.status = "error";
          host.replaceChildren();
          const message = document.createElement("span");
          message.textContent = "图表绘制失败，请双击检查 Mermaid 代码。";
          message.title = String(error);
          host.append(message);
          const retry = document.createElement("button");
          retry.textContent = "重试";
          retry.onclick = (e) => {
            e.stopPropagation();
            void draw(host, state);
          };
          host.append(retry);
        }
      });
    await rendering;
  }
  return {
    render(host: HTMLElement) {
      const previous = states.get(host);
      const code =
        hooks.source?.(host) ??
        host.querySelector("code")?.textContent ??
        previous?.source ??
        host.textContent ??
        "";
      if (
        previous &&
        previous.source === code &&
        previous.theme === dark() &&
        previous.status !== "error" &&
        (previous.status === "queued" ||
          host.querySelector(".diagram-viewport,.diagram-render-large") ||
          host.textContent === "图表将在滚动到此处时渲染")
      )
        return;
      if (!previous) isolate(host);
      else observer.unobserve(host);
      const state: DiagramState = {
        source: code,
        generation: 0,
        status: "waiting",
        theme: dark(),
      };
      states.set(host, state);
      if (code.length > 5000 && !autoRender()) {
        state.status = "waiting";
        const button = document.createElement("button");
        button.className = "diagram-render-large";
        button.textContent = "点击渲染图表";
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          void draw(host, state);
        };
        host.replaceChildren(button);
      } else {
        host.textContent = "图表将在滚动到此处时渲染";
        observer.observe(host);
      }
    },
    forget(host: HTMLElement) {
      releaseSize(host);
      observer.unobserve(host);
      const state = states.get(host);
      if (state) state.generation++;
      states.delete(host);
    },
    refresh() {
      for (const [host, state] of states) {
        if (!host.isConnected) {
          releaseSize(host);
          states.delete(host);
          continue;
        }
        if (
          (state.status === "ready" &&
            (state.theme !== dark() || host.hidden)) ||
          (state.status === "waiting" && autoRender())
        )
          void draw(host, state);
      }
    },
    destroy() {
      disposed = true;
      cleanupImmersion?.();
      observer.disconnect();
      states.clear();
      for (const size of sizes.values()) size.disconnect();
      sizes.clear();
      for (const dialog of dialogs) dialog.remove();
      dialogs.clear();
      document.documentElement.classList.remove("diagram-presenting");
    },
  };
}
