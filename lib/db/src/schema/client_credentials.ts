import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientCredentialsTable = pgTable("client_credentials", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  portalName: text("portal_name").notNull(),
  loginId: text("login_id").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  portalUrl: text("portal_url"),
  notes: text("notes"),
  createdById: integer("created_by_id").notNull(),
  updatedById: integer("updated_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClientCredentialSchema = createInsertSchema(clientCredentialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientCredential = z.infer<typeof insertClientCredentialSchema>;
export type ClientCredential = typeof clientCredentialsTable.$inferSelect;
