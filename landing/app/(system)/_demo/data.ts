// Sample data for the clickable prototype: a pretend café. Nothing here touches a real account.
// The same 14 platforms the homepage promises, in the same order.
export const PLATFORMS = ["Instagram", "Facebook", "TikTok", "YouTube", "X", "LinkedIn", "Threads", "Pinterest", "Bluesky", "WhatsApp", "Telegram", "Discord", "Snapchat", "Google Business"] as const;
export type Platform = (typeof PLATFORMS)[number];
// The homepage plan: "Up to 5 connected accounts".
export const MAX_ACCOUNTS = 5;
export type Category = "lead" | "complaint" | "question" | "unknown";
export type ItemStatus = "foryou" | "answered" | "ignored";
export type Message = { from: "customer" | "business"; text: string; at: string };

export type InboxItem = {
  id: string;
  who: string;
  platform: Platform;
  kind: "comment" | "DM";
  at: string;
  category: Category;
  status: ItemStatus;
  thread: Message[];
  draft?: string;
  source?: string; // the Business info topic the reply came from
  ignoredWhy?: string;
};

export type PostStatus = "published" | "scheduled" | "failed";
export type Post = { id: string; date: string; time: string; text: string; platforms: Platform[]; status: PostStatus };

export type LeadStatus = "new" | "contacted" | "done";
export type Lead = { id: string; name: string; ask: string; contact: string; from: string; at: string; status: LeadStatus };

export type Topic = { id: string; title: string; body: string };
export type ReplyMode = "off" | "ask" | "auto";

export type Demo = {
  business: string;
  connected: Partial<Record<Platform, boolean>>;
  items: InboxItem[];
  posts: Post[];
  leads: Lead[];
  topics: Topic[];
  unanswered: { q: string; times: number }[];
  modes: { questions: ReplyMode; leads: ReplyMode };
  paused: boolean;
  practiced: number;
  notify: { leads: boolean; complaints: boolean; failed: boolean };
};

export const connectedList = (d: Pick<Demo, "connected">) => PLATFORMS.filter((p) => d.connected[p]);

// The prototype's "today", fixed so the sample data always lines up.
export const TODAY = "2026-11-06";

const busy: Demo = {
  business: "Bayside Café",
  connected: { Instagram: true, Facebook: true },
  items: [
    {
      id: "carlo",
      who: "carlo.m",
      platform: "Instagram",
      kind: "DM",
      at: "9:30 AM",
      category: "lead",
      status: "foryou",
      thread: [{ from: "customer", text: "Hi! Table for 8 this Saturday, 7pm? It's for my dad's birthday.", at: "9:30 AM" }],
      draft: "Happy early birthday to your dad! We take groups of 8 by request. Our team will confirm Saturday 7pm with you shortly.",
      source: "Bookings",
    },
    {
      id: "jen",
      who: "jen.dc",
      platform: "Facebook",
      kind: "comment",
      at: "8:58 AM",
      category: "complaint",
      status: "foryou",
      thread: [{ from: "customer", text: "Waited 25 minutes and my coffee was cold. Not what I expect from you guys.", at: "8:58 AM" }],
    },
    {
      id: "dana",
      who: "dana.r",
      platform: "Facebook",
      kind: "comment",
      at: "8:41 AM",
      category: "lead",
      status: "foryou",
      thread: [{ from: "customer", text: "Do you make birthday cakes? Need a 2 kg one for Nov 12.", at: "8:41 AM" }],
      draft: "Yes, we make birthday cakes! Our team will message you to confirm the 2 kg cake for Nov 12.",
      source: "Cakes and catering",
    },
    {
      id: "ana",
      who: "ana.bakes",
      platform: "Instagram",
      kind: "comment",
      at: "8:12 AM",
      category: "unknown",
      status: "foryou",
      thread: [{ from: "customer", text: "Is your sourdough gluten free?", at: "8:12 AM" }],
    },
    {
      id: "kenji",
      who: "kenji.o",
      platform: "Instagram",
      kind: "comment",
      at: "8:20 AM",
      category: "question",
      status: "answered",
      thread: [
        { from: "customer", text: "Do you have oat milk?", at: "8:20 AM" },
        { from: "business", text: "Yes, oat milk is available on every coffee.", at: "8:20 AM" },
      ],
      source: "Menu",
    },
    {
      id: "marco",
      who: "marco.eats",
      platform: "Instagram",
      kind: "comment",
      at: "7:52 AM",
      category: "question",
      status: "answered",
      thread: [
        { from: "customer", text: "Are you open Sunday?", at: "7:52 AM" },
        { from: "business", text: "Yes! Sunday 8am to 2pm. See you there.", at: "7:52 AM" },
      ],
      source: "Opening hours",
    },
    {
      id: "lia",
      who: "lia.tan",
      platform: "Facebook",
      kind: "DM",
      at: "7:15 AM",
      category: "question",
      status: "answered",
      thread: [
        { from: "customer", text: "Is there parking nearby?", at: "7:15 AM" },
        { from: "business", text: "Yes, free street parking on Shore Road, and a paid lot behind the café.", at: "7:15 AM" },
      ],
      source: "Parking",
    },
    {
      id: "spam1",
      who: "growth.fast.247",
      platform: "Instagram",
      kind: "comment",
      at: "6:40 AM",
      category: "question",
      status: "ignored",
      thread: [{ from: "customer", text: "Get 10K followers today!! DM me", at: "6:40 AM" }],
      ignoredWhy: "Spam, hidden from your page",
    },
    {
      id: "emoji",
      who: "rico_ph",
      platform: "Instagram",
      kind: "comment",
      at: "6:05 AM",
      category: "question",
      status: "ignored",
      thread: [{ from: "customer", text: "🔥🔥🔥", at: "6:05 AM" }],
      ignoredWhy: "No reply needed",
    },
  ],
  posts: [
    { id: "p1", date: "2026-11-02", time: "9:00 AM", text: "New beans from Sagada are in. Come try the first batch.", platforms: ["Instagram", "Facebook"], status: "published" },
    { id: "p2", date: "2026-11-04", time: "8:00 AM", text: "The weekend menu is here: ube pancakes and more.", platforms: ["Instagram"], status: "published" },
    { id: "p3", date: "2026-11-05", time: "5:00 PM", text: "Thank you for a full house last night!", platforms: ["Facebook"], status: "failed" },
    { id: "p4", date: "2026-11-09", time: "9:00 AM", text: "Latte art class on Wednesday, 6pm. Six spots left.", platforms: ["Instagram", "Facebook"], status: "scheduled" },
    { id: "p5", date: "2026-11-13", time: "10:00 AM", text: "Friday deal: any pastry half off with your coffee.", platforms: ["Instagram", "Facebook"], status: "scheduled" },
    { id: "p6", date: "2026-11-14", time: "9:00 AM", text: "See you at the Saturday market, booth 12.", platforms: ["Instagram"], status: "scheduled" },
  ],
  leads: [
    { id: "l1", name: "Carlo M.", ask: "Table for 8, Saturday 7pm", contact: "@carlo.m", from: "Instagram DM", at: "Today, 9:30 AM", status: "new" },
    { id: "l2", name: "Dana R.", ask: "Birthday cake, 2 kg, Nov 12", contact: "dana.r on Facebook", from: "Facebook comment", at: "Today, 8:41 AM", status: "new" },
    { id: "l3", name: "Miguel S.", ask: "Catering for 30, asking for a quote", contact: "miguel@example.com", from: "Instagram DM", at: "Yesterday", status: "contacted" },
    { id: "l4", name: "Rhea L.", ask: "Private room for a team lunch", contact: "0900 000 0000", from: "Facebook DM", at: "Nov 3", status: "done" },
  ],
  topics: [
    { id: "t1", title: "Opening hours", body: "Monday to Saturday 7am to 9pm. Sunday 8am to 2pm." },
    { id: "t6", title: "Prices", body: "Coffee from ₱120, pastries from ₱95 and all-day breakfast from ₱280." },
    { id: "t7", title: "Location", body: "12 Shore Road, right beside the pier." },
    { id: "t2", title: "Menu", body: "Coffee, pastries and all-day breakfast. Oat milk is available on every coffee." },
    { id: "t3", title: "Parking", body: "Free street parking on Shore Road, and a paid lot behind the café." },
    { id: "t4", title: "Bookings", body: "We take groups of 8 or more by request. Our team confirms each booking." },
    { id: "t5", title: "Cakes and catering", body: "We make birthday cakes and cater events. Our team confirms each order and sends a quote." },
  ],
  unanswered: [
    { q: "Is your sourdough gluten free?", times: 3 },
    { q: "Do you allow dogs on the terrace?", times: 2 },
  ],
  modes: { questions: "ask", leads: "ask" },
  paused: false,
  practiced: 3,
  notify: { leads: true, complaints: true, failed: true },
};

const fresh: Demo = {
  business: "Bayside Café",
  connected: { Instagram: false, Facebook: false },
  items: [],
  posts: [],
  leads: [],
  topics: [],
  unanswered: [],
  modes: { questions: "ask", leads: "ask" },
  paused: false,
  practiced: 0,
  notify: { leads: true, complaints: true, failed: true },
};

export const SEEDS = { busy, fresh };
export type Scenario = keyof typeof SEEDS;

// 30 days of sample reach, ending today.
export const REACH_30 = [
  210, 180, 240, 520, 610, 300, 260, 190, 230, 480, 720, 410, 280, 240, 220, 260, 590, 680, 350, 290, 210, 250, 310, 640, 880, 470, 330, 290,
  340, 560,
];

export const POST_RESULTS = [
  { title: "Weekend menu: ube pancakes", when: "Nov 4", reached: 1240, comments: 18, buyers: 2 },
  { title: "New beans from Sagada", when: "Nov 2", reached: 860, comments: 9, buyers: 0 },
  { title: "Halloween latte art", when: "Oct 31", reached: 2110, comments: 34, buyers: 3 },
  { title: "Friday deal", when: "Oct 24", reached: 730, comments: 6, buyers: 1 },
];

export const WAGGLE_WORK = { answered: 212, handedToYou: 31, ignored: 64, buyers: 9 };
export const TOPIC_USE = [
  { topic: "Opening hours", times: 74 },
  { topic: "Menu", times: 61 },
  { topic: "Bookings", times: 38 },
  { topic: "Parking", times: 25 },
  { topic: "Cakes and catering", times: 14 },
];
export const AUDIENCE = {
  followers: { Instagram: 2480, Facebook: 1320 },
  gained: { Instagram: 86, Facebook: 21 },
  cities: [
    { city: "Quezon City", share: 38 },
    { city: "Makati", share: 21 },
    { city: "Pasig", share: 14 },
    { city: "Taguig", share: 9 },
  ],
  best: "Saturdays around 9am and Wednesdays around 6pm",
};
