"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError, requireRole } from "@/lib/auth";
import { createCustomerForCurrentTenant, updateCustomerStatusForCurrentTenant } from "@/lib/data/customers";
import { isCustomerStatus, validateCustomer } from "@/lib/validation/customers";

export type CreateState = { errors?: { name?: string; email?: string; company?: string }; message?: string };

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createCustomer(_previous: CreateState, formData: FormData): Promise<CreateState> {
  try {
    await requireRole("admin");
  } catch (error) {
    if (error instanceof AuthError) return { message: error.code === "forbidden" ? "Your viewer account cannot create customers." : "Your session expired. Sign in again." };
    throw error;
  }
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const company = readText(formData, "company");
  const errors = validateCustomer({ name, email, company });
  if (Object.keys(errors).length) return { errors, message: "Please correct the highlighted fields." };
  await createCustomerForCurrentTenant({ name, email, company, status: "pending" });
  revalidatePath("/customers");
  redirect("/customers?created=1");
}

export async function updateCustomerStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  try {
    await requireRole("admin");
  } catch (error) {
    if (error instanceof AuthError) redirect(error.code === "unauthenticated" ? "/login" : "/customers?error=forbidden");
    throw error;
  }
  if (!/^cus_[a-zA-Z0-9]+$/.test(id) || !isCustomerStatus(status)) redirect("/customers?error=invalid");
  const updated = await updateCustomerStatusForCurrentTenant(id, status);
  if (!updated) redirect("/customers?error=not-found");
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?updated=1`);
}
