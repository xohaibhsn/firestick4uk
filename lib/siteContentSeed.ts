/**
 * Canonical site_content / page-builder seed defaults.
 * Used by one-time migration scripts. Runtime APIs must NOT seed the DB.
 */
import { EXTRA_CONTENT_DEFAULTS } from "./siteContentDefaults";

/** Tuple: key, value, type, page, label */
export type SiteContentDefault = [string, string, string, string, string];

/** Tuple: key, value, type, page, label, section_order, is_visible */
export type SectionDefault = [string, string, string, string, string, number, number];

export const CORE_SITE_CONTENT_DEFAULTS: SiteContentDefault[] = [
  ["site_title", "Firestick4UK", "text", "settings", "Website Title"],
  ["site_tagline", "Best Firestick Service in UK", "text", "settings", "Website Tagline"],
  ["site_logo_url", "", "image", "settings", "Site Logo"],
  ["favicon_url", "/favicon.ico", "image", "settings", "Favicon URL"],
  ["og_default_image", "", "image", "settings", "Default OG Share Image"],
  ["whatsapp_number", "447518787653", "text", "settings", "WhatsApp Number"],
  ["whatsapp_icon_url", "", "image", "settings", "WhatsApp Button Icon"],
  ["contact_whatsapp", "447518787653", "text", "settings", "WhatsApp Number"],
  ["contact_phone", "+447518787653", "text", "settings", "Phone Number"],
  ["contact_email", "firestick4uk@gmail.com", "text", "settings", "Contact Email"],
  ["contact_telegram", "@firestick44", "text", "settings", "Telegram Handle"],
  ["home_top_hero_title", "Best Firestick Service in UK", "text", "home", "Top Hero Title"],
  [
    "home_top_hero_subtitle",
    "Premium Streaming Solutions for the UK",
    "textarea",
    "home",
    "Top Hero Subtitle",
  ],
  ["home_hero_title", "Premium UK Streaming Service", "text", "home", "Main Hero Title"],
  [
    "home_hero_subtitle",
    "Firestick4UK provides premium UK streaming services for Firestick and Android Box users.",
    "textarea",
    "home",
    "Main Hero Subtitle",
  ],
  ["home_hero_btn_text", "Shop Now", "text", "home", "Main Hero Primary Button"],
  ["home_hero_btn_link", "/products", "text", "home", "Main Hero Primary Button Link"],
  ["home_hero_btn_show", "1", "text", "home", "Show Primary Button"],
  ["home_hero_btn2_text", "Learn More", "text", "home", "Main Hero Secondary Button"],
  ["home_hero_btn2_link", "/about", "text", "home", "Main Hero Secondary Button Link"],
  ["home_hero_btn2_show", "1", "text", "home", "Show Secondary Button"],
  ["home_stat1_num", "500+", "text", "home", "Stat 1 Number"],
  ["home_stat1_label", "Happy Customers", "text", "home", "Stat 1 Label"],
  ["home_stat2_num", "4.9★", "text", "home", "Stat 2 Number"],
  ["home_stat2_label", "Average Rating", "text", "home", "Stat 2 Label"],
  ["home_stat3_num", "24/7", "text", "home", "Stat 3 Number"],
  ["home_stat3_label", "Support", "text", "home", "Stat 3 Label"],
  ["home_tagline", "Fast. Reliable. Affordable.", "text", "home", "Tagline"],
  ["home_meta_title", "Firestick4UK — Best Streaming Service UK", "text", "home", "Meta Title"],
  [
    "home_meta_description",
    "Premium Firestick subscriptions and streaming services in the UK. HD & 4K channels, live sports, movies and more.",
    "textarea",
    "home",
    "Meta Description",
  ],
  ["about_title", "About Firestick4UK", "text", "about", "Page Title"],
  [
    "about_description",
    "We started Firestick4UK with one goal — to make premium streaming devices and subscription plans accessible, affordable, and hassle-free for everyone in the UK.",
    "textarea",
    "about",
    "Main Description",
  ],
  [
    "about_mission",
    "Our mission is to deliver the best streaming experience at fair prices, with real human support that actually helps.",
    "textarea",
    "about",
    "Mission Statement",
  ],
  ["contact_hours", "9AM – 10PM, 7 days a week", "text", "contact", "Business Hours"],
  ["contact_address", "United Kingdom", "text", "contact", "Address"],
  ["footer_text", "© 2026 Firestick4UK. All rights reserved.", "textarea", "footer", "Footer Text"],
  ["footer_tagline", "Premium Firestick Services UK", "text", "footer", "Footer Tagline"],
  ["hero_slide_1", "", "image", "settings", "Hero Slide 1"],
  ["hero_slide_2", "", "image", "settings", "Hero Slide 2"],
  ["hero_slide_3", "", "image", "settings", "Hero Slide 3"],
  ["hero_slide_4", "", "image", "settings", "Hero Slide 4"],
  [
    "home_features_list",
    "HD & 4K Streaming Quality\nLive Sports & Entertainment\nMovies & TV Series On Demand\nCatch-up TV Available\nCompatible with All Devices\nFast Setup & Activation\n24/7 Customer Support\nUK Based Service\nEasy Remote Setup Help\nNo Hidden Fees\nSame-Day Order Processing\nSecure Payment Options\nMulti-Device Compatibility\nRegular Channel Updates",
    "textarea",
    "home",
    "Service Features Content",
  ],
];

export const SITE_CONTENT_DEFAULTS: SiteContentDefault[] = [
  ...CORE_SITE_CONTENT_DEFAULTS,
  ...EXTRA_CONTENT_DEFAULTS,
];

export const SECTION_DEFAULTS: SectionDefault[] = [
  [
    "home_hero",
    '{"title":"Premium UK Streaming Service","subtitle":"Firestick4UK provides premium UK streaming services for Firestick and Android Box users.","button_text":"Shop Now","button_link":"/products","secondary_button_text":"Learn More","secondary_button_link":"/about"}',
    "json",
    "home",
    "Hero Section",
    1,
    1,
  ],
  [
    "home_featured_products",
    '{"title":"Our Products","subtitle":"Premium streaming solutions for every need","show_count":6}',
    "json",
    "home",
    "Featured Products Section",
    2,
    1,
  ],
  [
    "home_features",
    '{"title":"Why Choose Us","items":[{"icon":"⚡","title":"Fast Setup","description":"Ready in minutes"},{"icon":"🔒","title":"Secure","description":"Safe & reliable"},{"icon":"💬","title":"24/7 Support","description":"Always here for you"},{"icon":"🚀","title":"Fast Delivery","description":"Quick & efficient"}]}',
    "json",
    "home",
    "Features Section",
    3,
    1,
  ],
  [
    "home_testimonials",
    '{"title":"What Our Customers Say","items":[{"name":"John Smith","rating":5,"text":"Amazing service! Got my Firestick set up in minutes."},{"name":"Sarah Jones","rating":5,"text":"Best firestick service in UK! Great value."}]}',
    "json",
    "home",
    "Testimonials Section",
    4,
    1,
  ],
  [
    "home_newsletter",
    '{"title":"Stay in the Loop","subtitle":"Get the latest guides, tips and offers delivered to your inbox","button_text":"Subscribe"}',
    "json",
    "home",
    "Newsletter Section",
    5,
    1,
  ],
  [
    "about_hero",
    '{"title":"About Firestick4UK","subtitle":"Your trusted streaming partner in the UK"}',
    "json",
    "about",
    "Hero Section",
    1,
    1,
  ],
  [
    "about_mission",
    '{"title":"Our Mission","text":"We provide premium firestick services to make streaming accessible for everyone in the UK. Founded by tech enthusiasts, we believe in fair prices and real human support."}',
    "json",
    "about",
    "Mission Section",
    2,
    1,
  ],
  [
    "about_values",
    '{"title":"Our Values","items":[{"icon":"🎯","title":"Quality","description":"Best in class service every time"},{"icon":"❤️","title":"Trust","description":"Transparent & honest always"},{"icon":"🚀","title":"Speed","description":"Fast delivery & setup"}]}',
    "json",
    "about",
    "Values Section",
    3,
    1,
  ],
];
