// The cities people choose from at sign-up and in their details: nobody types
// a city, so the same city is always written the same way (reports group by it).
// The Arabic name is what is stored; the app shows the English one in English.
// To add a city, add a line: existing accounts are not affected.

export interface City {
  ar: string;
  en: string;
}

export const LIBYAN_CITIES: readonly City[] = [
  { ar: 'طرابلس', en: 'Tripoli' },
  { ar: 'بنغازي', en: 'Benghazi' },
  { ar: 'مصراتة', en: 'Misrata' },
  { ar: 'الزاوية', en: 'Zawiya' },
  { ar: 'البيضاء', en: 'Bayda' },
  { ar: 'زليتن', en: 'Zliten' },
  { ar: 'الخمس', en: 'Khoms' },
  { ar: 'تاجوراء', en: 'Tajoura' },
  { ar: 'جنزور', en: 'Janzour' },
  { ar: 'القره بوللي', en: 'Garabulli' },
  { ar: 'مسلاتة', en: 'Msallata' },
  { ar: 'ترهونة', en: 'Tarhuna' },
  { ar: 'بني وليد', en: 'Bani Walid' },
  { ar: 'غريان', en: 'Gharyan' },
  { ar: 'يفرن', en: 'Yafran' },
  { ar: 'الزنتان', en: 'Zintan' },
  { ar: 'نالوت', en: 'Nalut' },
  { ar: 'غدامس', en: 'Ghadames' },
  { ar: 'صبراتة', en: 'Sabratha' },
  { ar: 'صرمان', en: 'Surman' },
  { ar: 'العجيلات', en: 'Al Ajaylat' },
  { ar: 'الجميل', en: 'Al Jumayl' },
  { ar: 'زوارة', en: 'Zuwara' },
  { ar: 'سرت', en: 'Sirte' },
  { ar: 'البريقة', en: 'Brega' },
  { ar: 'أجدابيا', en: 'Ajdabiya' },
  { ar: 'المرج', en: 'Marj' },
  { ar: 'الأبيار', en: 'Abyar' },
  { ar: 'توكرة', en: 'Tocra' },
  { ar: 'شحات', en: 'Shahhat' },
  { ar: 'القبة', en: 'Al Qubbah' },
  { ar: 'درنة', en: 'Derna' },
  { ar: 'طبرق', en: 'Tobruk' },
  { ar: 'جالو', en: 'Jalu' },
  { ar: 'الكفرة', en: 'Kufra' },
  { ar: 'هون', en: 'Hun' },
  { ar: 'ودان', en: 'Waddan' },
  { ar: 'سبها', en: 'Sabha' },
  { ar: 'براك الشاطئ', en: 'Brak' },
  { ar: 'أوباري', en: 'Ubari' },
  { ar: 'مرزق', en: 'Murzuq' },
  { ar: 'غات', en: 'Ghat' },
];

/** The city as stored (its Arabic name), from either of its names; null = not in the list. */
export function cityOf(name: string): string | null {
  const n = name.trim();
  return LIBYAN_CITIES.find((c) => c.ar === n || c.en.toLowerCase() === n.toLowerCase())?.ar ?? null;
}

/** A stored city's name in the app's language. A name not in the list is shown as it is. */
export function cityName(stored: string, lang: 'ar' | 'en'): string {
  const city = LIBYAN_CITIES.find((c) => c.ar === stored);
  return city ? city[lang] : stored;
}
