// Günün soruları. Her gün sırayla biri seçilir, liste bitince başa döner.
export const PROMPTS = [
  "Bugün modunu anlatan şarkı hangisi?",
  "Kötü bir günü kurtaran şarkın ne?",
  "Sabah uyanınca ilk dinlemek istediğin şarkı?",
  "Yağmurlu bir günde ne dinlersin?",
  "Lise yıllarını hatırlatan şarkı?",
  "Çocukken ezbere bildiğin şarkı?",
  "Bir yolculuğu hatırlatan şarkı?",
  "İlk aşkını hatırlatan şarkı?",
  "Uzun araba yolculuğunda mutlaka çalınması gereken şarkı?",
  "Spor yaparken seni gaza getiren şarkı?",
  "Ders çalışırken ya da çalışırken dinlediğin şarkı?",
  "Duşta bağıra bağıra söylediğin şarkı?",
  "Bir partiyi başlatacak şarkı?",
  "Gizlice sevdiğin \"utanç verici\" şarkı?",
  "Herkesin bilmediği ama bilmesi gereken bir şarkı?",
  "Hayatının film müziği olsa jenerik şarkısı ne olurdu?",
  "Kafandan çıkmayan şarkı?",
  "Bu gruba ithaf edeceğin şarkı?",
  "Bir ıssız adaya tek bir şarkı götürebilsen hangisi?",
  "Kendi düğününde çalmasını istediğin şarkı?",
  "Yaz tatilini hatırlatan şarkı?",
  "Gece yürüyüşünde kulaklıkta çalan şarkı?",
  "Ailenle birlikte söyleyebileceğin şarkı?",
  "Ağlatan şarkın hangisi?",
  "Dans etmeden duramadığın şarkı?",
  "Karaokede seçeceğin şarkı?",
  "Bir arkadaşını hatırlatan şarkı?",
  "Pazar sabahı şarkısı?",
  "Yıllardır dinlemekten bıkmadığın şarkı?",
  "Bu hafta keşfettiğin en iyi şarkı?",
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function promptForDate(date: string): string {
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
  return PROMPTS[dayNumber % PROMPTS.length];
}

// Europe/Istanbul saatine göre bugünün tarihi (YYYY-MM-DD).
export function todayInIstanbul(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
}
