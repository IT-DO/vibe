"use client";

import { useActionState, useRef } from "react";
import { uploadAttachmentAction } from "@/lib/actions/attachments";
import type { ActionState } from "@/lib/actions/auth";
import { ATTACHMENT_EXTENSIONS } from "@/lib/constants";

const initialState: ActionState = {};
const ACCEPT_ATTR = Object.keys(ATTACHMENT_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(",");

export function AttachmentUploadForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(uploadAttachmentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="border-t border-slate-100 pt-4"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="file" name="files" multiple accept={ACCEPT_ATTR} className="input" />
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Загружаем..." : "Прикрепить файлы"}
      </button>
    </form>
  );
}
