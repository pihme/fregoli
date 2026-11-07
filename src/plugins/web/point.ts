export type PickEl = {
  tag: string;
  id: string;
  role: string;
  label: string;
  heading: string;
  nth: number;
  inAssistant: boolean;
  parent: PickEl | null;
};

export type Point = {
  selector: string;
  role: string;
  name: string;
  text: string;
  context: string;
};

const CONTROLS = new Set(["button", "a", "input", "textarea", "select", "label", "summary"]);
const CONTROL_ROLES = new Set([
  "button",
  "link",
  "tab",
  "menuitem",
  "option",
  "checkbox",
  "switch",
  "radio",
]);
const DECORATIVE = new Set([
  "span",
  "i",
  "b",
  "em",
  "strong",
  "small",
  "svg",
  "path",
  "circle",
  "rect",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "g",
  "use",
]);

export function clipText(value: string, max = 80): string {
  const text = value.replace(/\s+/g, " ").replace(/"/g, "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function isControl(node: PickEl): boolean {
  return CONTROLS.has(node.tag) || CONTROL_ROLES.has(node.role);
}

/** Prefer the control a person would name. `sole` is the only control inside a decorative box. */
export function chooseTarget(hit: PickEl | null, sole: PickEl | null = null): PickEl | null {
  if (!hit || hit.inAssistant) return null;
  for (let node: PickEl | null = hit; node; node = node.parent) {
    if (node.inAssistant) return null;
    if (node.tag === "html" || node.tag === "body") break;
    if (isControl(node)) return node;
  }
  if (sole && !sole.inAssistant) return sole;
  for (let node: PickEl | null = hit; node; node = node.parent) {
    if (node.tag === "html" || node.tag === "body" || node.id === "canvas") break;
    if (DECORATIVE.has(node.tag) && !node.label && !node.heading) continue;
    if (!node.label && !node.id && !node.heading && node.parent && node.parent.id !== "canvas") continue;
    return node;
  }
  return hit.id === "canvas" ? null : hit;
}

function humanRole(node: PickEl): string {
  if (node.role === "button" || node.tag === "button") return "button";
  if (node.role === "link" || node.tag === "a") return "link";
  if (node.tag === "textarea") return "text field";
  if (node.tag === "select") return "dropdown";
  if (node.tag === "input") {
    if (node.role === "checkbox" || node.role === "radio") return node.role;
    return "text field";
  }
  if (node.tag === "img") return "image";
  if (node.tag === "h1" || node.tag === "h2" || node.tag === "h3") return "heading";
  if (node.tag === "section" || node.tag === "article" || node.heading) return "section";
  if (node.role) return node.role;
  if (node.tag === "p" || node.tag === "li" || node.tag === "div") return "text";
  return node.tag;
}

function cssId(id: string): string {
  return /^[A-Za-z][\w-]*$/.test(id) ? "#" + id : "#" + id.replace(/[^A-Za-z0-9_-]/g, "");
}

export function selectorOf(node: PickEl): string {
  const parts: string[] = [];
  for (let current: PickEl | null = node; current; current = current.parent) {
    if (current.tag === "html" || current.tag === "body") break;
    if (current.id) {
      parts.unshift(cssId(current.id));
      break;
    }
    let part = current.tag;
    if (current.nth > 1) part += ":nth-of-type(" + current.nth + ")";
    parts.unshift(part);
    if (current.id === "canvas") break;
  }
  return parts.join(" > ");
}

export function describeTarget(node: PickEl): Point {
  const role = humanRole(node);
  const name = node.label || node.heading || node.id || role;
  let context = "";
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.id === "canvas" || parent.tag === "body") break;
    if (parent.heading) {
      context = parent.heading;
      break;
    }
    if ((parent.tag === "section" || parent.tag === "article" || parent.role === "region") && parent.label) {
      context = parent.label;
      break;
    }
  }
  return {
    selector: selectorOf(node),
    role,
    name,
    text: node.label,
    context,
  };
}

export function markLabel(point: Point): string {
  const role = point.role.charAt(0).toUpperCase() + point.role.slice(1);
  if (!point.name || point.name.toLowerCase() === point.role.toLowerCase()) return role;
  return role + " · " + point.name;
}

export function promptLine(point: Point): string {
  const role = clipText(point.role || "element", 40) || "element";
  const name = clipText(point.name || "", 80);
  const context = clipText(point.context || "", 80);
  const selector = clipText(point.selector || "", 180);
  let line = "The user pointed at a " + role;
  if (name) line += ' named "' + name + '"';
  if (context) line += ' inside "' + context + '"';
  if (selector) line += " (" + selector + ")";
  return line + ".";
}

export function pointClientSource(): string {
  return [
    `const CONTROLS = new Set(${JSON.stringify([...CONTROLS])});`,
    `const CONTROL_ROLES = new Set(${JSON.stringify([...CONTROL_ROLES])});`,
    `const DECORATIVE = new Set(${JSON.stringify([...DECORATIVE])});`,
    isControl.toString(),
    chooseTarget.toString(),
    humanRole.toString(),
    cssId.toString(),
    selectorOf.toString(),
    describeTarget.toString(),
    markLabel.toString(),
    clipText.toString(),
  ].join("\n");
}

export function cleanPoint(value: unknown): Point | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const role = clipText(typeof raw.role === "string" ? raw.role : "", 40);
  const name = clipText(typeof raw.name === "string" ? raw.name : "", 80);
  const text = clipText(typeof raw.text === "string" ? raw.text : "", 80);
  const context = clipText(typeof raw.context === "string" ? raw.context : "", 80);
  const selector = clipText(typeof raw.selector === "string" ? raw.selector : "", 180);
  if (!role && !name && !selector) return null;
  return { role: role || "element", name, text, context, selector };
}
