// Non-normative preview: the playground acting as a Milano consumer with a
// tiny web design system. It walks the resolved tree the reference checker
// produced (exactly what a real renderer receives) and emits standard DOM.
// Components matching the documented sample vocabulary render as real
// controls; everything else renders as a wireframe box showing the resolved
// values. Static by design: the checker implements the gate and expressions,
// not the runtime dispatch loop, so clicks report the bound actions as data
// instead of simulating state mutation.

export interface ResolvedNode {
  type: string;
  reference: string;
  placeholder?: boolean;
  properties?: Record<string, unknown>;
  children?: ResolvedNode[];
}

/** node reference -> its event bindings, described and in full */
export interface NodeBindings {
  described: string[];
  raw: Record<string, unknown>;
}
export type EventBindings = Map<string, NodeBindings>;

interface RawNode {
  type?: string;
  id?: string;
  children?: RawNode[];
  on?: Record<string, unknown>;
}

function describeActions(binding: unknown): string {
  const list = Array.isArray(binding) ? binding : [binding];
  const names = list
    .map((action) =>
      action && typeof action === "object" ? String((action as Record<string, unknown>).action) : "?"
    )
    .join(", ");
  return names;
}

/**
 * Collect event bindings by the same reference rule the checker uses
 * (id when present, canonical path otherwise). The checker computes child
 * paths from original indices even under the skip policy, so these
 * references line up with the resolved tree.
 */
export function collectBindings(documentJson: unknown): EventBindings {
  const bindings: EventBindings = new Map();
  const root = (documentJson as { root?: RawNode })?.root;
  if (!root) return bindings;

  const walk = (node: RawNode, path: string) => {
    const reference = node.id ?? path;
    if (node.on && typeof node.on === "object") {
      const described = Object.entries(node.on).map(
        ([event, actions]) => `${event} → ${describeActions(actions)}`
      );
      if (described.length > 0) {
        bindings.set(reference, { described, raw: node.on as Record<string, unknown> });
      }
    }
    (node.children ?? []).forEach((child, index) => walk(child, `${path}/children[${index}]`));
  };
  walk(root, "root");
  return bindings;
}

const text = (value: unknown): string => (value == null ? "" : String(value));

function wireframe(node: ResolvedNode, children: HTMLElement[]): HTMLElement {
  const box = document.createElement("div");
  box.className = "pv-wire";
  const header = document.createElement("div");
  header.className = "pv-wire-header";
  header.textContent = `${node.type} · ${node.reference}`;
  box.appendChild(header);
  const properties = node.properties ?? {};
  for (const [name, value] of Object.entries(properties)) {
    const row = document.createElement("div");
    row.className = "pv-wire-row";
    row.textContent = `${name}: ${JSON.stringify(value)}`;
    box.appendChild(row);
  }
  for (const child of children) box.appendChild(child);
  return box;
}

export interface PreviewHandlers {
  /** A bound but non-interactive node was clicked: report its bindings. */
  onInfo(reference: string, binding: NodeBindings): void;
  /** A control emitted a declared event, like a renderer would. */
  onEvent(reference: string, event: string, payload: unknown): void;
}

function render(
  node: ResolvedNode,
  bindings: EventBindings,
  handlers: PreviewHandlers
): HTMLElement {
  const children = (node.children ?? []).map((child) => render(child, bindings, handlers));
  const properties = node.properties ?? {};
  let element: HTMLElement;

  if (node.placeholder) {
    element = document.createElement("div");
    element.className = "pv-placeholder";
    element.textContent = `${node.type} (placeholder)`;
  } else {
    switch (node.type) {
      case "Column": {
        element = document.createElement("div");
        element.className = "pv-column";
        for (const child of children) element.appendChild(child);
        break;
      }
      case "Row": {
        element = document.createElement("div");
        element.className = "pv-row";
        for (const child of children) element.appendChild(child);
        break;
      }
      case "Text": {
        element = document.createElement("div");
        const role = text(properties.role);
        element.className =
          role === "title" ? "pv-text pv-title" : role === "subtitle" ? "pv-text pv-subtitle" : "pv-text";
        element.textContent = text(properties.text);
        break;
      }
      case "Button": {
        const button = document.createElement("button");
        button.className = "pv-button";
        button.textContent = text(properties.label);
        if (properties.enabled === false) button.disabled = true;
        button.addEventListener("click", () =>
          handlers.onEvent(node.reference, "tap", undefined)
        );
        element = button;
        break;
      }
      case "Checkbox": {
        const label = document.createElement("label");
        label.className = "pv-field pv-inline";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = properties.checked === true;
        input.addEventListener("change", () =>
          handlers.onEvent(node.reference, "change", input.checked)
        );
        label.append(input, document.createTextNode(text(properties.label)));
        element = label;
        break;
      }
      case "TextField":
      case "NumberField": {
        const label = document.createElement("label");
        label.className = "pv-field";
        const caption = document.createElement("span");
        caption.textContent = text(properties.label);
        const input = document.createElement("input");
        const numeric = node.type === "NumberField";
        input.type = numeric ? "number" : "text";
        input.value = text(properties.value);
        input.addEventListener("change", () =>
          handlers.onEvent(node.reference, "change", numeric ? Number(input.value) || 0 : input.value)
        );
        label.append(caption, input);
        element = label;
        break;
      }
      case "Banner": {
        element = document.createElement("div");
        element.className = "pv-banner";
        const url = text(properties.backgroundImageUrl);
        if (url) element.style.backgroundImage = `url(${JSON.stringify(url)})`;
        if (typeof properties.height === "number") element.style.minHeight = `${properties.height}px`;
        if (typeof properties.cornerRadius === "number") {
          element.style.borderRadius = `${properties.cornerRadius}px`;
        }
        const content = document.createElement("div");
        content.className = properties.showScrim === true ? "pv-banner-content pv-scrim" : "pv-banner-content";
        for (const child of children) content.appendChild(child);
        element.appendChild(content);
        break;
      }
      default:
        element = wireframe(node, children);
    }
  }

  // This design system interprets `visible` the way the SDK samples' do:
  // a resolved false hides the element. Flip the state values feeding the
  // expression to watch it appear.
  if (properties.visible === false) element.style.display = "none";

  const interactive = ["Button", "Checkbox", "TextField", "NumberField"].includes(node.type);
  const binding = bindings.get(node.reference);
  if (binding && !interactive && !node.placeholder) {
    element.classList.add("pv-bound");
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onInfo(node.reference, binding);
    });
  }
  return element;
}

export function renderPreview(
  view: ResolvedNode,
  bindings: EventBindings,
  container: HTMLElement,
  handlers: PreviewHandlers
): void {
  container.replaceChildren();
  const caption = document.createElement("div");
  caption.className = "pv-caption";
  caption.textContent = "Non-normative preview: your design system draws the real thing.";
  container.appendChild(caption);
  container.appendChild(render(view, bindings, handlers));
}
