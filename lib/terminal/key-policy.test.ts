import assert from "node:assert/strict";
import test from "node:test";
import { shouldBlockBrowserDefault, terminalKeyAction, type TerminalKeyEvent } from "./key-policy";

function press(key: string, modifiers: Partial<TerminalKeyEvent> = {}): TerminalKeyEvent {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

test("both paste shortcuts paste, and Ctrl+C stays SIGINT", () => {
  assert.equal(terminalKeyAction(press("v", { ctrlKey: true })), "paste");
  assert.equal(terminalKeyAction(press("V", { ctrlKey: true, shiftKey: true })), "paste");
  assert.equal(terminalKeyAction(press("C", { ctrlKey: true, shiftKey: true })), "copy");
  assert.equal(terminalKeyAction(press("c", { ctrlKey: true })), "none");
});

test("macOS keeps Cmd+C and Cmd+V", () => {
  assert.equal(terminalKeyAction(press("c", { metaKey: true }), true), "copy");
  assert.equal(terminalKeyAction(press("v", { metaKey: true }), true), "paste");
  assert.equal(terminalKeyAction(press("v", { ctrlKey: true }), true), "none");
  assert.equal(terminalKeyAction(press("c", { ctrlKey: true }), true), "none");
});

test("font size shortcuts replace browser zoom", () => {
  assert.equal(terminalKeyAction(press("=", { ctrlKey: true })), "font-in");
  assert.equal(terminalKeyAction(press("-", { ctrlKey: true })), "font-out");
  assert.equal(terminalKeyAction(press("0", { ctrlKey: true })), "font-reset");
  assert.equal(terminalKeyAction(press("0")), "none");
});

test("modifier combos are blocked so the browser stops acting on them", () => {
  for (const key of ["s", "p", "f", "d", "o", "u", "r", "g", "=", "-"]) {
    assert.equal(shouldBlockBrowserDefault(press(key, { ctrlKey: true })), true, `Ctrl+${key}`);
  }
  assert.equal(shouldBlockBrowserDefault(press("ArrowLeft", { altKey: true })), true);
});

test("plain typing and the escape hatches stay with xterm or the browser", () => {
  assert.equal(shouldBlockBrowserDefault(press("a")), false);
  assert.equal(shouldBlockBrowserDefault(press("Enter")), false);
  assert.equal(shouldBlockBrowserDefault(press("F11")), false);
  assert.equal(shouldBlockBrowserDefault(press("F12")), false);
  assert.equal(shouldBlockBrowserDefault(press("Escape")), false);
  assert.equal(shouldBlockBrowserDefault(press("I", { ctrlKey: true, shiftKey: true })), false);
});

test("AltGr characters are not swallowed", () => {
  assert.equal(shouldBlockBrowserDefault(press("€", { ctrlKey: true, altKey: true })), false);
  assert.equal(shouldBlockBrowserDefault(press("ArrowUp", { ctrlKey: true, altKey: true })), true);
});
