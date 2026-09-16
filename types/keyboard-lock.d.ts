// Keyboard Lock API（Chrome、Edge 桌面版支持）：全屏时把 Ctrl+T、Ctrl+W 这类
// 浏览器保留快捷键交给页面。TypeScript 标准库还没收录，这里补上类型。
interface KeyboardLockApi {
  lock(keyCodes?: string[]): Promise<void>;
  unlock(): void;
}

interface Navigator {
  readonly keyboard?: KeyboardLockApi;
}
