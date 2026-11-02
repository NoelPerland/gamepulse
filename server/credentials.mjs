import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
export function same(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    timingSafeEqual(
      createHash("sha256").update(a).digest(),
      createHash("sha256").update(b).digest(),
    )
  );
}
export async function credentials() {
  if (process.env.GAMEPULSE_WRITE_KEY && process.env.GAMEPULSE_ADMIN_KEY)
    return {
      write: process.env.GAMEPULSE_WRITE_KEY,
      admin: process.env.GAMEPULSE_ADMIN_KEY,
    };
  if (
    process.env.HOST &&
    !["localhost", "127.0.0.1"].includes(process.env.HOST)
  )
    throw Error("Configure both GamePulse keys before serving publicly.");
  await mkdir(".data", { recursive: true });
  try {
    return JSON.parse(await readFile(".data/keys.json", "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const keys = {
    write: randomBytes(24).toString("hex"),
    admin: randomBytes(32).toString("hex"),
  };
  await writeFile(".data/keys.json", JSON.stringify(keys), {
    flag: "wx",
    mode: 0o600,
  });
  return keys;
}
