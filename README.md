# Günün Şarkısı

Arkadaş grupları için günlük şarkı oyunu. Her gün herkese aynı soru gelir, herkes bir şarkı seçer, şarkılar isimsiz gösterilir, arkadaşlar "bunu kim seçti" diye tahmin eder ve en beğendikleri şarkıya oy verir.

Ayrıntılar ve kararlar için: [SPEC.md](SPEC.md)

## Durum

- [x] 1. İskelet: sunucu, SQLite şeması, grup kurma ve davet koduyla katılma
- [x] 2. Şarkı seçme (`pick`): 36 şarkılık sahte katalog, 30 günlük soru, arama ve seçim
- [x] 3. Tahmin ve oy (`guess`): isimsiz karışık liste, "kim seçti" tahmini, oy, aşamalar arası otomatik geçiş
- [x] 4. Sonuç ekranı ve yönetici düğmesi (`result`): günün şarkısı (beraberlikte birden fazla), kim neyi seçti, kimin tahmini tuttu
- [ ] 5. Görünüm, testler, yayına alma

## Çalıştırma

Gereken: Node.js 24 veya üstü (yerleşik `node:sqlite` modülü ve TypeScript dosyalarını doğrudan çalıştırma için).

```sh
npm install
npm run dev
```

- Veritabanı dosyası: `server/data/app.db`

Diğer komutlar:

```sh
npm test           # sunucu testleri
npm run typecheck  # TypeScript kontrolü
```

## Yapı

```
client/   Vite + React + TypeScript
server/   Express + TypeScript, node:sqlite
```
