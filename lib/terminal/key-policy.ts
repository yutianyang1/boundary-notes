/**
 * 终端获得焦点时的按键归属：哪些由我们自己处理，哪些要拦掉浏览器的默认行为。
 *
 * 原则是终端接管一切，只留两类例外：
 * 1. 浏览器强制保留、网页拦不住的（Ctrl+T、Ctrl+W、F12 等），拦了也没用，不如别装作拦住；
 *    要拿到它们只能开全屏独占键盘。
 * 2. 用户的逃生键（F11 退全屏、Esc），必须留给浏览器。
 */

export type TerminalKeyAction = "copy" | "paste" | "font-in" | "font-out" | "font-reset" | "none";

export type TerminalKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function terminalKeyAction(event: TerminalKeyEvent, apple = false): TerminalKeyAction {
  const primary = apple ? event.metaKey : event.ctrlKey;
  if (!primary) return "none";
  const key = event.key.toLowerCase();
  // 粘贴：Ctrl+V 和 Ctrl+Shift+V 都算，走同一条路径，不会粘两遍。
  if (key === "v") return "paste";
  // 复制：Ctrl+Shift+C（macOS 另认 Cmd+C）。Ctrl+C 留给远端当中断信号，选区在松开鼠标时已经复制过了。
  if (key === "c" && (event.shiftKey || apple)) return "copy";
  if (event.shiftKey) return "none";
  if (key === "=" || key === "+") return "font-in";
  if (key === "-" || key === "_") return "font-out";
  if (key === "0") return "font-reset";
  return "none";
}

/** 这些组合浏览器不交给网页，preventDefault 无效。 */
function isBrowserReserved(event: TerminalKeyEvent) {
  const key = event.key.toLowerCase();
  if (key === "f11" || key === "f12" || key === "escape") return true;
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && (key === "i" || key === "j")) return true;
  return false;
}

/**
 * 是否要拦掉浏览器的默认行为。带修饰键的组合一律拦（Ctrl+S 存网页、Ctrl+P 打印、
 * Ctrl+F 页内查找、Ctrl+加减 缩放……全都归终端），普通键交给 xterm 自己处理。
 */
export function shouldBlockBrowserDefault(event: TerminalKeyEvent) {
  if (isBrowserReserved(event)) return false;
  // AltGr 在部分键盘布局上表现为 Ctrl+Alt，用来打 €、~ 这类字符，拦了就打不出字。
  if (event.ctrlKey && event.altKey && event.key.length === 1) return false;
  return event.ctrlKey || event.metaKey || event.altKey;
}
