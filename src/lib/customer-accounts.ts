export type CustomerAccount = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  private_note: string;
  created_at: string;
  updated_at: string;
  total_earned: number;
  outstanding_balance: number;
};

export const customerError = (message: string) => {
  const messages: Record<string, string> = {
    payment_exceeds_invoice_balance: "Ödeme, adisyonun kalan borcunu aşamaz. Güncel bakiyeyi kontrol edin.",
    active_payment_method_required: "Aktif bir ödeme yöntemi seçin.",
    invoice_total_must_be_positive: "Adisyon toplamı sıfırdan büyük olmalı.",
    invoice_items_required: "Adisyona en az bir hizmet ekleyin.",
    invalid_invoice_item: "Hizmet adı, adet ve fiyatı kontrol edin.",
    invalid_payment: "Geçerli bir ödeme tutarı ve tarihi girin.",
    future_payment_date: "Tahsilat tarihi gelecekte olamaz.",
    void_invoice_payments_first: "Adisyonu iptal etmeden önce aktif tahsilatlarını iptal edin.",
    invoice_is_voided: "İptal edilmiş adisyona ödeme eklenemez.",
    invoice_must_be_voided_first: "Randevuyu iptal etmeden önce müşteri kartındaki adisyonu iptal edin.",
    appointment_overpaid: "Bu randevunun tahsilatı ücretinden yüksek. Önce randevu tutarını düzeltin.",
    appointment_is_cancelled: "İptal edilen veya gelinmeyen randevudan adisyon açılamaz.",
    invoice_retry_mismatch: "Bu adisyon daha önce kaydedilmiş. Müşteri kartını yenileyerek kaydı kontrol edin.",
    payment_retry_mismatch: "Bu tahsilat daha önce kaydedilmiş. Adisyonu yenileyerek kaydı kontrol edin.",
    admin_required: "Yönetici oturumu gerekli. Yeniden giriş yapın.",
  };
  if (message.includes("customers_phone_normalized_key")) return "Bu telefonla kayıtlı bir müşteri var. Müşteri listesinden mevcut kaydı açın.";
  return messages[message] || message || "İşlem tamamlanamadı.";
};
