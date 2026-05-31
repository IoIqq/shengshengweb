const crypto = require("crypto");

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, row) {
  if (!row) return false;
  const hash = crypto.scryptSync(String(password), row.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(row.password_hash, "hex"));
}

module.exports = {
  createPasswordHash,
  verifyPassword,
};
