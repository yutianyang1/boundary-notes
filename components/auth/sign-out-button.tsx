"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function SignOutButton({ children, className, redirectTo = "/" }: Readonly<{
  children: React.ReactNode;
  className?: string;
  redirectTo?: string;
}>) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (pending) return;
        setPending(true);
        void signOut({ redirectTo }).catch(() => setPending(false));
      }}
      className={className}
    >
      {children}
    </button>
  );
}
