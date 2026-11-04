import offlineDb from "./OfflineDb";
import { supabase } from "../supabase";

const ACCESS_PREFIX = "offline-pin:";
const LEGACY_ACCESS_PREFIX = "offline-access:";
const PIN_ITERATIONS = 310_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
export const OFFLINE_PIN_NOT_CONFIGURED_MESSAGE =
  "Offline PIN access is not set up for this username on this device. Connect and enable it from your Profile first.";

const toBase64 = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const fromBase64 = (value) => Uint8Array.from(
  atob(value),
  (character) => character.charCodeAt(0)
);

const derivePinHash = async (pin, salt, iterations = PIN_ITERATIONS) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return new Uint8Array(hash);
};

const equalBytes = (left, right) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const validatePin = (pin) => {
  if (!/^\d{6}$/.test(pin || "")) {
    throw new Error("Your device PIN must be exactly 6 digits.");
  }
};

const requireSecureCrypto = () => {
  if (
    !window.isSecureContext ||
    typeof crypto === "undefined" ||
    !crypto.subtle ||
    !crypto.getRandomValues
  ) {
    throw new Error("Offline PIN access requires a supported browser on HTTPS or localhost.");
  }
};

const findPinRecord = async (username) => {
  const normalizedUsername = typeof username === "string"
    ? username.trim().toLowerCase()
    : "";
  if (!normalizedUsername) throw new Error("Enter your username to unlock offline access.");

  const records = await offlineDb.cachedData
    .where("key")
    .startsWith(ACCESS_PREFIX)
    .toArray();
  const matches = records.filter(({ data }) =>
    typeof data?.staff?.username === "string" &&
    data.staff.username.trim().toLowerCase() === normalizedUsername
  );

  if (!matches.length) {
    throw new Error(OFFLINE_PIN_NOT_CONFIGURED_MESSAGE);
  }
  if (matches.length > 1) {
    throw new Error("More than one offline account matches this username. Connect and set up offline PIN access again.");
  }
  return matches[0];
};

export async function hasOfflineAccess(userId) {
  if (!userId) return false;
  const record = await offlineDb.cachedData.get(`${ACCESS_PREFIX}${userId}`);
  return record?.data?.userId === userId
    && typeof record.data.pinHash === "string"
    && typeof record.data.salt === "string";
}

export async function enableOfflineAccess({ user, staff, pin }) {
  validatePin(pin);
  requireSecureCrypto();
  if (!navigator.onLine) {
    throw new Error("Connect to the internet and sign in before setting up offline PIN access.");
  }
  if (!user?.id || !staff?.is_active || staff.user_id !== user.id) {
    throw new Error("Sign in online before setting up offline PIN access on this device.");
  }
  if (staff.must_change_password) {
    throw new Error("Complete your required password change before enabling offline access.");
  }
  if (!staff.username?.trim()) {
    throw new Error("Set a username on your profile before enabling offline PIN access.");
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session || session.user.id !== user.id) {
    throw new Error("A valid online sign-in is required to set up offline PIN access.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinHash = await derivePinHash(pin, salt);
  const enrolledAt = new Date().toISOString();
  const data = {
    userId: user.id,
    email: user.email || "",
    staff,
    salt: toBase64(salt),
    pinHash: toBase64(pinHash),
    iterations: PIN_ITERATIONS,
    failedAttempts: 0,
    lockoutUntil: 0,
    enrolledAt,
  };

  const legacyRecords = await offlineDb.cachedData
    .where("key")
    .startsWith(LEGACY_ACCESS_PREFIX)
    .toArray();
  const legacyKeys = legacyRecords
    .filter((record) => record.data?.userId === user.id)
    .map((record) => record.key);

  await offlineDb.transaction("rw", offlineDb.cachedData, async () => {
    await offlineDb.cachedData.bulkDelete(legacyKeys);
    await offlineDb.cachedData.put({
      key: `${ACCESS_PREFIX}${user.id}`,
      data,
      updatedAt: enrolledAt,
    });
  });
}

export async function unlockWithOfflinePin({ username, pin }) {
  if (navigator.onLine) {
    throw new Error("Use your regular online sign-in while connected.");
  }
  validatePin(pin);
  requireSecureCrypto();

  const record = await findPinRecord(username);
  const access = record.data;
  if (
    !access.userId ||
    access.staff?.user_id !== access.userId ||
    access.staff.is_active !== true ||
    !access.staff.username ||
    access.staff.must_change_password ||
    access.iterations !== PIN_ITERATIONS
  ) {
    throw new Error("The offline account is invalid or requires an online password change.");
  }
  if (access.lockoutUntil > Date.now()) {
    const minutes = Math.ceil((access.lockoutUntil - Date.now()) / 60_000);
    throw new Error(`Too many incorrect PIN attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const salt = fromBase64(access.salt);
  const expectedHash = fromBase64(access.pinHash);
  if (salt.length !== 16 || expectedHash.length !== 32) {
    throw new Error("Offline PIN settings are invalid. Connect and set up offline access again.");
  }
  const candidateHash = await derivePinHash(pin, salt, PIN_ITERATIONS);
  if (!equalBytes(candidateHash, expectedHash)) {
    let lockedOut = false;
    await offlineDb.transaction("rw", offlineDb.cachedData, async () => {
      const latest = await offlineDb.cachedData.get(record.key);
      if (!latest?.data) throw new Error("Offline PIN settings could not be updated.");
      if (latest.data.lockoutUntil > Date.now()) {
        lockedOut = true;
        return;
      }
      const failedAttempts = (latest.data.failedAttempts || 0) + 1;
      lockedOut = failedAttempts >= MAX_FAILED_ATTEMPTS;
      await offlineDb.cachedData.put({
        ...latest,
        data: {
          ...latest.data,
          failedAttempts: lockedOut ? 0 : failedAttempts,
          lockoutUntil: lockedOut ? Date.now() + LOCKOUT_MS : 0,
        },
      });
    });
    if (lockedOut) {
      throw new Error("Too many incorrect PIN attempts. Offline access is locked for 15 minutes.");
    }
    throw new Error("Incorrect PIN. Check your PIN and try again.");
  }

  await offlineDb.transaction("rw", offlineDb.cachedData, async () => {
    const latest = await offlineDb.cachedData.get(record.key);
    if (!latest?.data) throw new Error("Offline PIN access was removed from this device.");
    if (latest.data.lockoutUntil > Date.now()) {
      const minutes = Math.ceil((latest.data.lockoutUntil - Date.now()) / 60_000);
      throw new Error(`Too many incorrect PIN attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
    await offlineDb.cachedData.put({
      ...latest,
      data: { ...latest.data, failedAttempts: 0, lockoutUntil: 0 },
    });
  });

  return {
    user: { id: access.userId, email: access.email, offline: true },
    staff: access.staff,
  };
}

export async function removeOfflineAccess(userId) {
  const [pinRecords, legacyRecords] = await Promise.all([
    offlineDb.cachedData.where("key").startsWith(ACCESS_PREFIX).toArray(),
    offlineDb.cachedData.where("key").startsWith(LEGACY_ACCESS_PREFIX).toArray(),
  ]);
  const keysToDelete = [...pinRecords, ...legacyRecords]
    .filter((record) => record.data?.userId === userId)
    .map((record) => record.key);
  const staffProfile = await offlineDb.cachedData.get(`staff-profile:${userId}`);
  await offlineDb.transaction("rw", offlineDb.cachedData, async () => {
    await offlineDb.cachedData.bulkDelete(keysToDelete);
    await offlineDb.cachedData.delete(`staff-profile:${userId}`);
    await offlineDb.cachedData.delete(`profile:${userId}`);
    if (staffProfile?.data?.member_id) {
      await offlineDb.cachedData.delete(`member-dashboard:${staffProfile.data.member_id}`);
    }
  });
}
