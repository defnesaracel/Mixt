# Günün Şarkısı — Proje Şartnamesi (SPEC)

Arkadaş grupları için günlük şarkı oyunu. Her gün herkese aynı soru gelir, herkes bir şarkı seçer, şarkılar isimsiz gösterilir, arkadaşlar "bunu kim seçti" diye tahmin eder ve en beğendikleri şarkıya oy verir. En çok oyu alan şarkı günün şarkısı olur.

Bu dosya projenin tek doğru kaynağıdır. Claude Code: işe başlamadan önce bu dosyayı oku, kararları değiştirme, belirsiz bir yer görürsen kod yazmadan önce sor.

## Kararlar

| Konu | Karar |
|---|---|
| Platform | Mobil uyumlu web uygulaması |
| Teknoloji | React (frontend) + Node.js/Express (backend) |
| Veritabanı | SQLite |
| Giriş | Takma ad + grup davet kodu, şifre yok |
| Şarkı verisi | Şimdilik sahte katalog (`server/data/fakeSongs.json`), sonra Deezer veya iTunes Search API |
| Oyun | "Kim seçti" tahmini + en iyi şarkıya oy |
| Puan | Toplam puan ve sıralama yok. Sadece günün şarkısı ilan edilir. Tahmin sonuçları eğlence olarak sonuç ekranında gösterilir |
| Hedef | Prototip. Küçük, bitmiş ve çalışan bir şey. Kapsamı şişirme |

### Netleştirilen kararlar (2026-11-20)

| Konu | Karar |
|---|---|
| Aynı şarkıyı iki kişi seçerse | Listede iki ayrı satır olarak görünür (her seçim ayrı bir `pick`) |
| Günün sorusu | Koda gömülü 20–30 soruluk liste, her gün sırayla biri; liste bitince başa döner |
| "Bugün" | Europe/Istanbul saat dilimine göre. Tur o güne ait ilk istekte oluşturulur |
| Oy | Zorunlu. Oy verilebilecek şarkı yoksa (örn. sadece kendi şarkın) oy adımı atlanır |
| Proje yapısı | `client/` (Vite + React + TS), `server/` (Express + TS, Node'un yerleşik `node:sqlite` modülü), kökte `npm run dev` |
| Oturum | `users.token` sütununda rastgele belirteç, `Authorization: Bearer` başlığıyla gönderilir |
| Yayına alma | Render (ücretsiz) + Turso (barındırılan SQLite). Yerelde normal SQLite dosyası |

## Günlük akış (3 aşama)

Bir "tur" (round) üç aşamadan geçer: `pick` → `guess` → `result`.

1. **pick (Seç):** Herkes günün sorusuna bir şarkı seçer. Kimin ne seçtiği gizlidir.
2. **guess (Tahmin/Oy):** Gruptaki herkes seçince (ya da yönetici ilerletince) şarkılar isimsiz ve karışık sırada gösterilir.
   - Her şarkı için "bunu kim seçti" tahmini yapılır.
   - Her kullanıcı en beğendiği tek bir şarkıya oy verir. Kendi şarkına oy veremez.
3. **result (Sonuç):** Herkes tahmin ve oyunu tamamlayınca (ya da yönetici ilerletince) kim hangi şarkıyı seçmiş açılır.
   - En çok oyu alan şarkı günün şarkısıdır. Beraberlikte birden fazla kazanan olur.
   - Her kullanıcı için kaç tahmininin doğru çıktığı gösterilir (sadece bilgi, puan yok).

Prototipte test kolaylığı için bir **yönetici düğmesi** bulunur: grubu kuran kullanıcı aşamayı elle ilerletebilir.

## Kurallar ve sınır durumları

- Bir kullanıcı bir turda tek şarkı seçer (seçtikten sonra değiştirebilir, ta ki aşama `guess` olana kadar).
- İki kişi aynı şarkıyı seçebilir. Buna izin ver ve listede iki ayrı satır olarak göster; oy ve tahmin her satır için ayrı sayılır.
- Kendi şarkına oy verilemez. Kendi şarkın tahmin ekranında "senin seçimin" olarak işaretlenir ve tahmin gerektirmez.
- Bir tur kapandıktan sonra (result) hiçbir şey değiştirilemez.
- Bir kullanıcı gruptan ayrılırsa geçmiş turlardaki verisi kalır.

## Veri modeli (SQLite)

- `groups`: id, name, invite_code (benzersiz), created_at
- `users`: id, nickname, group_id, is_admin, token (benzersiz), created_at
- `rounds`: id, group_id, date, prompt, phase (`pick` | `guess` | `result`), created_at
- `picks`: id, round_id, user_id, title, artist, cover_url, created_at
- `guesses`: id, round_id, guesser_id, pick_id, guessed_user_id
- `votes`: id, round_id, voter_id, pick_id

Kısıtlar: `picks` için (round_id, user_id) benzersiz. `votes` için (round_id, voter_id) benzersiz. `guesses` için (round_id, guesser_id, pick_id) benzersiz. `rounds` için (group_id, date) benzersiz.

## Şarkı arama soyutlaması

Şarkı kaynağı tek bir fonksiyonun arkasında olacak:

```
searchSongs(query) -> [{ id, title, artist, coverUrl, previewUrl? }]
```

Şimdi `fakeSongs.json` içinden filtreler. Sonra Deezer veya iTunes Search API'ye geçmek sadece bu dosyanın değişmesi demektir. Sahte katalogda en az 30 uydurma şarkı bulunsun.

## API taslağı

- `POST /api/groups` — yeni grup kur (gövde: nickname, isteğe bağlı groupName) → davet kodu döner
- `POST /api/groups/join` — davet koduyla katıl (gövde: code, nickname)
- `GET /api/me` — oturumdaki kullanıcı ve grubu
- `GET /api/rounds/today` — bugünün turu ve aşamaya göre uygun veri
- `GET /api/songs/search?q=` — şarkı ara
- `POST /api/rounds/:id/pick` — şarkı seç
- `POST /api/rounds/:id/guess` — tahmin gönder (pick_id → guessed_user_id listesi)
- `POST /api/rounds/:id/vote` — oy ver
- `POST /api/rounds/:id/advance` — aşamayı ilerlet (sadece yönetici)

Kimlik: basit bir oturum belirteci (token). Şifre yok.

## Ekranlar

1. **Giriş:** Takma ad + davet koduyla katıl ya da yeni grup kur.
2. **Bugün:** Aşamaya göre değişen tek ekran.
   - `pick`: soru, şarkı arama kutusu, seçim, "bekleniyor (3/5 seçti)" göstergesi.
   - `guess`: isimsiz karışık şarkı listesi, her biri için kişi seçici, oy düğmesi.
   - `result`: günün şarkısı, kim neyi seçmiş, kimin tahmini tuttu.
3. **Geçmiş (isteğe bağlı, sonra):** Önceki günlerin kazanan şarkıları.

Tasarım ilkesi: önce telefon ekranı, büyük dokunma alanları, tek sütun.

## Yapım sırası

1. İskelet: Node/Express sunucusu, SQLite bağlantısı ve şema, grup kurma ve katılma.
2. `pick` aşaması: sahte katalog, şarkı arama, şarkı seçme.
3. `guess` aşaması: isimsiz liste, tahmin ve oy.
4. `result` ekranı ve yönetici düğmesi (aşama ilerletme).
5. Görünümü toparla, birkaç test ekle, yayına al, arkadaşlarla bir hafta dene.

Her adım bittiğinde çalışır durumda olsun ve ayrı bir commit olsun.

## Kapsam dışı (şimdilik yapma)

- Gerçek müzik API'si ve şarkı çalma
- Mobil uygulama, push bildirimi
- Toplam puan, sıralama tablosu, arkadaşlık isteği sistemi
- Şifreli hesaplar, Google ile giriş

## Çalışma talimatları (Claude Code için)

- Küçük adımlarla ilerle, her adımda ne yaptığını kısaca söyle.
- Kod stili: TypeScript tercih et, anlaşılır isimler, gereksiz soyutlama yok.
- Her adımın sonunda çalıştırıp test et, sonra commit at (anlamlı commit mesajı).
- Bu dosyada olmayan bir özellik ekleme. Gerekirse önce sor.
- `README.md`'yi proje ilerledikçe güncel tut: ne yaptığı, nasıl çalıştırılır, ekran görüntüsü.
