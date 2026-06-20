// PIN-lock library for the WhatsApp Privacy Extension (popup/options context).
// Keeps all crypto + storage schema in one place. content.js does NOT import
// this — it only reads the resulting state from chrome.storage.local.

const SEC_KEY = "wpeSecurity";
const LOCK_KEY = "wpeLock";
const ATTEMPTS_KEY = "wpeAttempts";

export const RELOCK_MODES = ["idle", "session", "timer", "immediate"];

export const DEFAULT_SECURITY = {
  pinEnabled: false,
  pinHash: "",
  pinSalt: "",
  recoveryHash: "",
  recoverySalt: "",
  relockMode: "idle",
  relockTimerMinutes: 5,
  blurAllWhenLocked: false,
};

const DEFAULT_LOCK = { locked: false, unlockedUntil: null };
const DEFAULT_ATTEMPTS = { count: 0, lockedUntil: null };

// Escalating cooldowns (seconds) once the free-attempt budget is spent.
const FREE_ATTEMPTS = 5;
const COOLDOWNS = [30, 60, 300];

// --- low-level crypto helpers ------------------------------------------------
function bufToHex(buf) {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bufToHex(a);
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(buf);
}

async function hashWithSalt(value, saltHex) {
  return sha256Hex(`${saltHex}:${value}`);
}

function generateRecoveryCode() {
  // 3 groups of 4 chars from an unambiguous alphabet (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => alphabet[Math.floor((crypto.getRandomValues(new Uint8Array(1))[0] / 256) * alphabet.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `${group()}-${group()}-${group()}`;
}

// --- storage helpers ---------------------------------------------------------
export async function getSecurity() {
  const { [SEC_KEY]: s } = await chrome.storage.local.get(SEC_KEY);
  return { ...DEFAULT_SECURITY, ...(s || {}) };
}

async function setSecurity(patch) {
  const current = await getSecurity();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SEC_KEY]: next });
  return next;
}

export async function getLock() {
  const { [LOCK_KEY]: l } = await chrome.storage.local.get(LOCK_KEY);
  return { ...DEFAULT_LOCK, ...(l || {}) };
}

async function setLock(patch) {
  const next = { ...DEFAULT_LOCK, ...patch };
  await chrome.storage.local.set({ [LOCK_KEY]: next });
  return next;
}

async function getAttempts() {
  const { [ATTEMPTS_KEY]: a } = await chrome.storage.local.get(ATTEMPTS_KEY);
  return { ...DEFAULT_ATTEMPTS, ...(a || {}) };
}

async function setAttempts(patch) {
  const next = { ...DEFAULT_ATTEMPTS, ...patch };
  await chrome.storage.local.set({ [ATTEMPTS_KEY]: next });
  return next;
}

// --- PIN lifecycle -----------------------------------------------------------
// Enable a brand-new PIN. Returns the one-time recovery code to show the user.
export async function enablePin(pin) {
  const pinSalt = randomHex(16);
  const pinHash = await hashWithSalt(pin, pinSalt);
  const recoveryCode = generateRecoveryCode();
  const recoverySalt = randomHex(16);
  const recoveryHash = await hashWithSalt(recoveryCode, recoverySalt);
  await setSecurity({ pinEnabled: true, pinHash, pinSalt, recoveryHash, recoverySalt });
  await resetAttempts();
  await setLock({ locked: false, unlockedUntil: null });
  return recoveryCode;
}

// Change the PIN while keeping the existing recovery code.
export async function changePin(newPin) {
  const pinSalt = randomHex(16);
  const pinHash = await hashWithSalt(newPin, pinSalt);
  await setSecurity({ pinHash, pinSalt });
  await resetAttempts();
}

export async function disablePin() {
  await setSecurity({
    pinEnabled: false,
    pinHash: "",
    pinSalt: "",
    recoveryHash: "",
    recoverySalt: "",
  });
  await resetAttempts();
  await setLock({ locked: false, unlockedUntil: null });
}

// Generate a fresh recovery code (invalidates the old one). Returns plaintext.
export async function regenerateRecoveryCode() {
  const recoveryCode = generateRecoveryCode();
  const recoverySalt = randomHex(16);
  const recoveryHash = await hashWithSalt(recoveryCode, recoverySalt);
  await setSecurity({ recoveryHash, recoverySalt });
  return recoveryCode;
}

export async function verifyPin(pin) {
  const s = await getSecurity();
  if (!s.pinHash) return false;
  const hash = await hashWithSalt(pin, s.pinSalt);
  return timingSafeEqual(hash, s.pinHash);
}

export async function verifyRecovery(code) {
  const s = await getSecurity();
  if (!s.recoveryHash) return false;
  const normalized = code.trim().toUpperCase();
  const hash = await hashWithSalt(normalized, s.recoverySalt);
  return timingSafeEqual(hash, s.recoveryHash);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- lock / unlock -----------------------------------------------------------
export async function applyUnlock() {
  const s = await getSecurity();
  const unlockedUntil =
    s.relockMode === "timer"
      ? Date.now() + (s.relockTimerMinutes || 5) * 60000
      : null;
  await setLock({ locked: false, unlockedUntil });
  await resetAttempts();
}

export async function lockNow() {
  await setLock({ locked: true, unlockedUntil: null });
}

// --- brute-force throttling --------------------------------------------------
export async function getCooldownRemaining() {
  const a = await getAttempts();
  if (a.lockedUntil && Date.now() < a.lockedUntil) return a.lockedUntil - Date.now();
  return 0;
}

export async function registerFailure() {
  const a = await getAttempts();
  const count = (a.count || 0) + 1;
  let lockedUntil = null;
  if (count > FREE_ATTEMPTS) {
    const idx = Math.min(count - FREE_ATTEMPTS - 1, COOLDOWNS.length - 1);
    lockedUntil = Date.now() + COOLDOWNS[idx] * 1000;
  }
  await setAttempts({ count, lockedUntil });
  return { count, lockedUntil };
}

export async function resetAttempts() {
  await setAttempts({ count: 0, lockedUntil: null });
}

// --- settings mutators (used by the settings UI) -----------------------------
export async function setRelockMode(relockMode) {
  return setSecurity({ relockMode });
}
export async function setRelockTimerMinutes(relockTimerMinutes) {
  return setSecurity({ relockTimerMinutes: Math.max(1, Number(relockTimerMinutes) || 5) });
}
export async function setBlurAllWhenLocked(blurAllWhenLocked) {
  return setSecurity({ blurAllWhenLocked: !!blurAllWhenLocked });
}

// Hard reset: wipe security + lock + attempts back to defaults.
export async function resetSecurity() {
  await chrome.storage.local.remove([SEC_KEY, LOCK_KEY, ATTEMPTS_KEY]);
}
