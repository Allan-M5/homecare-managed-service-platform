import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(buffer) {
  let bits = "";
  let output = "";

  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }

  while (bits.length % 5 !== 0) {
    bits += "0";
  }

  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
}

function fromBase32(base32) {
  const clean = String(base32 || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

export function generateBase32Secret(length = 20) {
  return toBase32(crypto.randomBytes(length));
}

export function generateTotpOtpauthUrl({ issuer = "HomeCare", label, secret }) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedLabel = encodeURIComponent(label);
  return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

function generateTotpAt(secret, counter) {
  const key = fromBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter % 0x100000000, 4);

  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1000000).padStart(6, "0");
}

export function verifyTotp({ secret, token, window = 1 }) {
  const cleanToken = String(token || "").trim();
  if (!secret || !/^\d{6}$/.test(cleanToken)) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = generateTotpAt(secret, currentCounter + offset);
    if (candidate === cleanToken) {
      return true;
    }
  }

  return false;
}
