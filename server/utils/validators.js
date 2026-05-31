function normalizePriority(value) {
  if (value === "高" || value === "中" || value === "低") return value;
  return "中";
}

function normalizeDueDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined; // undefined = 校验失败
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return s;
}

function normalizeReviewState(value) {
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  return "pending";
}

function reviewStatusLabel(state) {
  if (state === "approved") return "已通过";
  if (state === "rejected") return "退回";
  return "待审";
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim();
}

module.exports = {
  normalizePriority,
  normalizeDueDate,
  normalizeReviewState,
  reviewStatusLabel,
  normalizeSearchValue,
};
