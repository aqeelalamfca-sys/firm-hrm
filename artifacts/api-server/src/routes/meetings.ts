import { Router } from "express";
import { db } from "@workspace/db";
import { meetingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.post("/public/book", async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, companyName, partnerName, meetingDate, meetingTime, duration, purpose, notes } = req.body;
    if (!clientName || !clientEmail || !clientPhone || !partnerName || !meetingDate || !meetingTime || !purpose) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const existing = await db.select().from(meetingsTable).where(eq(meetingsTable.meetingDate, meetingDate));
    const conflict = existing.find((m: any) => m.partnerName === partnerName && m.meetingTime === meetingTime && m.status !== "cancelled");
    if (conflict) {
      return res.status(409).json({ error: "This time slot is already booked for the selected partner. Please choose another time." });
    }

    const [meeting] = await db.insert(meetingsTable).values({
      clientName,
      clientEmail,
      clientPhone,
      companyName: companyName || null,
      partnerName,
      meetingDate,
      meetingTime,
      duration: duration || "30",
      purpose,
      notes: notes || null,
      status: "pending",
    }).returning();

    res.status(201).json(meeting);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to book meeting" });
  }
});

router.get("/public/slots", async (req, res) => {
  try {
    const { date, partner } = req.query;
    if (!date || !partner) {
      return res.status(400).json({ error: "Date and partner are required" });
    }

    const booked = await db.select().from(meetingsTable);
    const bookedForDay = booked.filter((m: any) =>
      m.meetingDate === date &&
      m.partnerName === partner &&
      m.status !== "cancelled"
    );
    const bookedTimes = bookedForDay.map((m: any) => m.meetingTime);
    res.json({ bookedTimes });
  } catch {
    res.json({ bookedTimes: [] });
  }
});

router.get("/", async (req, res) => {
  try {
    const meetings = await db.select().from(meetingsTable).orderBy(desc(meetingsTable.createdAt));
    res.json(meetings);
  } catch {
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!status || !["pending", "confirmed", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const [meeting] = await db.update(meetingsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(meetingsTable.id, id))
      .returning();

    if (!meeting) return res.status(404).json({ error: "Meeting not found" });
    res.json(meeting);
  } catch {
    res.status(500).json({ error: "Failed to update meeting" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(meetingsTable).where(eq(meetingsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Meeting not found" });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete meeting" });
  }
});

export default router;
