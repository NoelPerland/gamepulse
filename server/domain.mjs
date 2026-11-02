export const kinds = [
  "session_start",
  "level_start",
  "death",
  "level_complete",
  "session_end",
];
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function event(input, now = Date.now()) {
  if (!input || typeof input !== "object")
    throw new ApiError(400, "Expected an event object.");
  const { id, kind, player, session, level = "", at } = input;
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new ApiError(400, "Provide a UUID event id.");
  if (!kinds.includes(kind)) throw new ApiError(400, "Unsupported event kind.");
  if (
    ![player, session].every(
      (v) => typeof v === "string" && /^[\w.-]{1,80}$/.test(v),
    )
  )
    throw new ApiError(400, "Use pseudonymous player and session identifiers.");
  if (
    typeof level !== "string" ||
    level.length > 80 ||
    (["level_start", "level_complete", "death"].includes(kind) && !level.trim())
  )
    throw new ApiError(400, "A valid level is required.");
  if (
    typeof at !== "string" ||
    !/(Z|[+-]\d\d:\d\d)$/.test(at) ||
    !Number.isFinite(Date.parse(at)) ||
    Date.parse(at) > now + 60000 ||
    Date.parse(at) < now - 90 * 86400000
  )
    throw new ApiError(
      400,
      "Timestamp must be within the last 90 days and include a timezone.",
    );
  return {
    id,
    kind,
    player,
    session,
    level: level.trim(),
    at: new Date(at).toISOString(),
  };
}
export function config(input) {
  const v = input?.value;
  if (
    !Number.isSafeInteger(input?.version) ||
    input.version < 1 ||
    !v ||
    !["easy", "normal", "hard"].includes(v.difficulty) ||
    typeof v.bonusXp !== "number" ||
    !Number.isFinite(v.bonusXp) ||
    v.bonusXp < 1 ||
    v.bonusXp > 5 ||
    typeof v.eventBanner !== "string" ||
    v.eventBanner.length > 120
  )
    throw new ApiError(
      400,
      "Invalid config. XP multiplier must be 1–5 and banner 120 characters or fewer.",
    );
  return {
    difficulty: v.difficulty,
    bonusXp: v.bonusXp,
    eventBanner: v.eventBanner.trim(),
  };
}
