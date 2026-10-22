"use client";

import { useActionState } from "react";
import { createCustomer, type CreateState } from "@/app/actions/customers";

const initialState: CreateState = {};

export function CreateCustomerForm() {
  const [state, action, pending] = useActionState(createCustomer, initialState);
  return (
    <form action={action} className="form-card">
      {state.message && <p className="form-message" role="alert">{state.message}</p>}
      <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={80} aria-invalid={!!state.errors?.name} />{state.errors?.name && <span className="field-error">{state.errors.name}</span>}</label>
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={!!state.errors?.email} />{state.errors?.email && <span className="field-error">{state.errors.email}</span>}</label>
      <label>Company<input name="company" required minLength={2} maxLength={100} aria-invalid={!!state.errors?.company} />{state.errors?.company && <span className="field-error">{state.errors.company}</span>}</label>
      <button className="button button-primary" disabled={pending}>{pending ? "Creating…" : "Create customer"}</button>
    </form>
  );
}
