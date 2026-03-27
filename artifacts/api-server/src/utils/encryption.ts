import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const KEY = crypto.scryptSync(process.env.ENCRYPTION_KEY || "hrm_default_encryption_key_2024_secure", "salt", 32);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function maskPassword(password: string): string {
  if (password.length <= 2) return "****";
  return password[0] + "****" + password[password.length - 1];
}
