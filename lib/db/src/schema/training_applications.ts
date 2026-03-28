import { pgTable, serial, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const applicationStatusEnum = pgEnum("application_status", [
  "pending",
  "shortlisted",
  "rejected",
  "selected",
]);

export const trainingApplicationsTable = pgTable("training_applications", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  fatherName: text("father_name").notNull(),
  cnic: text("cnic").notNull(),
  dateOfBirth: timestamp("date_of_birth").notNull(),
  gender: text("gender").notNull(),
  maritalStatus: text("marital_status").notNull(),

  mobile: text("mobile").notNull(),
  alternateMobile: text("alternate_mobile"),
  email: text("email").notNull(),
  currentAddress: text("current_address").notNull(),
  permanentAddress: text("permanent_address").notNull(),

  cnicFrontUrl: text("cnic_front_url").notNull(),
  cnicBackUrl: text("cnic_back_url").notNull(),
  photoUrl: text("photo_url").notNull(),

  matricBoard: text("matric_board").notNull(),
  matricYear: integer("matric_year").notNull(),
  matricMarks: text("matric_marks").notNull(),

  interBoard: text("inter_board").notNull(),
  interYear: integer("inter_year").notNull(),
  interMarks: text("inter_marks").notNull(),

  graduationDegree: text("graduation_degree"),
  graduationUni: text("graduation_uni"),
  graduationYear: integer("graduation_year"),
  graduationMarks: text("graduation_marks"),

  icapRegNo: text("icap_reg_no"),
  icapLevel: text("icap_level").notNull(),

  preferredLocation: text("preferred_location").notNull(),
  preferredDept: text("preferred_dept").notNull(),

  availableStart: timestamp("available_start").notNull(),
  isFullTime: boolean("is_full_time").notNull().default(true),
  currentEngagement: text("current_engagement"),

  accountingLevel: text("accounting_level").notNull(),
  excelLevel: text("excel_level").notNull(),
  softwareSkills: text("software_skills"),
  communication: text("communication").notNull(),

  experienceDetails: text("experience_details"),

  declaration: boolean("declaration").notNull().default(false),

  status: applicationStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTrainingApplicationSchema = createInsertSchema(trainingApplicationsTable).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrainingApplication = z.infer<typeof insertTrainingApplicationSchema>;
export type TrainingApplication = typeof trainingApplicationsTable.$inferSelect;
