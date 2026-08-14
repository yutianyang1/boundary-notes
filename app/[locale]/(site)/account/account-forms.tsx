"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import {
  changePasswordAction,
  revokeDeviceAction,
  revokeOtherDevicesAction,
  updateProfileAction,
  type AccountActionState,
} from "./actions";

const initialState: AccountActionState = {};
const inputClass = "mt-2 h-11 w-full rounded-md border bg-background px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30";
const primaryButtonClass = "h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";
const secondaryButtonClass = "h-10 rounded-md border bg-card px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

function ActionMessage({ state }: { state: AccountActionState }) {
  // 动作返回的是 account 命名空间下的 key，翻译在这里发生。
  const t = useTranslations("account");
  if (state.errorKey) {
    return <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{t(state.errorKey)}</p>;
  }
  if (state.successKey) {
    return <p role="status" className="rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{t(state.successKey, { count: state.count ?? 0 })}</p>;
  }
  return null;
}

export function ProfileForm({ name }: { name: string }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState(updateProfileAction, initialState);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-semibold">
        {t("nickname")}
        <input name="name" required maxLength={120} defaultValue={name} autoComplete="nickname" className={inputClass} />
      </label>
      <ActionMessage state={state} />
      <button disabled={pending} className={primaryButtonClass}>
        {pending ? t("saving") : t("saveProfile")}
      </button>
    </form>
  );
}

export function AvatarForm({ image, name }: { image: string | null; name: string }) {
  const t = useTranslations("account");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(image);
  const [message, setMessage] = useState<AccountActionState>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return setMessage({ errorKey: "errors.avatarMissing" });
    setPending(true);
    setMessage({});
    const formData = new FormData();
    formData.set("avatar", file);
    try {
      const response = await fetch("/api/account/avatar", { method: "POST", body: formData });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        setMessage({ errorKey: "errors.avatarFailed" });
        return;
      }
      setPreview(result.url);
      setMessage({ successKey: "avatarUpdated" });
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setMessage({ errorKey: "errors.avatarFailedRetry" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-4">
        {preview ? (
          <Image
            src={preview}
            alt={t("avatarAlt", { name })}
            width={64}
            height={64}
            unoptimized
            className="size-16 rounded-full border object-cover"
          />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-[conic-gradient(from_200deg,var(--primary),var(--warm))] text-xl font-bold text-white">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-semibold">
            {t("avatarFile")}
            <input
              ref={inputRef}
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
              className="mt-2 block w-full rounded-md text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2 file:font-semibold file:text-foreground"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">{t("avatarHint")}</p>
        </div>
      </div>
      <ActionMessage state={message} />
      <button disabled={pending} className={secondaryButtonClass}>
        {pending ? t("uploading") : t("uploadAvatar")}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState(changePasswordAction, initialState);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-semibold">
        {t("currentPassword")}
        <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      <label className="block text-sm font-semibold">
        {t("newPassword")}
        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        <span className="mt-2 block font-normal text-muted-foreground">{t("passwordHint")}</span>
      </label>
      <label className="block text-sm font-semibold">
        {t("confirmNewPassword")}
        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </label>
      <ActionMessage state={state} />
      <button disabled={pending} className={primaryButtonClass}>
        {pending ? t("updating") : t("changePassword")}
      </button>
    </form>
  );
}

export function RevokeDeviceForm({ sessionId }: { sessionId: string }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState(revokeDeviceAction, initialState);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <button disabled={pending} className={secondaryButtonClass}>
        {pending ? t("signingOutDevice") : t("signOutDevice")}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function RevokeOthersForm({ disabled }: { disabled: boolean }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState(revokeOtherDevicesAction, initialState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={disabled || pending} className={secondaryButtonClass}>
        {pending ? t("signingOut") : t("signOutOthers")}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
