import { deleteAttachmentAction } from "@/lib/actions/attachments";
import { AttachmentUploadForm } from "./AttachmentUploadForm";

type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
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

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
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
  promptForPhoto = false,
}: {
  orderId: string;
  attachments: AttachmentRow[];
  currentUserId?: string;
  canUpload: boolean;
  // Показать заметный призыв прикрепить фото готовой работы — актуально для
  // выигравшего исполнителя/дизайнера на завершённом заказе, у которого ещё
  // нет ни одного фото среди вложений.
  promptForPhoto?: boolean;
}) {
  if (attachments.length === 0 && !canUpload) return null;

  const photos = attachments.filter((a) => isImage(a.mimeType));
  const otherFiles = attachments.filter((a) => !isImage(a.mimeType));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Файлы ({attachments.length})</h2>

      {promptForPhoto && (
        <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          Заказ завершён — прикрепите фото готовой работы, чтобы заказчик увидел результат.
        </p>
      )}

      {photos.length > 0 && (
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((a) => (
              <div key={a.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- динамический авторизованный эндпоинт, next/image тут не подходит */}
                  <img
                    src={`/api/attachments/${a.id}`}
                    alt={a.fileName}
                    className="aspect-square w-full object-cover transition group-hover:opacity-90"
                  />
                </a>
                <div className="flex items-center justify-between gap-1 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                  <span className="truncate">{a.uploader.name}</span>
                  {a.uploaderId === currentUserId && <DeleteAttachmentButton attachmentId={a.id} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherFiles.length === 0 && photos.length === 0 ? (
        <p className="text-sm text-slate-400">Файлов пока нет.</p>
      ) : otherFiles.length > 0 ? (
        <ul className="mb-4 divide-y divide-slate-100">
          {otherFiles.map((a) => (
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
      ) : null}

      {canUpload && <AttachmentUploadForm orderId={orderId} />}
    </div>
  );
}
