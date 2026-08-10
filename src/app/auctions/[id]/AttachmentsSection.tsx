import { deleteAttachmentAction } from "@/lib/actions/attachments";
import { AttachmentUploadForm } from "./AttachmentUploadForm";

type AttachmentRow = {
  id: string;
  fileName: string;
  size: number;
  createdAt: Date;
  uploaderId: string;
  uploader: { id: string; name: string };
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function DeleteAttachmentButton({ attachmentId }: { attachmentId: string }) {
  async function remove() {
    "use server";
    await deleteAttachmentAction(attachmentId);
  }

  return (
    <form action={remove}>
      <button type="submit" className="text-xs text-red-600 hover:underline">
        удалить
      </button>
    </form>
  );
}

export function AttachmentsSection({
  orderId,
  attachments,
  currentUserId,
  canUpload,
}: {
  orderId: string;
  attachments: AttachmentRow[];
  currentUserId?: string;
  canUpload: boolean;
}) {
  if (attachments.length === 0 && !canUpload) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Файлы ({attachments.length})</h2>

      {attachments.length === 0 ? (
        <p className="text-sm text-slate-400">Файлов пока нет.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <a
                href={`/api/attachments/${a.id}`}
                className="min-w-0 flex-1 truncate font-medium text-orange-600 hover:underline"
              >
                {a.fileName}
              </a>
              <span className="shrink-0 text-xs text-slate-400">
                {formatSize(a.size)} · {a.uploader.name}
              </span>
              {a.uploaderId === currentUserId && <DeleteAttachmentButton attachmentId={a.id} />}
            </li>
          ))}
        </ul>
      )}

      {canUpload && <AttachmentUploadForm orderId={orderId} />}
    </div>
  );
}
