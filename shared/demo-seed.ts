// Demo data. Times are built relative to the moment the demo is first opened,
// so there is always one event happening "now" for the attendance flow.
// Used by the offline demo (mobile/) and to fill the server's development
// database (server/: npm run db:seed).
// Build_Plan.md asks for 15 REAL past events of the association before phase 2;
// these are realistic stand-ins until those are collected.

import type { AppEvent, Attendance, Branch, BranchPillar, Db, GenderCategory, Pillar, User } from './types';
import { BASE_POINTS_BY_SUBTYPE, LEVELS } from './placeholders';
import { pillarWeights, pointsForAttendance } from './rules';

export const SEED_VERSION = 1;

export const DEMO_ACCOUNTS = {
  participant: 'u_ahmad',
  participantFemale: 'u_mariam',
  supervisor: 'u_khaled',
  supervisorFemale: 'u_fatima',
} as const;

// Shuab_AlIman_Research.md — the 20-item starter list. Pillars follow the
// "dominant nature" rule in that file; items the file does not map explicitly
// are a first guess. The list itself still needs review by scholars (is_agreed: false).
const BRANCHES: [string, string, string, Pillar[]][] = [
  ['b01', 'إماطة الأذى عن الطريق', 'Removing harm from the road', ['physical']],
  ['b02', 'إطعام الطعام', 'Feeding people', ['physical', 'spiritual']],
  ['b03', 'تعليم العلم', 'Teaching knowledge', ['mental']],
  ['b04', 'طلب العلم', 'Seeking knowledge', ['mental']],
  ['b05', 'تعليم القرآن وتحفيظه', "Teaching the Qur'an", ['spiritual']],
  ['b06', 'عيادة المريض', 'Visiting the sick', ['physical', 'spiritual']],
  ['b07', 'صلة الرحم', 'Keeping family ties', ['spiritual']],
  ['b08', 'برّ الوالدين', 'Kindness to parents', ['spiritual']],
  ['b09', 'الإحسان إلى الجار', 'Kindness to neighbours', ['spiritual']],
  ['b10', 'كفالة اليتيم', 'Caring for orphans', ['physical', 'spiritual']],
  ['b11', 'إغاثة الملهوف', 'Helping those in distress', ['physical']],
  ['b12', 'الصدقة', 'Charity', ['spiritual']],
  ['b13', 'الإصلاح بين الناس', 'Reconciling people', ['mental', 'spiritual']],
  ['b14', 'الأمر بالمعروف والنهي عن المنكر', 'Enjoining good', ['mental', 'spiritual']],
  ['b15', 'سقي الماء', 'Giving water', ['physical']],
  ['b16', 'غرس الشجر والزرع', 'Planting trees', ['physical']],
  ['b17', 'الرفق بالحيوان', 'Kindness to animals', ['physical']],
  ['b18', 'تشييع الجنائز وتجهيز الميت', 'Funeral rites', ['spiritual']],
  ['b19', 'إكرام الضيف', 'Honouring guests', ['spiritual']],
  ['b20', 'إفشاء السلام والتعاون على البر', 'Cooperating in good', ['spiritual']],
];

const PEOPLE: [string, string, 'male' | 'female', User['role']][] = [
  ['u_ahmad', 'أحمد سالم', 'male', 'member'],
  ['u_mariam', 'مريم علي', 'female', 'member'],
  ['u_khaled', 'خالد منصور', 'male', 'supervisor'],
  ['u_fatima', 'فاطمة الهوني', 'female', 'supervisor'],
  ['u_f1', 'محمد الطاهر', 'male', 'member'],
  ['u_f2', 'سارة المصراتي', 'female', 'member'],
  ['u_f3', 'عبدالله الفيتوري', 'male', 'member'],
  ['u_f4', 'هالة بن عمران', 'female', 'member'],
  ['u_f5', 'يوسف الككلي', 'male', 'member'],
  ['u_f6', 'نور الهدى القماطي', 'female', 'member'],
  ['u_f7', 'عمر الزوي', 'male', 'member'],
  ['u_f8', 'آمنة الورفلي', 'female', 'member'],
];

const ARRIVE = 'احضر قبل الموعد بعشر دقائق، وتوجّه إلى المشرف ليسجّل بدء نشاطك.';
const LEAVE = 'لا تنصرف قبل أن تُبلغ المشرف ليسجّل انتهاء نشاطك.';
const NO_PHOTOS = 'لا تصوّر المشاركين أو المارّة دون إذنهم.';

const TERMS: Record<string, string[]> = {
  street_cleanup: ['التزم بارتداء القفازات طوال العمل، ولا تلمس المخلفات الحادة بيدك.', NO_PHOTOS],
  beach_cleanup: ['التزم بارتداء القفازات طوال العمل، ولا تلمس المخلفات الحادة بيدك.', 'لا تنزل إلى الماء أثناء الحملة.', NO_PHOTOS],
  tree_planting: ['اتبع تعليمات المشرف في الحفر والغرس، ولا تستعمل الأدوات قبل أن يشرحها.', NO_PHOTOS],
  charity_kitchen: ['اغسل يديك والبس غطاء الرأس قبل لمس الطعام.', 'الطعام للتوزيع وحده، ولا يُؤخذ منه شيء.', 'حافظ على كرامة المستفيدين: لا تصوير ولا أسئلة عن أحوالهم.'],
  food_baskets: ['الطعام للتوزيع وحده، ولا يُؤخذ منه شيء.', 'حافظ على كرامة المستفيدين: لا تصوير ولا أسئلة عن أحوالهم.'],
  quran_circle: ['التزم بالمنهج الذي يحدده المشرف.', 'لا تنفرد بطفل في مكان مغلق؛ كن دائماً بحضور مشرف آخر أو مجموعة.'],
  elderly_visit: ['لا تصوّر النزلاء إطلاقاً.', 'لا تقدّم طعاماً أو هدايا دون موافقة إدارة الدار.', 'لا تَعِد بزيارات أو مساعدات لا تستطيع الوفاء بها.'],
  orphanage_visit: ['لا تصوّر الأطفال إطلاقاً.', 'لا تقدّم هدايا فردية؛ الهدايا توزَّع عن طريق الدار.', 'لا تَعِد بزيارات أو مساعدات لا تستطيع الوفاء بها.'],
  tutoring: ['حضّر الدرس المكلّف به قبل الموعد.', 'لا تأخذ أجراً أو هدية من الطلاب أو أهاليهم.'],
  mosque_cleaning: ['التزم بآداب المسجد، واخلع حذاءك في الأماكن المخصصة.', 'لا تحرّك المصاحف أو الكتب دون تعليمات المشرف.'],
  traffic_awareness: ['لا تقف وسط الطريق، والتزم بالرصيف والسترة العاكسة طوال الوقت.', 'وزّع المنشورات على المشاة والسيارات المتوقفة فقط.'],
  water_coolers: ['لا تتعامل مع التوصيلات الكهربائية؛ يتولاها الفني المختص.', NO_PHOTOS],
  first_aid_course: ['احضر الجلسات كاملة؛ الشهادة تُمنح لمن أتمّ الدورة.', 'التدريب العملي على الدمى فقط، لا على المشاركين.'],
};

interface EventSpec {
  id: string;
  title: string;
  description: string;
  subtype: string;
  address: string;
  lat: number;
  lng: number;
  start: Date;
  end: Date;
  capacity: number;
  gender: GenderCategory;
  branches: string[];
  organizers: string[];
  joined: string[];
}

export function buildSeed(nowMs: number): Db {
  const now = new Date(nowMs);
  const iso = (d: Date) => d.toISOString();
  const minutes = (m: number) => new Date(nowMs + m * 60_000);
  const day = (offset: number, h: number, m = 0) => {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + offset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const created = iso(day(-30, 9));

  const events: EventSpec[] = [
    {
      id: 'e01', title: 'حملة نظافة السراج', subtype: 'street_cleanup',
      description: 'تنظيف شوارع الحي وجمع المخلفات من الأرصفة والساحات، بالتعاون مع أهل الحي. الأدوات والأكياس متوفرة في نقطة التجمع.',
      address: 'حي السراج، طرابلس', lat: 32.854, lng: 13.1,
      start: minutes(-90), end: minutes(150), capacity: 20, gender: 'mixed',
      branches: ['b01'], organizers: ['u_khaled'],
      joined: ['u_ahmad', 'u_mariam', 'u_f1', 'u_f2', 'u_f3', 'u_f4'],
    },
    {
      id: 'e02', title: 'تنظيف شاطئ جنزور', subtype: 'beach_cleanup',
      description: 'جمع البلاستيك والمخلفات من الشاطئ قبل موسم الشتاء، وفرزها لإعادة التدوير.',
      address: 'شاطئ جنزور، طرابلس', lat: 32.827, lng: 13.005,
      start: day(1, 8), end: day(1, 11), capacity: 30, gender: 'mixed',
      branches: ['b01'], organizers: ['u_khaled'], joined: ['u_f3', 'u_f6'],
    },
    {
      id: 'e03', title: 'حملة تشجير في الهضبة', subtype: 'tree_planting',
      description: 'غرس شتلات الزيتون والسدر على جانبي الطريق، وتجهيز أحواض الري.',
      address: 'الهضبة، طرابلس', lat: 32.835, lng: 13.205,
      start: day(3, 15), end: day(3, 18), capacity: 25, gender: 'male',
      branches: ['b16'], organizers: ['u_khaled'], joined: ['u_f1', 'u_f5'],
    },
    {
      id: 'e04', title: 'مطبخ خيري: إعداد وجبات وتوزيعها', subtype: 'charity_kitchen',
      description: 'إعداد وجبات ساخنة وتغليفها لتوزيعها على أسر محتاجة يحددها فريق الجمعية.',
      address: 'سوق الجمعة، طرابلس', lat: 32.886, lng: 13.25,
      start: day(2, 10), end: day(2, 14), capacity: 15, gender: 'female',
      branches: ['b02'], organizers: ['u_fatima'], joined: ['u_f2', 'u_f8'],
    },
    {
      id: 'e05', title: 'حلقة تحفيظ قرآن للأطفال', subtype: 'quran_circle',
      description: 'حلقة أسبوعية لتحفيظ جزء عمّ للأطفال من ٧ إلى ١٢ سنة، بإشراف محفّظ من الجمعية.',
      address: 'الظهرة، طرابلس', lat: 32.893, lng: 13.195,
      start: day(1, 17), end: day(1, 19), capacity: 10, gender: 'male',
      branches: ['b05'], organizers: ['u_khaled'], joined: ['u_f7'],
    },
    {
      id: 'e06', title: 'زيارة دار المسنين', subtype: 'elderly_visit',
      description: 'زيارة النزيلات، ومجالستهن، ومساعدة فريق الدار في يوم النشاط الشهري.',
      address: 'تاجوراء، طرابلس', lat: 32.882, lng: 13.35,
      start: day(4, 10), end: day(4, 12), capacity: 12, gender: 'female',
      branches: ['b20'], organizers: ['u_fatima'], joined: ['u_f6'],
    },
    {
      id: 'e07', title: 'دروس تقوية مجانية لطلاب الشهادة الإعدادية', subtype: 'tutoring',
      description: 'دروس في الرياضيات والعلوم لطلاب الصف التاسع قبل الامتحانات، في قاعة الجمعية.',
      address: 'حي الأندلس، طرابلس', lat: 32.872, lng: 13.132,
      start: day(5, 16), end: day(5, 18), capacity: 20, gender: 'mixed',
      branches: ['b03'], organizers: ['u_khaled'], joined: ['u_f4'],
    },
    {
      id: 'e08', title: 'تنظيف مسجد وفرشه', subtype: 'mosque_cleaning',
      description: 'تنظيف المسجد وغسل السجاد وترتيب المكتبة استعداداً لصلاة الجمعة.',
      address: 'قرقارش، طرابلس', lat: 32.865, lng: 13.118,
      start: day(6, 9), end: day(6, 12), capacity: 15, gender: 'male',
      branches: ['b01', 'b20'], organizers: ['u_khaled'], joined: [],
    },
    {
      id: 'e09', title: 'زيارة دار أيتام ويوم ترفيهي', subtype: 'orphanage_visit',
      description: 'يوم ألعاب ومسابقات مع أطفال الدار، وتوزيع الهدايا عن طريق إدارتها.',
      address: 'باب بن غشير، طرابلس', lat: 32.86, lng: 13.19,
      start: day(7, 10), end: day(7, 14), capacity: 25, gender: 'mixed',
      branches: ['b10'], organizers: ['u_khaled', 'u_fatima'], joined: ['u_f2', 'u_f5'],
    },
    {
      id: 'e10', title: 'حملة توعية مرورية', subtype: 'traffic_awareness',
      description: 'توزيع منشورات عن السرعة وحزام الأمان، والحديث مع المشاة عند الإشارات.',
      address: 'ساحة الشهداء، طرابلس', lat: 32.8955, lng: 13.1803,
      start: day(3, 9), end: day(3, 12), capacity: 20, gender: 'mixed',
      branches: ['b14', 'b03'], organizers: ['u_khaled'], joined: [],
    },
    {
      id: 'e11', title: 'تركيب برّادات ماء عامة', subtype: 'water_coolers',
      description: 'تركيب ثلاثة برّادات ماء قرب المدارس والمسجد، بالتنسيق مع الفني المختص.',
      address: 'عين زارة، طرابلس', lat: 32.8, lng: 13.25,
      start: day(8, 8), end: day(8, 12), capacity: 12, gender: 'male',
      branches: ['b15'], organizers: ['u_khaled'], joined: ['u_f3'],
    },
    {
      id: 'e12', title: 'دورة إسعافات أولية', subtype: 'first_aid_course',
      description: 'دورة عملية في الإسعافات الأولية يقدّمها مسعف معتمد. العدد محدود.',
      address: 'الظهرة، طرابلس', lat: 32.896, lng: 13.2,
      start: day(2, 17), end: day(2, 20), capacity: 5, gender: 'mixed',
      branches: ['b03', 'b11'], organizers: ['u_khaled'],
      joined: ['u_f1', 'u_f2', 'u_f3', 'u_f4', 'u_f5'],
    },
    // ---- finished ----
    {
      id: 'e13', title: 'حملة تنظيف حي الظهرة', subtype: 'street_cleanup',
      description: 'تنظيف الشوارع الخلفية للحي وإزالة المخلفات المتراكمة.',
      address: 'الظهرة، طرابلس', lat: 32.891, lng: 13.192,
      start: day(-10, 16), end: day(-10, 19), capacity: 20, gender: 'male',
      branches: ['b01'], organizers: ['u_khaled'], joined: ['u_ahmad', 'u_f1'],
    },
    {
      id: 'e14', title: 'تجهيز وتوزيع سلال غذائية', subtype: 'food_baskets',
      description: 'تعبئة السلال الغذائية في مقر الجمعية وتوزيعها على الأسر المسجلة.',
      address: 'مقر الجمعية، طرابلس', lat: 32.878, lng: 13.175,
      start: day(-20, 10), end: day(-20, 13), capacity: 20, gender: 'mixed',
      branches: ['b02', 'b12'], organizers: ['u_khaled'], joined: ['u_ahmad', 'u_mariam'],
    },
    {
      id: 'e15', title: 'تنظيف شاطئ طرابلس', subtype: 'beach_cleanup',
      description: 'جمع المخلفات من الشاطئ قرب باب البحر.',
      address: 'باب البحر، طرابلس', lat: 32.9, lng: 13.176,
      start: day(-2, 9), end: day(-2, 12), capacity: 30, gender: 'mixed',
      branches: ['b01'], organizers: ['u_khaled'], joined: ['u_ahmad', 'u_mariam'],
    },
  ];

  const users: User[] = PEOPLE.map(([id, name, gender, role], i) => ({
    id,
    full_name: name,
    gender,
    phone: `+21891${String(1000000 + i * 137391).slice(0, 7)}`,
    email: null,
    city: 'طرابلس',
    avatar_url: null,
    role,
    level: 1,
    total_points: 0,
    is_association_member: true,
    created_at: created,
    deleted_at: null,
  }));

  const branches: Branch[] = BRANCHES.map(([id, ar, en]) => ({
    id, name_ar: ar, name_en: en, source_ref: 'Shuab_AlIman_Research.md', is_agreed: false, is_active: true,
  }));
  const branch_pillars: BranchPillar[] = BRANCHES.flatMap(([id, , , ps]) => ps.map((p) => ({ branch_id: id, pillar: p })));

  const db: Db = {
    version: SEED_VERSION,
    users,
    branches,
    branch_pillars,
    events: [],
    event_organizers: [],
    event_branches: [],
    event_terms: [],
    registrations: [],
    term_acceptances: [],
    attendance: [],
    points_ledger: [],
    levels: LEVELS,
  };

  for (const s of events) {
    const e: AppEvent = {
      id: s.id,
      title: s.title,
      description: s.description,
      subtype: s.subtype,
      image_url: null,
      lat: s.lat,
      lng: s.lng,
      address_text: s.address,
      starts_at: iso(s.start),
      ends_at: iso(s.end),
      capacity: s.capacity,
      gender_category: s.gender,
      base_points: BASE_POINTS_BY_SUBTYPE[s.subtype] ?? 20,
      status: 'published',
      terms_locked_at: s.joined.length ? created : null,
      created_by: s.organizers[0],
      created_at: created,
    };
    db.events.push(e);
    s.organizers.forEach((u) => db.event_organizers.push({ event_id: s.id, user_id: u }));
    s.branches.forEach((b) => db.event_branches.push({ event_id: s.id, branch_id: b }));
    const texts = [ARRIVE, ...(TERMS[s.subtype] ?? []), LEAVE];
    texts.forEach((text, i) =>
      db.event_terms.push({
        id: `${s.id}_t${i + 1}`, event_id: s.id, order_index: i + 1,
        text, image_url: null, audio_url: null, created_at: created,
      }),
    );
    for (const u of s.joined) {
      const regId = `reg_${s.id}_${u}`;
      db.registrations.push({
        id: regId, event_id: s.id, user_id: u, status: 'joined', joined_at: created, created_at: created,
      });
      texts.forEach((_, i) =>
        db.term_acceptances.push({ id: `acc_${regId}_${i + 1}`, registration_id: regId, term_id: `${s.id}_t${i + 1}`, accepted_at: created }),
      );
    }
  }

  const att = (
    eventId: string, userId: string, start: Date, end: Date | null,
    endSource: Attendance['end_source'], status: Attendance['participant_status'],
    startSource: Attendance['start_source'] = 'live',
  ) => {
    const a: Attendance = {
      id: `att_${eventId}_${userId}`,
      event_id: eventId,
      user_id: userId,
      started_at: iso(start),
      start_source: startSource,
      ended_at: end ? iso(end) : null,
      end_source: end ? endSource : null,
      hours: end ? Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100 : null,
      recorded_by: 'u_khaled',
      recorded_at: iso(start),
      participant_status: status,
      participant_acted_at: status === 'pending' ? null : iso(end ?? start),
    };
    db.attendance.push(a);
    return a;
  };

  // Running event: one volunteer working now, one already finished (backdated start).
  att('e01', 'u_f1', minutes(-40), null, null, 'pending');
  att('e01', 'u_f2', minutes(-90), minutes(-10), 'live', 'pending', 'backdated');
  // History for the demo participants.
  att('e13', 'u_ahmad', day(-10, 16), day(-10, 19), 'live', 'confirmed');
  att('e14', 'u_ahmad', day(-20, 10), day(-20, 12, 30), 'live', 'confirmed');
  att('e14', 'u_mariam', day(-20, 10), day(-20, 13), 'live', 'confirmed');
  // Waiting for the participant to confirm or dispute.
  att('e15', 'u_ahmad', day(-2, 9, 10), day(-2, 11, 40), 'live', 'pending');
  att('e15', 'u_mariam', day(-2, 9, 30), day(-2, 12), 'auto_closed', 'pending');

  // Ledger rows for already-confirmed attendance, computed with the same formula as the server.
  for (const a of db.attendance.filter((x) => x.participant_status === 'confirmed')) {
    const e = db.events.find((x) => x.id === a.event_id)!;
    const branchIds = db.event_branches.filter((x) => x.event_id === e.id).map((x) => x.branch_id);
    const links = db.branch_pillars.filter((x) => branchIds.includes(x.branch_id)).map((x) => x.pillar);
    const pts = pointsForAttendance(e, a.hours, pillarWeights(links));
    for (const p of ['spiritual', 'mental', 'physical'] as Pillar[]) {
      if (pts[p] > 0) {
        db.points_ledger.push({
          id: `pl_${a.id}_${p}`, user_id: a.user_id, event_id: a.event_id, pillar: p,
          points: pts[p], reason: 'attendance_confirmed', created_at: a.participant_acted_at ?? iso(now),
        });
      }
    }
  }
  for (const u of db.users) {
    const total = db.points_ledger.filter((l) => l.user_id === u.id).reduce((s, l) => s + l.points, 0);
    u.total_points = Math.round(total * 100) / 100;
    u.level = [...LEVELS].reverse().find((l) => total >= l.min_points)!.level;
  }

  return db;
}
