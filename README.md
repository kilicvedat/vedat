# Saha Ziyaret Takip Sistemi

Distribütör saha ziyaretlerini kaydetmek için React + Supabase tabanlı web uygulaması (PWA). Telefon tarayıcısından "Ana Ekrana Ekle" ile uygulama gibi kullanılabilir.

## 1) Supabase projesi kur

1. https://supabase.com üzerinden ücretsiz bir hesap aç, "New Project" ile bir proje oluştur.
2. Proje açıldıktan sonra sol menüden **SQL Editor**'e gir, bu klasördeki `schema.sql` dosyasının tamamını yapıştırıp **Run** ile çalıştır. Bu işlem tabloları, güvenlik kurallarını, örnek distribütör verisini ve fotoğraf depolama alanını oluşturur.
3. Sol menüden **Settings > API**'ye git. Şu iki değeri kopyala:
   - `Project URL`
   - `anon public` anahtarı

## 2) Ortam değişkenlerini ayarla

Bu klasörde `.env.example` dosyasını `.env` olarak kopyala ve az önce aldığın değerleri yapıştır:

```
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

## 3) Yerelde çalıştır (isteğe bağlı, test için)

```
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` açılır. "Hesap Oluştur" ile ilk kullanıcını oluştur.

## 4) İlk admin kullanıcısını ata

Yeni kayıt olan her kullanıcı varsayılan olarak **rep** (saha temsilcisi) rolüyle oluşturulur. Kendini admin yapmak için:

1. Supabase panelinde **Table Editor > profiles** tablosuna git.
2. Kendi satırını bul, `role` sütununu `admin` olarak değiştir.

Bundan sonra diğer kullanıcıların rollerini de (rep / manager / admin) buradan yönetebilirsin.

## 5) GitHub'a yükle

```
git init
git add .
git commit -m "İlk sürüm"
```

GitHub'da yeni bir repo oluştur (ör. `saha-ziyaret`), sonra:

```
git remote add origin https://github.com/KULLANICI_ADIN/saha-ziyaret.git
git push -u origin main
```

## 6) Netlify'a deploy et

1. https://app.netlify.com → **Add new site > Import an existing project**
2. GitHub reponu seç.
3. Build ayarları:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Environment variables** kısmına `.env` dosyandaki iki değişkeni ekle (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — bunlar Netlify'a hiç yüklenmez, ayrı eklenmesi gerekir.
5. Deploy'a bas.

## 7) vedatkilic.com'u bağla

1. Netlify'da siteye gir → **Domain settings > Add a domain**.
2. `vedatkilic.com` (veya bir alt alan adı, ör. `saha.vedatkilic.com`) yazıp ekle.
3. Netlify sana bir CNAME/A kaydı verecek — bu kaydı domain'i satın aldığın yerin (GoDaddy, Natro vb.) DNS panelinden ekle.
4. DNS yayılması genelde birkaç dakika–birkaç saat sürer. Netlify otomatik ücretsiz SSL sertifikası kurar.

## Bilinen sınırlamalar / sıradaki adımlar

- Rol atama şu an manuel (Supabase panelinden). İstersen ileride admin panelinden kullanıcı/rol yönetimi ekleyebiliriz.
- Distribütör ekleme/düzenleme arayüzü yok, şu an sadece `schema.sql` ile veya Supabase Table Editor'den eklenebiliyor.
- Harita görünümü yok — ileride Google Maps/Mapbox entegrasyonu eklenebilir.
- Offline senkronizasyon henüz yok — internet olmadan form gönderimi başarısız olur.
- RLS (satır güvenliği) kuralları basit tutuldu; gerçek kullanımda "rep sadece kendi ziyaretini düzenler" gibi daha sıkı kurallar eklenmeli.
