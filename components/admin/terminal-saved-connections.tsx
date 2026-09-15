"use client";

import { Server, X } from "lucide-react";
import { connectionKey, connectionLabel, type SavedConnection } from "@/lib/terminal/saved-connections";

type Props = {
  connections: SavedConnection[];
  selectedKey: string;
  disabled: boolean;
  onPick: (connection: SavedConnection) => void;
  onDelete: (key: string) => void;
  onClear: () => void;
};

/** 连接表单顶部的常用连接列表：点一下填好表单，只差输入密码。 */
export function TerminalSavedConnections({ connections, selectedKey, disabled, onPick, onDelete, onClear }: Props) {
  if (connections.length === 0) return null;
  return (
    <div className="mb-5 border-b pb-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">常用连接</p>
        <button type="button" disabled={disabled} onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          填写新主机
        </button>
      </div>
      <ul className="mt-2 grid max-h-56 gap-1.5 overflow-y-auto">
        {connections.map((connection) => {
          const key = connectionKey(connection);
          const label = connectionLabel(connection);
          const selected = key === selectedKey;
          return (
            <li key={key} className={`flex items-stretch overflow-hidden rounded-md border ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/60"}`}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onPick(connection)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left disabled:opacity-50"
              >
                <Server className={`size-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {connection.authMethod === "key" ? "私钥登录" : "密码登录"}
                    {connection.fingerprint ? " · 指纹已记录" : ""}
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={`删除常用连接 ${label}`}
                title="删除"
                onClick={() => onDelete(key)}
                className="grid w-9 shrink-0 place-items-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
