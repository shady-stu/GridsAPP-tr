import { z } from "zod";

/** Shared UUID parser for public resource identifiers. */
export const uuidSchema = z.string().uuid();
