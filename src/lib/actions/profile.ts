"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/actions/auth";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
  specialization: z.string().trim().max(200).optional().or(z.literal("")),
  materials: z.string().trim().max(200).optional().or(z.literal("")),
  printer: z.string().trim().max(200).optional().or(z.literal("")),
  pricePerGram: z.coerce.number().min(0).max(100000).optional(),
});

export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    bio: formData.get("bio"),
    specialization: formData.get("specialization"),
    materials: formData.get("materials"),
    printer: formData.get("printer"),
    pricePerGram: formData.get("pricePerGram") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { name, city, bio, specialization, materials, printer, pricePerGram } = parsed.data;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      city: city || null,
      bio: bio || null,
      ...(session.user.role === "EXECUTOR" || session.user.role === "DESIGNER"
        ? {
            specialization: specialization || null,
            materials: materials || null,
            printer: printer || null,
            pricePerGram: pricePerGram ?? null,
          }
        : {}),
    },
  });

  revalidatePath(`/u/${session.user.id}`);
  revalidatePath("/executors");
  return { success: true };
}
