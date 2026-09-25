export function formatMoney(value: number | string, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return minutes + " dk";
  if (!rest) return hours + " sa";
  return hours + " sa " + rest + " dk";
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul",
  }).format(new Date(date + "T12:00:00+03:00"));
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function whatsappPhone(phone: string) {
  const digits = normalizePhone(phone);
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return "90" + digits.slice(1);
  if (digits.length === 10) return "90" + digits;
  return digits;
}

export function toLocalDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

export function slugify(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
    .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function brandMonogram(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((word) => Array.from(word)[0]?.toLocaleUpperCase("tr-TR") || "").join("");
}
