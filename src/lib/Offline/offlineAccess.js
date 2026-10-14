import offlineDb from "./OfflineDb";
import { supabase } from "../supabase";

const ACCESS_PREFIX = "offline-access:";
const ACCESS_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const toBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const uuidToBytes = (uuid) => {
  const hex = uuid.replaceAll("-", "");
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  );
};

const sameBytes = (left, right) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const readDerLength = (bytes, offset) => {
  const first = bytes[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  const lengthBytes = first & 0x7f;
  let length = 0;
  for (let index = 0; index < lengthBytes; index += 1) {
    length = (length << 8) | bytes[offset + 1 + index];
  }
  return { length, next: offset + 1 + lengthBytes };
};

const derEcdsaToRaw = (signature) => {
  const bytes = new Uint8Array(signature);
  if (bytes[0] !== 0x30) throw new Error("The device returned an invalid authentication response.");
  const sequence = readDerLength(bytes, 1);
  let offset = sequence.next;
  if (bytes[offset] !== 0x02) throw new Error("The device returned an invalid authentication response.");
  const rLength = readDerLength(bytes, offset + 1);
  const r = bytes.slice(rLength.next, rLength.next + rLength.length);
  offset = rLength.next + rLength.length;
  if (bytes[offset] !== 0x02) throw new Error("The device returned an invalid authentication response.");
  const sLength = readDerLength(bytes, offset + 1);
  const s = bytes.slice(sLength.next, sLength.next + sLength.length);
  const raw = new Uint8Array(64);
  raw.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(r.length, 32));
  raw.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(s.length, 32));
  return raw;
};

const verifyAssertion = async (assertion, accessRecord, challenge) => {
  const response = assertion.response;
  const clientDataBytes = new Uint8Array(response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  if (
    clientData.type !== "webauthn.get" ||
    clientData.challenge !== toBase64Url(challenge) ||
    clientData.origin !== window.location.origin
  ) {
    throw new Error("The device authentication response could not be verified for this site.");
  }

  const authenticatorData = new Uint8Array(response.authenticatorData);
  const rpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(window.location.hostname))
  );
  if (authenticatorData.length < 37 || !sameBytes(authenticatorData.slice(0, 32), rpIdHash)) {
    throw new Error("Biometric sign-in is not registered for this site.");
  }
  if ((authenticatorData[32] & 0x05) !== 0x05) {
    throw new Error("Verify your identity with your device to unlock offline access.");
  }

  const signCount = new DataView(
    authenticatorData.buffer,
    authenticatorData.byteOffset + 33,
    4
  ).getUint32(0);
  if (signCount > 0 && accessRecord.signCount > 0 && signCount <= accessRecord.signCount) {
    throw new Error("This device authentication is out of date. Connect to the internet and sign in again.");
  }

  const algorithm = accessRecord.algorithm === -7
    ? { name: "ECDSA", namedCurve: "P-256" }
    : accessRecord.algorithm === -257
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : null;
  if (!algorithm) throw new Error("This device's biometric authentication method is not supported.");

  const publicKey = await crypto.subtle.importKey(
    "spki",
    fromBase64Url(accessRecord.publicKey),
    algorithm,
    false,
    ["verify"]
  );
  const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataBytes));
  const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedData.set(authenticatorData);
  signedData.set(clientDataHash, authenticatorData.length);

  let signature = response.signature;
  if (accessRecord.algorithm === -7) signature = derEcdsaToRaw(signature);
  const signatureAlgorithm = accessRecord.algorithm === -7
    ? { name: "ECDSA", hash: "SHA-256" }
    : { name: "RSASSA-PKCS1-v1_5" };
  const valid = await crypto.subtle.verify(
    signatureAlgorithm,
    publicKey,
    signature,
    signedData
  );
  if (!valid) throw new Error("Biometric sign-in could not unlock this offline account.");

  return signCount;
};

export async function enableOfflineAccess({ user, staff }) {
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
    throw new Error("Biometric sign-in requires a supported browser on HTTPS or localhost.");
  }
  if (!user?.id || !staff?.is_active || staff.user_id !== user.id) {
    throw new Error("Sign in online before setting up offline access on this device.");
  }
  if (staff.must_change_password) {
    throw new Error("Complete your required password change before enabling offline access.");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const username = staff.username || staff.email || staff.full_name || user.email;
  const displayName = staff.full_name || username;
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: window.location.hostname, name: "AMCOMS" },
      user: {
        id: uuidToBytes(user.id),
        name: username,
        displayName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  });

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("No device biometric credential was created.");
  }
  const response = credential.response;
  if (
    typeof response.getAuthenticatorData !== "function" ||
    typeof response.getPublicKey !== "function" ||
    typeof response.getPublicKeyAlgorithm !== "function"
  ) {
    throw new Error("This browser cannot securely store the biometric sign-in credential. Update the browser or use another supported device.");
  }
  const clientData = JSON.parse(new TextDecoder().decode(response.clientDataJSON));
  const authenticatorData = new Uint8Array(response.getAuthenticatorData());
  const expectedRpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(window.location.hostname))
  );
  if (
    clientData.type !== "webauthn.create" ||
    clientData.challenge !== toBase64Url(challenge) ||
    clientData.origin !== window.location.origin ||
    authenticatorData.length < 37 ||
    !sameBytes(authenticatorData.slice(0, 32), expectedRpIdHash) ||
    (authenticatorData[32] & 0x05) !== 0x05
  ) {
    throw new Error("The device passkey could not be verified for this site.");
  }
  const publicKey = response.getPublicKey();
  const algorithm = response.getPublicKeyAlgorithm();
  if (!publicKey || ![-7, -257].includes(algorithm)) {
    throw new Error("The device biometric credential uses an unsupported signing method.");
  }

  const credentialId = toBase64Url(credential.rawId);
  await offlineDb.cachedData.put({
    key: `${ACCESS_PREFIX}${credentialId}`,
    data: {
      credentialId,
      publicKey: toBase64Url(publicKey),
      algorithm,
      signCount: 0,
      userId: user.id,
      email: user.email || "",
      staff,
      expiresAt: Date.now() + ACCESS_LIFETIME_MS,
      enrolledAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function unlockWithOfflinePasskey() {
  if (navigator.onLine) {
    throw new Error("Use your regular online sign-in while connected.");
  }
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
    throw new Error("Offline biometric sign-in requires a supported browser on HTTPS or localhost.");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!assertion || !(assertion instanceof PublicKeyCredential)) {
    throw new Error("No biometric or device verification method was selected.");
  }

  const credentialId = toBase64Url(assertion.rawId);
  const stored = await offlineDb.cachedData.get(`${ACCESS_PREFIX}${credentialId}`);
  const accessRecord = stored?.data;
  if (!accessRecord?.staff || !accessRecord.userId) {
    throw new Error("Biometric sign-in has not been set up for AMCOMS on this device.");
  }
  if (accessRecord.expiresAt <= Date.now()) {
    throw new Error("Offline access has expired. Connect to the internet, sign in, and set it up again.");
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) {
    throw new Error("An online session is already stored in this browser. Connect and use regular sign-in instead.");
  }
  if (assertion.response.userHandle) {
    const expectedUserHandle = uuidToBytes(accessRecord.userId);
    if (!sameBytes(new Uint8Array(assertion.response.userHandle), expectedUserHandle)) {
      throw new Error("This device authentication does not match the offline account.");
    }
  }

  const signCount = await verifyAssertion(assertion, accessRecord, challenge);
  await offlineDb.cachedData.update(`${ACCESS_PREFIX}${credentialId}`, {
    data: { ...accessRecord, signCount },
    updatedAt: new Date().toISOString(),
  });

  return {
    user: { id: accessRecord.userId, email: accessRecord.email, offline: true },
    staff: accessRecord.staff,
  };
}

export async function removeOfflineAccess(userId) {
  const records = await offlineDb.cachedData
    .where("key")
    .startsWith(ACCESS_PREFIX)
    .toArray();
  const keysToDelete = records
    .filter((record) => record.data?.userId === userId)
    .map((record) => record.key);
  await offlineDb.transaction("rw", offlineDb.cachedData, async () => {
    await offlineDb.cachedData.bulkDelete(keysToDelete);
    await offlineDb.cachedData.delete(`staff-profile:${userId}`);
    await offlineDb.cachedData.delete(`profile:${userId}`);
  });
}
