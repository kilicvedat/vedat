import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  MapPin, CheckCircle2, Clock, Camera, Package, FileText, Users,
  Download, X, Plus, Trash2, LogOut, Navigation,
  AlertCircle, Loader2, ChevronRight, Gauge, Search, ClipboardList,
} from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Static product catalog (move to a `products` table later if it needs to
// change without a redeploy)
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { id: "p1", name: "M OIL 5W-30 Sentetik Motor Yağı" },
  { id: "p2", name: "M OIL 15W-40 Mineral Motor Yağı" },
  { id: "p3", name: "Valvoline VPS Racing 10W-60" },
  { id: "p4", name: "M OIL Şanzıman Yağı 80W-90" },
  { id: "p5", name: "M OIL Antifriz -36°C" },
  { id: "p6", name: "M OIL Gres Yağı EP-2" },
  { id: "p7", name: "Valvoline Endüstriyel Hidrolik Yağ" },
];

const VISIT_TYPES = ["Rutin Ziyaret", "Şikayet", "Tahsilat", "Yeni Müşteri", "Stok Kontrolü"];
const DAILY_TARGET = 6;
const GEOFENCE_METERS = 200;
const PHOTO_BUCKET = "visit-photos";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function haversineMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null, error: "Bu cihazda konum servisi yok" });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null }),
      (err) => resolve({ lat: null, lng: null, error: err.message || "Konum alınamadı" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

function resizeImageToBlob(file, maxW = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Görsel yüklenemedi"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return "—";
  const mins = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Supabase data access
// ---------------------------------------------------------------------------
async function fetchDistributors() {
  const { data, error } = await supabase.from("distributors").select("*").order("name");
  if (error) { console.error(error); return []; }
  return data;
}

async function fetchVisits() {
  const { data, error } = await supabase.from("visits").select("*").order("check_in_time", { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

async function insertVisit(visit) {
  const { data, error } = await supabase.from("visits").insert(visit).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

async function updateVisit(id, patch) {
  const { data, error } = await supabase.from("visits").update(patch).eq("id", id).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

async function uploadVisitPhoto(visitId, file) {
  const blob = await resizeImageToBlob(file);
  const path = `${visitId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (uploadError) { console.error(uploadError); return null; }
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Small UI primitives
// ---------------------------------------------------------------------------
function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-[#2A3138] text-[#B7C0CA]",
    success: "bg-[#123821] text-[#4ADE80]",
    warn: "bg-[#3A2A10] text-[#E5A93F]",
    danger: "bg-[#3A1618] text-[#F0696E]",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
function Card({ children, className = "" }) {
  return <div className={`bg-[#1E252B] border border-[#2A3138] rounded-2xl ${className}`}>{children}</div>;
}
function PrimaryButton({ children, onClick, disabled, className = "", type = "button" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`bg-[#D68A2E] hover:bg-[#C67D24] disabled:bg-[#4A4030] disabled:text-[#8B95A1] text-[#14181C] font-semibold rounded-xl px-4 py-2.5 transition-colors ${className}`}>
      {children}
    </button>
  );
}
function GhostButton({ children, onClick, className = "" }) {
  return (
    <button onClick={onClick}
      className={`bg-transparent border border-[#2A3138] hover:border-[#3A424B] text-[#EDEFF2] font-medium rounded-xl px-4 py-2.5 transition-colors ${className}`}>
      {children}
    </button>
  );
}

function GaugeDial({ value, target, label }) {
  const pct = Math.min(1, target > 0 ? value / target : 0);
  const startAngle = -220, sweep = 260, r = 54, cx = 64, cy = 64;
  const angle = startAngle + sweep * pct;
  const polar = (deg) => { const rad = (deg * Math.PI) / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };
  const [sx, sy] = polar(startAngle);
  const [ex, ey] = polar(startAngle + sweep);
  const [nx, ny] = polar(angle);
  const largeArc = sweep > 180 ? 1 : 0;
  const needleLarge = (angle - startAngle) > 180 ? 1 : 0;
  return (
    <div className="flex flex-col items-center">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`} stroke="#2A3138" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${needleLarge} 1 ${nx} ${ny}`} stroke="#D68A2E" strokeWidth="10" fill="none" strokeLinecap="round" />
        <text x="64" y="60" textAnchor="middle" fill="#EDEFF2" fontSize="26" fontFamily="Space Grotesk" fontWeight="700">{value}</text>
        <text x="64" y="78" textAnchor="middle" fill="#8B95A1" fontSize="11" fontFamily="Inter">/ {target} hedef</text>
      </svg>
      <div className="text-xs tracking-wide text-[#8B95A1] mt-1 font-medium uppercase">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth screen (Supabase Auth: email + password)
// ---------------------------------------------------------------------------
function AuthScreen() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password, options: { data: { name: name.trim() || email } },
      });
      if (error) setError(error.message);
      else setConfirmNotice(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  if (confirmNotice) {
    return (
      <div className="min-h-screen bg-[#14181C] flex flex-col items-center justify-center px-6 text-center" style={{ fontFamily: "Inter" }}>
        <CheckCircle2 className="text-[#4ADE80] mb-3" size={32} />
        <div className="text-[#EDEFF2] font-medium mb-1">Kayıt oluşturuldu</div>
        <div className="text-sm text-[#8B95A1] max-w-xs">E-postana gelen onay linkine tıkladıktan sonra giriş yapabilirsin.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#14181C] flex flex-col items-center justify-center px-6" style={{ fontFamily: "Inter" }}>
      <div className="mb-8 flex items-center gap-3">
        <Gauge className="text-[#D68A2E]" size={32} />
        <div style={{ fontFamily: "Space Grotesk" }} className="text-2xl font-bold text-[#EDEFF2]">Saha Ziyaret</div>
      </div>
      <Card className="w-full max-w-sm p-6">
        <div className="flex gap-2 mb-5">
          <button onClick={() => setMode("login")} className={`flex-1 rounded-xl py-2 text-sm font-medium ${mode === "login" ? "bg-[#D68A2E] text-[#14181C]" : "border border-[#2A3138] text-[#B7C0CA]"}`}>Giriş Yap</button>
          <button onClick={() => setMode("signup")} className={`flex-1 rounded-xl py-2 text-sm font-medium ${mode === "signup" ? "bg-[#D68A2E] text-[#14181C]" : "border border-[#2A3138] text-[#B7C0CA]"}`}>Hesap Oluştur</button>
        </div>
        {mode === "signup" && (
          <>
            <label className="text-xs text-[#8B95A1] uppercase tracking-wide">Ad Soyad</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Ahmet Yılmaz"
              className="w-full mt-1 mb-3 bg-[#14181C] border border-[#2A3138] rounded-xl px-3 py-2.5 text-[#EDEFF2] placeholder-[#5A636D] outline-none focus:border-[#D68A2E]" />
          </>
        )}
        <label className="text-xs text-[#8B95A1] uppercase tracking-wide">E-posta</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad.soyad@guzelenerji.com" type="email"
          className="w-full mt-1 mb-3 bg-[#14181C] border border-[#2A3138] rounded-xl px-3 py-2.5 text-[#EDEFF2] placeholder-[#5A636D] outline-none focus:border-[#D68A2E]" />
        <label className="text-xs text-[#8B95A1] uppercase tracking-wide">Şifre</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password"
          className="w-full mt-1 mb-2 bg-[#14181C] border border-[#2A3138] rounded-xl px-3 py-2.5 text-[#EDEFF2] placeholder-[#5A636D] outline-none focus:border-[#D68A2E]" />
        {error && <div className="text-[#F0696E] text-xs mb-3">{error}</div>}
        <PrimaryButton className="w-full mt-3" disabled={!email || !password || loading} onClick={submit}>
          {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Bekleyin...</span> : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
        </PrimaryButton>
      </Card>
      <div className="text-[11px] text-[#5A636D] mt-6 text-center max-w-sm">
        Yeni hesaplar varsayılan olarak "Saha Temsilcisi" rolüyle oluşturulur. Yönetici/admin yetkisi Supabase panelinden atanır.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rep home
// ---------------------------------------------------------------------------
function RepHome({ profile, distributors, visits, onStartVisit, activeVisit }) {
  const [query, setQuery] = useState("");
  const today = new Date().toDateString();
  const myTodayCompleted = visits.filter(
    (v) => v.rep_id === profile.id && v.status === "completed" && new Date(v.check_in_time).toDateString() === today
  ).length;
  const filtered = distributors.filter(
    (d) => d.name.toLowerCase().includes(query.toLowerCase()) || (d.city || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div style={{ fontFamily: "Space Grotesk" }} className="text-xl font-bold text-[#EDEFF2]">Bugün</div>
          <div className="text-sm text-[#8B95A1]">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
        <GaugeDial value={myTodayCompleted} target={DAILY_TARGET} label="Ziyaret" />
      </div>

      {activeVisit && (
        <Card className="p-4 mb-4 border-[#D68A2E]">
          <div className="flex items-center gap-2 text-[#D68A2E] text-sm font-semibold mb-1"><Clock size={16} /> Devam eden ziyaret</div>
          <div className="text-[#EDEFF2] font-medium">{distributors.find((d) => d.id === activeVisit.distributor_id)?.name}</div>
          <div className="text-xs text-[#8B95A1] mt-1">Başlangıç: {fmtTime(activeVisit.check_in_time)}</div>
        </Card>
      )}

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-3 text-[#5A636D]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Distribütör veya şehir ara"
          className="w-full bg-[#1E252B] border border-[#2A3138] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[#EDEFF2] placeholder-[#5A636D] outline-none focus:border-[#D68A2E]" />
      </div>

      <div className="space-y-2">
        {filtered.map((d) => {
          const lastVisit = visits.filter((v) => v.distributor_id === d.id && v.status === "completed")
            .sort((a, b) => new Date(b.check_out_time) - new Date(a.check_out_time))[0];
          return (
            <Card key={d.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[#EDEFF2] font-medium truncate">{d.name}</div>
                  <div className="text-xs text-[#8B95A1] flex items-center gap-1 mt-0.5"><MapPin size={12} /> {d.city}</div>
                  <div className="text-[11px] text-[#5A636D] mt-1">{lastVisit ? `Son ziyaret: ${fmtTime(lastVisit.check_out_time)}` : "Henüz ziyaret edilmedi"}</div>
                </div>
                <PrimaryButton disabled={!!activeVisit} onClick={() => onStartVisit(d)} className="whitespace-nowrap text-sm !px-3 !py-2">
                  Ziyareti Başlat
                </PrimaryButton>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center text-sm text-[#5A636D] py-10">Sonuç bulunamadı.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active visit form
// ---------------------------------------------------------------------------
function VisitForm({ visit, distributor, onUpdate, onFinish }) {
  const [visitType, setVisitType] = useState(visit.visit_type || VISIT_TYPES[0]);
  const [notes, setNotes] = useState(visit.notes || "");
  const [competitorNotes, setCompetitorNotes] = useState(visit.competitor_notes || "");
  const [stockRows, setStockRows] = useState(visit.stock_counts?.length ? visit.stock_counts : [{ productId: PRODUCTS[0].id, qty: "" }]);
  const [orderRows, setOrderRows] = useState(visit.orders?.length ? visit.orders : []);
  const [photos, setPhotos] = useState(visit.photo_urls || []);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const addStockRow = () => setStockRows((r) => [...r, { productId: PRODUCTS[0].id, qty: "" }]);
  const addOrderRow = () => setOrderRows((r) => [...r, { productId: PRODUCTS[0].id, qty: "" }]);
  const removeStockRow = (i) => setStockRows((r) => r.filter((_, idx) => idx !== i));
  const removeOrderRow = (i) => setOrderRows((r) => r.filter((_, idx) => idx !== i));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    try {
      const url = await uploadVisitPhoto(visit.id, file);
      if (url) {
        const updated = [...photos, url];
        setPhotos(updated);
        await updateVisit(visit.id, { photo_urls: updated });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPhotoLoading(false);
      e.target.value = "";
    }
  };

  const removePhoto = async (idx) => {
    const updated = photos.filter((_, i) => i !== idx);
    setPhotos(updated);
    await updateVisit(visit.id, { photo_urls: updated });
  };

  const persistDraft = useCallback(() => {
    onUpdate(visit.id, {
      visit_type: visitType,
      notes,
      competitor_notes: competitorNotes,
      stock_counts: stockRows.filter((r) => r.qty !== ""),
      orders: orderRows.filter((r) => r.qty !== ""),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id, visitType, notes, competitorNotes, stockRows, orderRows]);

  useEffect(() => {
    const t = setTimeout(persistDraft, 600);
    return () => clearTimeout(t);
  }, [persistDraft]);

  const handleFinish = async () => {
    setFinishing(true);
    const loc = await getLocation();
    const dist = haversineMeters(loc.lat, loc.lng, distributor.lat, distributor.lng);
    const verified = dist != null ? dist <= GEOFENCE_METERS : null;
    await onFinish(visit.id, {
      visit_type: visitType,
      notes,
      competitor_notes: competitorNotes,
      stock_counts: stockRows.filter((r) => r.qty !== ""),
      orders: orderRows.filter((r) => r.qty !== ""),
      check_out_time: new Date().toISOString(),
      check_out_lat: loc.lat,
      check_out_lng: loc.lng,
      status: "completed",
    });
    setFinishing(false);
  };

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="mb-4">
        <div style={{ fontFamily: "Space Grotesk" }} className="text-xl font-bold text-[#EDEFF2]">{distributor?.name}</div>
        <div className="text-xs text-[#8B95A1] flex items-center gap-1 mt-1">
          <Clock size={12} /> Başlangıç: {fmtTime(visit.check_in_time)}
          {visit.location_verified != null && (
            <span className="ml-2 flex items-center gap-1">
              {visit.location_verified ? <CheckCircle2 size={12} className="text-[#4ADE80]" /> : <AlertCircle size={12} className="text-[#E5A93F]" />}
              {visit.location_verified ? "Konum doğrulandı" : "Konum eşleşmedi"}
            </span>
          )}
        </div>
      </div>

      <Card className="p-4 mb-3">
        <div className="text-xs uppercase tracking-wide text-[#8B95A1] mb-2 flex items-center gap-1.5"><ClipboardList size={13}/> Ziyaret Tipi</div>
        <select value={visitType} onChange={(e) => setVisitType(e.target.value)}
          className="w-full bg-[#14181C] border border-[#2A3138] rounded-xl px-3 py-2.5 text-sm text-[#EDEFF2] outline-none">
          {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Card>

      <Card className="p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-[#8B95A1] flex items-center gap-1.5"><Package size={13}/> Stok Sayımı</div>
          <button onClick={addStockRow} className="text-[#D68A2E] text-xs font-medium flex items-center gap-1"><Plus size={13}/> Satır ekle</button>
        </div>
        {stockRows.map((row, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <select value={row.productId} onChange={(e) => setStockRows((r) => r.map((x, idx) => idx === i ? { ...x, productId: e.target.value } : x))}
              className="flex-1 bg-[#14181C] border border-[#2A3138] rounded-lg px-2 py-2 text-xs text-[#EDEFF2] outline-none min-w-0">
              {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={row.qty} onChange={(e) => setStockRows((r) => r.map((x, idx) => idx === i ? { ...x, qty: e.target.value.replace(/[^0-9]/g, "") } : x))}
              placeholder="Adet" style={{ fontFamily: "JetBrains Mono" }}
              className="w-16 bg-[#14181C] border border-[#2A3138] rounded-lg px-2 py-2 text-xs text-[#EDEFF2] outline-none" />
            <button onClick={() => removeStockRow(i)} className="text-[#5A636D] px-1"><Trash2 size={15}/></button>
          </div>
        ))}
      </Card>

      <Card className="p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-[#8B95A1] flex items-center gap-1.5"><FileText size={13}/> Sipariş Talebi</div>
          <button onClick={addOrderRow} className="text-[#D68A2E] text-xs font-medium flex items-center gap-1"><Plus size={13}/> Satır ekle</button>
        </div>
        {orderRows.length === 0 && <div className="text-[11px] text-[#5A636D]">Bu ziyarette sipariş talebi yok.</div>}
        {orderRows.map((row, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <select value={row.productId} onChange={(e) => setOrderRows((r) => r.map((x, idx) => idx === i ? { ...x, productId: e.target.value } : x))}
              className="flex-1 bg-[#14181C] border border-[#2A3138] rounded-lg px-2 py-2 text-xs text-[#EDEFF2] outline-none min-w-0">
              {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={row.qty} onChange={(e) => setOrderRows((r) => r.map((x, idx) => idx === i ? { ...x, qty: e.target.value.replace(/[^0-9]/g, "") } : x))}
              placeholder="Adet" style={{ fontFamily: "JetBrains Mono" }}
              className="w-16 bg-[#14181C] border border-[#2A3138] rounded-lg px-2 py-2 text-xs text-[#EDEFF2] outline-none" />
            <button onClick={() => removeOrderRow(i)} className="text-[#5A636D] px-1"><Trash2 size={15}/></button>
          </div>
        ))}
      </Card>

      <Card className="p-4 mb-3">
        <div className="text-xs uppercase tracking-wide text-[#8B95A1] mb-2">Rakip Fiyat / Aktivite Bilgisi</div>
        <textarea value={competitorNotes} onChange={(e) => setCompetitorNotes(e.target.value)} rows={3}
          placeholder="ör. Rakip marka X fiyatı %5 düştü..."
          className="w-full bg-[#14181C] border border-[#2A3138] rounded-xl px-3 py-2.5 text-sm text-[#EDEFF2] placeholder-[#5A636D] outline-none resize-none" />
      </Card>

      <Card className="p-4 mb-3">
        <div className="text-xs uppercase tracking-wide text-[#8B95A1] mb-2">Genel Notlar</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Ziyaretle ilgili notlar..."
          className="w-full bg-[#14181C] border border-[#2A3138] rounded-xl px-3 py-2.5 text-sm text-[#EDEFF2] placeholder-[#5A636D] outline-none resize-none" />
      </Card>

      <Card className="p-4 mb-4">
        <div className="text-xs uppercase tracking-wide text-[#8B95A1] mb-2 flex items-center gap-1.5"><Camera size={13}/> Fotoğraflar</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {photos.map((url, i) => (
            <div key={i} className="relative w-16 h-16">
              <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-[#2A3138]" />
              <button onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 bg-[#E5484D] rounded-full w-5 h-5 flex items-center justify-center">
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
        <label className="flex items-center justify-center gap-2 border border-dashed border-[#3A424B] rounded-xl py-3 text-sm text-[#B7C0CA] cursor-pointer">
          {photoLoading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {photoLoading ? "Yükleniyor..." : "Fotoğraf ekle"}
          <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" disabled={photoLoading} />
        </label>
      </Card>

      <PrimaryButton className="w-full" onClick={handleFinish} disabled={finishing}>
        {finishing ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/> Kapatılıyor...</span> : "Ziyareti Bitir"}
      </PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visit detail modal
// ---------------------------------------------------------------------------
function VisitDetail({ visit, distributor, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end z-50" onClick={onClose}>
      <div className="bg-[#1E252B] w-full rounded-t-2xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div style={{ fontFamily: "Space Grotesk" }} className="text-lg font-bold text-[#EDEFF2]">{distributor?.name}</div>
            <div className="text-xs text-[#8B95A1]">{visit.visit_type} · {formatDuration(visit.check_in_time, visit.check_out_time)}</div>
          </div>
          <button onClick={onClose} className="text-[#8B95A1]"><X size={20}/></button>
        </div>
        <div className="text-xs text-[#8B95A1] mb-3">{fmtTime(visit.check_in_time)} → {fmtTime(visit.check_out_time)}</div>
        {visit.stock_counts?.length > 0 && (
          <div className="mb-3">
            <div className="text-xs uppercase text-[#8B95A1] mb-1">Stok Sayımı</div>
            {visit.stock_counts.map((s, i) => (
              <div key={i} className="text-sm text-[#EDEFF2] flex justify-between border-b border-[#2A3138] py-1">
                <span>{PRODUCTS.find((p) => p.id === s.productId)?.name}</span>
                <span style={{ fontFamily: "JetBrains Mono" }}>{s.qty}</span>
              </div>
            ))}
          </div>
        )}
        {visit.orders?.length > 0 && (
          <div className="mb-3">
            <div className="text-xs uppercase text-[#8B95A1] mb-1">Sipariş</div>
            {visit.orders.map((s, i) => (
              <div key={i} className="text-sm text-[#EDEFF2] flex justify-between border-b border-[#2A3138] py-1">
                <span>{PRODUCTS.find((p) => p.id === s.productId)?.name}</span>
                <span style={{ fontFamily: "JetBrains Mono" }}>{s.qty}</span>
              </div>
            ))}
          </div>
        )}
        {visit.competitor_notes && <div className="mb-3"><div className="text-xs uppercase text-[#8B95A1] mb-1">Rakip Bilgisi</div><div className="text-sm text-[#EDEFF2]">{visit.competitor_notes}</div></div>}
        {visit.notes && <div className="mb-3"><div className="text-xs uppercase text-[#8B95A1] mb-1">Notlar</div><div className="text-sm text-[#EDEFF2]">{visit.notes}</div></div>}
        {visit.photo_urls?.length > 0 && (
          <div className="mb-2">
            <div className="text-xs uppercase text-[#8B95A1] mb-1">Fotoğraflar</div>
            <div className="flex flex-wrap gap-2">
              {visit.photo_urls.map((url, i) => <img key={i} src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-[#2A3138]" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RepHistory({ profile, visits, distributors }) {
  const [detail, setDetail] = useState(null);
  const mine = visits.filter((v) => v.rep_id === profile.id).sort((a, b) => new Date(b.check_in_time) - new Date(a.check_in_time));
  return (
    <div className="px-4 pt-4 pb-24">
      <div style={{ fontFamily: "Space Grotesk" }} className="text-xl font-bold text-[#EDEFF2] mb-4">Ziyaret Geçmişim</div>
      <div className="space-y-2">
        {mine.map((v) => {
          const d = distributors.find((x) => x.id === v.distributor_id);
          return (
            <Card key={v.id} className="p-3.5">
              <button className="w-full text-left flex items-center justify-between" onClick={() => setDetail(v)}>
                <div className="min-w-0">
                  <div className="text-[#EDEFF2] font-medium truncate">{d?.name}</div>
                  <div className="text-xs text-[#8B95A1] mt-0.5">{fmtTime(v.check_in_time)} · {v.visit_type}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={v.status === "completed" ? "success" : "warn"}>{v.status === "completed" ? "Tamamlandı" : "Devam ediyor"}</Badge>
                  <ChevronRight size={16} className="text-[#5A636D]" />
                </div>
              </button>
            </Card>
          );
        })}
        {mine.length === 0 && <div className="text-center text-sm text-[#5A636D] py-10">Henüz ziyaret kaydı yok.</div>}
      </div>
      {detail && <VisitDetail visit={detail} distributor={distributors.find((d) => d.id === detail.distributor_id)} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin / manager panel
// ---------------------------------------------------------------------------
function AdminPanel({ visits, distributors }) {
  const [repFilter, setRepFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const reps = useMemo(() => [...new Set(visits.map((v) => v.rep_name))], [visits]);

  const filtered = visits
    .filter((v) => repFilter === "all" || v.rep_name === repFilter)
    .filter((v) => statusFilter === "all" || v.status === statusFilter)
    .sort((a, b) => new Date(b.check_in_time) - new Date(a.check_in_time));

  const completed = visits.filter((v) => v.status === "completed");
  const today = new Date().toDateString();
  const todayCount = visits.filter((v) => new Date(v.check_in_time).toDateString() === today).length;
  const avgDurationMin = completed.length
    ? Math.round(completed.reduce((sum, v) => sum + (new Date(v.check_out_time) - new Date(v.check_in_time)) / 60000, 0) / completed.length)
    : 0;
  const completionRate = visits.length ? Math.round((completed.length / visits.length) * 100) : 0;

  const exportCsv = () => {
    const rows = [
      ["Temsilci", "Distribütör", "Şehir", "Tip", "Başlangıç", "Bitiş", "Süre(dk)", "Durum", "Notlar"],
      ...filtered.map((v) => {
        const d = distributors.find((x) => x.id === v.distributor_id);
        const mins = v.check_out_time ? Math.round((new Date(v.check_out_time) - new Date(v.check_in_time)) / 60000) : "";
        return [v.rep_name, d?.name, d?.city, v.visit_type, fmtTime(v.check_in_time), fmtTime(v.check_out_time), mins, v.status, v.notes || ""];
      }),
    ];
    downloadCsv(rows, `saha-ziyaretleri-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <div style={{ fontFamily: "Space Grotesk" }} className="text-xl font-bold text-[#EDEFF2] mb-4">Yönetim Paneli</div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="p-3 text-center"><div style={{fontFamily:"Space Grotesk"}} className="text-xl font-bold text-[#EDEFF2]">{todayCount}</div><div className="text-[10px] text-[#8B95A1] uppercase mt-1">Bugün</div></Card>
        <Card className="p-3 text-center"><div style={{fontFamily:"Space Grotesk"}} className="text-xl font-bold text-[#EDEFF2]">{avgDurationMin}dk</div><div className="text-[10px] text-[#8B95A1] uppercase mt-1">Ort. Süre</div></Card>
        <Card className="p-3 text-center"><div style={{fontFamily:"Space Grotesk"}} className="text-xl font-bold text-[#EDEFF2]">%{completionRate}</div><div className="text-[10px] text-[#8B95A1] uppercase mt-1">Tamamlanma</div></Card>
      </div>
      <div className="flex gap-2 mb-3">
        <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className="flex-1 bg-[#1E252B] border border-[#2A3138] rounded-xl px-2 py-2 text-xs text-[#EDEFF2] outline-none min-w-0">
          <option value="all">Tüm Temsilciler</option>
          {reps.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="flex-1 bg-[#1E252B] border border-[#2A3138] rounded-xl px-2 py-2 text-xs text-[#EDEFF2] outline-none min-w-0">
          <option value="all">Tüm Durumlar</option>
          <option value="completed">Tamamlandı</option>
          <option value="in_progress">Devam ediyor</option>
        </select>
        <GhostButton onClick={exportCsv} className="!px-3 !py-2 flex items-center gap-1.5 text-xs shrink-0"><Download size={14}/> CSV</GhostButton>
      </div>
      <div className="space-y-2">
        {filtered.map((v) => {
          const d = distributors.find((x) => x.id === v.distributor_id);
          return (
            <Card key={v.id} className="p-3.5">
              <button className="w-full text-left flex items-center justify-between" onClick={() => setDetail(v)}>
                <div className="min-w-0">
                  <div className="text-[#EDEFF2] font-medium truncate">{d?.name}</div>
                  <div className="text-xs text-[#8B95A1] mt-0.5">{v.rep_name} · {fmtTime(v.check_in_time)}</div>
                </div>
                <Badge tone={v.status === "completed" ? "success" : "warn"}>{v.status === "completed" ? "Tamamlandı" : "Devam ediyor"}</Badge>
              </button>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center text-sm text-[#5A636D] py-10">Kayıt bulunamadı.</div>}
      </div>
      {detail && <VisitDetail visit={detail} distributor={distributors.find((d) => d.id === detail.distributor_id)} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [visits, setVisits] = useState([]);
  const [tab, setTab] = useState("home");
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!error) setProfile(data);
    })();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setDataLoading(true);
      const [dist, vis] = await Promise.all([fetchDistributors(), fetchVisits()]);
      setDistributors(dist);
      setVisits(vis);
      setDataLoading(false);
    })();
  }, [session]);

  const activeVisit = profile ? visits.find((v) => v.rep_id === profile.id && v.status === "in_progress") : null;

  const handlePatchVisit = async (id, patch) => {
    const updated = await updateVisit(id, patch);
    if (updated) setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
  };

  const handleFinishVisit = async (id, patch) => {
    const updated = await updateVisit(id, patch);
    if (updated) {
      setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
      setTab("home");
    }
  };

  const handleStartVisit = async (distributor) => {
    const loc = await getLocation();
    const dist = haversineMeters(loc.lat, loc.lng, distributor.lat, distributor.lng);
    const verified = dist != null ? dist <= GEOFENCE_METERS : null;
    const visit = {
      rep_id: profile.id,
      rep_name: profile.name,
      distributor_id: distributor.id,
      visit_type: VISIT_TYPES[0],
      check_in_time: new Date().toISOString(),
      check_in_lat: loc.lat,
      check_in_lng: loc.lng,
      location_verified: verified,
      status: "in_progress",
      notes: "",
      competitor_notes: "",
      stock_counts: [],
      orders: [],
      photo_urls: [],
    };
    const created = await insertVisit(visit);
    if (created) setVisits((prev) => [created, ...prev]);
    setTab("home");
  };

  if (session === undefined || (session && dataLoading && !profile)) {
    return <div className="min-h-screen bg-[#14181C] flex items-center justify-center"><Loader2 className="animate-spin text-[#D68A2E]" size={28} /></div>;
  }
  if (!session) return <AuthScreen />;
  if (!profile) return <div className="min-h-screen bg-[#14181C] flex items-center justify-center"><Loader2 className="animate-spin text-[#D68A2E]" size={28} /></div>;

  const isManagerLike = profile.role === "admin" || profile.role === "manager";
  const currentDistributor = activeVisit ? distributors.find((d) => d.id === activeVisit.distributor_id) : null;

  return (
    <div className="min-h-screen bg-[#14181C]" style={{ fontFamily: "Inter" }}>
      <div className="sticky top-0 z-10 bg-[#14181C]/95 backdrop-blur border-b border-[#2A3138] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="text-[#D68A2E]" size={20} />
          <span style={{ fontFamily: "Space Grotesk" }} className="font-bold text-[#EDEFF2] text-sm">Saha Ziyaret</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{profile.name}</Badge>
          <button onClick={() => supabase.auth.signOut()} className="text-[#8B95A1]"><LogOut size={16} /></button>
        </div>
      </div>

      {tab === "visit" && activeVisit ? (
        <VisitForm visit={activeVisit} distributor={currentDistributor} onUpdate={handlePatchVisit} onFinish={handleFinishVisit} />
      ) : tab === "history" ? (
        <RepHistory profile={profile} visits={visits} distributors={distributors} />
      ) : tab === "admin" && isManagerLike ? (
        <AdminPanel visits={visits} distributors={distributors} />
      ) : (
        <RepHome profile={profile} distributors={distributors} visits={visits} activeVisit={activeVisit} onStartVisit={handleStartVisit} />
      )}

      {activeVisit && tab !== "visit" && (
        <button onClick={() => setTab("visit")} className="fixed bottom-20 left-4 right-4 bg-[#D68A2E] text-[#14181C] font-semibold rounded-xl py-3 flex items-center justify-center gap-2 shadow-lg z-20">
          <Navigation size={16} /> Devam eden ziyarete dön
        </button>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-[#1E252B] border-t border-[#2A3138] flex">
        {[
          { key: "home", label: "Bugün", icon: Gauge },
          { key: "history", label: "Geçmiş", icon: Clock },
          ...(isManagerLike ? [{ key: "admin", label: "Yönetim", icon: Users }] : []),
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[11px] ${tab === t.key ? "text-[#D68A2E]" : "text-[#5A636D]"}`}>
            <t.icon size={18} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
