import { Readable } from "node:stream";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile, storedFileExists } from "@/lib/storage";

// 404 используется и для "не найдено", и для "нет доступа" — чтобы по коду
// ответа нельзя было понять, существует ли вложение с данным id (защита от
// перебора/подтверждения существования чужих файлов).
function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) return notFound();

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { order: { select: { customerId: true } } },
  });
  if (!attachment) return notFound();

  const isOrderOwner = session.user.id === attachment.order.customerId;
  const isUploader = session.user.id === attachment.uploaderId;
  // Файлы, приложенные заказчиком (бриф заказа), видит любой авторизованный
  // пользователь — это нужно, чтобы исполнители/дизайнеры могли оценить
  // задачу перед тем, как делать ставку. Файлы, приложенные исполнителем
  // (результат работы), видят только заказчик и сам загрузивший.
  const isCustomerBrief = attachment.uploaderId === attachment.order.customerId;

  if (!isCustomerBrief && !isOrderOwner && !isUploader) return notFound();
  if (!(await storedFileExists(attachment.storedName))) return notFound();

  const nodeStream = readStoredFile(attachment.storedName);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  // Имя файла в заголовке экранируется от CR/LF и кавычек, чтобы пользовательское
  // имя файла не могло инжектировать посторонние HTTP-заголовки.
  const safeName = attachment.fileName.replace(/[^\w.\-() ]/g, "_");

  return new Response(webStream, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      // "attachment" запрещает браузеру рендерить файл инлайн — единственный
      // реальный риск (например, подделанный-под-картинку html) обезвреживается
      // именно этим, а не only проверкой расширения при загрузке.
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
