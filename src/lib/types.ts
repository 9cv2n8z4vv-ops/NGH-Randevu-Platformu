export type SiteSettings = {
  business_name: string;
  tagline: string;
  business_description: string;
  logo_url: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  address: string | null;
  maps_url: string | null;
  maps_embed_url: string | null;
  instagram_url: string | null;
  primary_color: string;
  accent_color: string;
  surface_color: string;
  cta_label: string;
  home_title: string;
  home_description: string;
  footer_text: string;
  timezone: string;
  currency: string;
  booking_interval_minutes: number;
  manage_changes_lock_hours: number;
  require_email: boolean;
  privacy_policy_text: string;
  seo_title: string;
  seo_description: string;
  canonical_url: string | null;
};

export type Service = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  duration_minutes: number;
  price: number;
  image_url: string | null;
  image_alt: string;
  display_order: number;
};

export type ServiceCategory = { id: string; name: string; slug: string; description: string; display_order: number };
export type StaffMember = { id: string; full_name: string; bio: string; image_url: string | null; image_alt: string; service_ids: string[] };
export type Testimonial = { id: string; customer_name: string; content: string; rating: number };
export type GalleryItem = { id: string; title: string; image_url: string; image_alt: string };
export type Faq = { id: string; question: string; answer: string };

export type PublicSiteData = {
  configured: boolean;
  settings: SiteSettings | null;
  services: Service[];
  categories: ServiceCategory[];
  staff: StaffMember[];
  testimonials: Testimonial[];
  gallery: GalleryItem[];
  faqs: Faq[];
};

export type BookingSummary = {
  code: string;
  firstName: string;
  lastName: string;
  staffId: string;
  staffName: string;
  date: string;
  time: string;
  status: string;
  quotedTotal: number;
  services: Array<{ name: string; duration: number; price: number }>;
};
