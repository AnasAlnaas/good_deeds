// The cities people choose from at sign-up and in their details: nobody types
// a city, so the same city is always written the same way (reports group by it).
// The Arabic name is what is stored; the app shows the English one in English.
// To add a city, add a line: existing accounts are not affected.
// Each has a point near its middle (approximate: good for opening a map on the
// city, not for an address).

export interface City {
  ar: string;
  en: string;
  /** About the middle of the city: where a map opens before a place in it is chosen. */
  lat: number;
  lng: number;
}

export const LIBYAN_CITIES: readonly City[] = [
  { ar: 'طرابلس', en: 'Tripoli', lat: 32.8872, lng: 13.1913 },
  { ar: 'بنغازي', en: 'Benghazi', lat: 32.1167, lng: 20.0667 },
  { ar: 'مصراتة', en: 'Misrata', lat: 32.3754, lng: 15.0925 },
  { ar: 'الزاوية', en: 'Zawiya', lat: 32.7522, lng: 12.7278 },
  { ar: 'البيضاء', en: 'Bayda', lat: 32.7627, lng: 21.7551 },
  { ar: 'زليتن', en: 'Zliten', lat: 32.4674, lng: 14.5687 },
  { ar: 'الخمس', en: 'Khoms', lat: 32.6486, lng: 14.2619 },
  { ar: 'تاجوراء', en: 'Tajoura', lat: 32.8817, lng: 13.3506 },
  { ar: 'جنزور', en: 'Janzour', lat: 32.8172, lng: 13.0114 },
  { ar: 'القره بوللي', en: 'Garabulli', lat: 32.7500, lng: 13.7167 },
  { ar: 'مسلاتة', en: 'Msallata', lat: 32.5833, lng: 14.0333 },
  { ar: 'ترهونة', en: 'Tarhuna', lat: 32.4350, lng: 13.6332 },
  { ar: 'بني وليد', en: 'Bani Walid', lat: 31.7566, lng: 13.9942 },
  { ar: 'غريان', en: 'Gharyan', lat: 32.1722, lng: 13.0203 },
  { ar: 'يفرن', en: 'Yafran', lat: 32.0633, lng: 12.5286 },
  { ar: 'الزنتان', en: 'Zintan', lat: 31.9315, lng: 12.2529 },
  { ar: 'نالوت', en: 'Nalut', lat: 31.8683, lng: 10.9813 },
  { ar: 'غدامس', en: 'Ghadames', lat: 30.1337, lng: 9.5007 },
  { ar: 'صبراتة', en: 'Sabratha', lat: 32.7933, lng: 12.4885 },
  { ar: 'صرمان', en: 'Surman', lat: 32.7567, lng: 12.5716 },
  { ar: 'العجيلات', en: 'Al Ajaylat', lat: 32.7573, lng: 12.3763 },
  { ar: 'الجميل', en: 'Al Jumayl', lat: 32.8528, lng: 12.0611 },
  { ar: 'زوارة', en: 'Zuwara', lat: 32.9312, lng: 12.0820 },
  { ar: 'سرت', en: 'Sirte', lat: 31.2089, lng: 16.5887 },
  { ar: 'البريقة', en: 'Brega', lat: 30.4062, lng: 19.5738 },
  { ar: 'أجدابيا', en: 'Ajdabiya', lat: 30.7554, lng: 20.2263 },
  { ar: 'المرج', en: 'Marj', lat: 32.4926, lng: 20.8339 },
  { ar: 'الأبيار', en: 'Abyar', lat: 32.1899, lng: 20.5966 },
  { ar: 'توكرة', en: 'Tocra', lat: 32.5341, lng: 20.5791 },
  { ar: 'شحات', en: 'Shahhat', lat: 32.8281, lng: 21.8621 },
  { ar: 'القبة', en: 'Al Qubbah', lat: 32.7617, lng: 22.2420 },
  { ar: 'درنة', en: 'Derna', lat: 32.7670, lng: 22.6367 },
  { ar: 'طبرق', en: 'Tobruk', lat: 32.0836, lng: 23.9764 },
  { ar: 'جالو', en: 'Jalu', lat: 29.0333, lng: 21.5500 },
  { ar: 'الكفرة', en: 'Kufra', lat: 24.1997, lng: 23.2909 },
  { ar: 'هون', en: 'Hun', lat: 29.1268, lng: 15.9477 },
  { ar: 'ودان', en: 'Waddan', lat: 29.1614, lng: 16.1390 },
  { ar: 'سبها', en: 'Sabha', lat: 27.0377, lng: 14.4283 },
  { ar: 'براك الشاطئ', en: 'Brak', lat: 27.5496, lng: 14.2714 },
  { ar: 'أوباري', en: 'Ubari', lat: 26.5903, lng: 12.7751 },
  { ar: 'مرزق', en: 'Murzuq', lat: 25.9155, lng: 13.9184 },
  { ar: 'غات', en: 'Ghat', lat: 24.9647, lng: 10.1728 },
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

const plain = (t: string) =>
  t
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
const wordsOf = (t: string) => plain(t).split(/[^\p{L}]+/u).filter(Boolean);
// The word is the name, or the name behind a one-letter Arabic prefix (بطرابلس، وبنغازي).
const sameWord = (word: string, name: string, first: boolean) =>
  word === name || (first && name.length >= 4 && /^[وبلف]/.test(word) && word.slice(1) === name);

/**
 * The city named in a line someone wrote ("حديقة الحي، طرابلس"), by either of
 * its names; null = none of the list. The first one named wins.
 */
export function cityInText(text: string): City | null {
  const words = wordsOf(text);
  let found: { city: City; at: number; length: number } | null = null;
  for (const city of LIBYAN_CITIES) {
    for (const name of [city.ar, city.en]) {
      const parts = wordsOf(name);
      for (let i = 0; i + parts.length <= words.length; i++) {
        if (!parts.every((part, j) => sameWord(words[i + j], part, j === 0))) continue;
        if (!found || i < found.at || (i === found.at && parts.length > found.length)) found = { city, at: i, length: parts.length };
        break;
      }
    }
  }
  return found?.city ?? null;
}

// ---------- an event's address: the place, then its city ----------

/**
 * An event's address as the app's form writes it: the place in the city as
 * written, then the city chosen from the list (Owner's decision 2026-11-13: the
 * form asks for the city first, then the place in it).
 */
export function placeInCity(place: string, cityAr: string): string {
  const p = place.replace(/\s+/g, ' ').trim();
  return p ? `${p}، ${cityAr}` : cityAr;
}

/**
 * The reverse, for an event being edited or copied: the city named at the end
 * of the address, and the place before it. An older address may name its city
 * elsewhere (then the place is all of it) or not at all (no city).
 */
export function splitAddress(address: string): { place: string; city: City | null } {
  const text = address.replace(/\s+/g, ' ').trim();
  for (const city of LIBYAN_CITIES) {
    for (const name of [city.ar, city.en]) {
      if (text === name) return { place: '', city };
      for (const sep of ['، ', '،', ', ', ',', ' ']) {
        if (text.endsWith(sep + name)) return { place: text.slice(0, -(sep + name).length).trim(), city };
      }
    }
  }
  return { place: text, city: cityInText(text) };
}
