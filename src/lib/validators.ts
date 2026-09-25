import { z } from "zod";

const uuid = z.string().uuid();

export const appointmentSchema = z.object({
  serviceIds: z.array(uuid).min(1).max(12),
  staffId: uuid,
  date: z.iso.date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(30),
  email: z.email().max(254).optional().or(z.literal("")),
  note: z.string().max(1000).optional().default(""),
  privacyAcknowledged: z.literal(true),
  honeypot: z.string().max(0).optional().default(""),
});

export const slotsQuerySchema = z.object({
  staffId: uuid,
  date: z.iso.date(),
  serviceIds: z.array(uuid).min(1).max(12),
});

export const manageLookupSchema = z.object({
  code: z.string().trim().regex(/^RND-[A-Z0-9]{20}$/),
  phone: z.string().trim().min(7).max(30),
});

export const manageUpdateSchema = manageLookupSchema.extend({
  serviceIds: z.array(uuid).min(1).max(12),
  staffId: uuid,
  date: z.iso.date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
});
