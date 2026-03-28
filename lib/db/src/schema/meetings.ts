import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const meetingStatusEnum = pgEnum("meeting_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
]);

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  clientPhone: text("client_phone").notNull(),
  companyName: text("company_name"),
  partnerName: text("partner_name").notNull(),
  meetingDate: text("meeting_date").notNull(),
  meetingTime: text("meeting_time").notNull(),
  duration: text("duration").notNull().default("30"),
  purpose: text("purpose").notNull(),
  notes: text("notes"),
  status: meetingStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
