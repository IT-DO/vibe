import "server-only";
import { mkdir, unlink, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ATTACHMENT_EXTENSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

// Важно: этот файл НЕ имеет директивы "use server" — в отличие от файлов в
// src/lib/actions/*, где любая экспортированная async-функция автоматически
// становится вызываемым извне Server Action. Вспомогательные функции вроде
// saveAttachments ничего сами не проверяют на права доступа (это делают
// уже вызывающие их server actions), поэтому они обязаны жить здесь, а не
// быть непреднамеренно выставлены наружу как отдельный публичный action.

// turbopackIgnore: путь заведомо динамический (берётся из env), файлы вне
// репозитория — трассировать их как часть сборки не нужно и не нужно тащить
// в сборочный вывод.
const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "./uploads");

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 МБ на файл
export const MAX_FILES_PER_UPLOAD = 5;
export const MAX_ATTACHMENTS_PER_ORDER = 20;

const ALLOWED_EXTENSIONS = ATTACHMENT_EXTENSIONS;

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedFile(fileName: string): boolean {
  return extensionOf(fileName) in ALLOWED_EXTENSIONS;
}

// Реальный MIME определяется по нашему allow-list, а не берётся из file.type —
// значение file.type приходит от клиента и легко подделывается.
export function extensionMimeType(fileName: string): string {
  return ALLOWED_EXTENSIONS[extensionOf(fileName)] ?? "application/octet-stream";
}

export function allowedExtensionsList(): string[] {
  return Object.keys(ALLOWED_EXTENSIONS);
}

async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

// Имя на диске всегда генерируем сами (uuid + проверенное расширение).
// Пользовательское имя файла никогда не участвует в пути — это исключает
// directory traversal (../../etc/passwd и т.п.) в принципе, а не проверкой.
export async function saveUploadedFile(file: File): Promise<{ storedName: string; size: number }> {
  await ensureUploadDir();
  const ext = extensionOf(file.name) || "bin";
  const storedName = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, storedName), buffer);
  return { storedName, size: buffer.byteLength };
}

// Доп. защита: даже если storedName придёт не из нашей генерации, отбрасываем
// всё, что не является простым именем файла в пределах UPLOAD_DIR.
function safePath(storedName: string): string {
  const base = path.basename(storedName);
  if (base !== storedName || base === "" || base === "." || base === "..") {
    throw new Error("Invalid stored file name");
  }
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, base);
}

export async function deleteStoredFile(storedName: string): Promise<void> {
  try {
    await unlink(safePath(storedName));
  } catch {
    // файла уже нет на диске — не критично для удаления записи
  }
}

export function readStoredFile(storedName: string) {
  return createReadStream(safePath(storedName));
}

export async function storedFileExists(storedName: string): Promise<boolean> {
  try {
    await stat(safePath(storedName));
    return true;
  } catch {
    return false;
  }
}

export function filesFromFormData(formData: FormData): File[] {
  return formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
}

export function validateFiles(files: File[]): string | null {
  if (files.length === 0) return null;
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return `Можно загрузить не больше ${MAX_FILES_PER_UPLOAD} файлов за раз`;
  }
  for (const file of files) {
    if (!isAllowedFile(file.name)) {
      return `Недопустимый тип файла «${file.name}». Разрешены: ${allowedExtensionsList().join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Файл «${file.name}» больше ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)} МБ`;
    }
  }
  return null;
}

export async function saveAttachments(orderId: string, uploaderId: string, files: File[]) {
  for (const file of files) {
    const { storedName, size } = await saveUploadedFile(file);
    await prisma.attachment.create({
      data: {
        orderId,
        uploaderId,
        fileName: file.name.slice(0, 255),
        storedName,
        mimeType: extensionMimeType(file.name),
        size,
      },
    });
  }
}
