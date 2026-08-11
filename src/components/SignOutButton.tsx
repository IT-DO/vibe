"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      {label}
    </button>
  );
}
