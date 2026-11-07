import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTarget, cleanPoint, describeTarget, markLabel, promptLine, type PickEl } from "../src/plugins/web/point.ts";

function el(partial: Partial<PickEl> & Pick<PickEl, "tag">): PickEl {
  return {
    tag: partial.tag,
    id: partial.id ?? "",
    role: partial.role ?? "",
    label: partial.label ?? "",
    heading: partial.heading ?? "",
    nth: partial.nth ?? 0,
    inAssistant: partial.inAssistant ?? false,
    parent: partial.parent ?? null,
  };
}

test("a click inside a button selects the button", () => {
  const button = el({ tag: "button", label: "One", parent: el({ tag: "section", heading: "Card", id: "button-card" }) });
  const edge = el({ tag: "span", parent: button });
  const chosen = chooseTarget(edge);
  assert.equal(chosen, button);
  const point = describeTarget(chosen!);
  assert.equal(point.role, "button");
  assert.equal(point.name, "One");
  assert.equal(point.context, "Card");
  assert.equal(point.selector, "#button-card > button");
  assert.equal(markLabel(point), "Button · One");
});

test("a rounded box around one button selects that button", () => {
  const button = el({ tag: "button", label: "Dusk" });
  const edge = el({ tag: "span", parent: el({ tag: "div" }) });
  const chosen = chooseTarget(edge, button);
  assert.equal(chosen, button);
  assert.match(promptLine(describeTarget(chosen!)), /button named "Dusk"/);
});

test("a card with several buttons stays the card", () => {
  const card = el({ tag: "section", heading: "Light", id: "day-card" });
  const chosen = chooseTarget(el({ tag: "div", parent: card }));
  assert.equal(chosen, card);
  assert.equal(describeTarget(chosen!).name, "Light");
  assert.equal(describeTarget(chosen!).role, "section");
});

test("assistant chrome is not a target", () => {
  const input = el({ tag: "input", id: "assistant-input", inAssistant: true });
  assert.equal(chooseTarget(input), null);
});

test("cleanPoint drops anything that is not a short description", () => {
  assert.equal(cleanPoint(null), null);
  const point = cleanPoint({ role: "button", name: "One", context: "Card", selector: "#one", extra: "<script>" });
  assert.equal(point?.name, "One");
  assert.equal(promptLine(point!), 'The user pointed at a button named "One" inside "Card" (#one).');
});
