/**
 * Local DB-IP MMDB geo lookup — lazy singleton, no boot load, never external HTTP.
 * Country + ASN by default; City only when geo_city_enabled=1.
 */

import fs from "fs";

/** Attribution required by DB-IP Lite CC BY 4.0 — for Geography UI later. */
export const DBIP_ATTRIBUTION_TEXT = "IP Geolocation by DB-IP";
export const DBIP_ATTRIBUTION_URL = "https://db-ip.com";

export type InsightsGeoResult = {
  country_code: string;
  country_name: string;
  region_name: string;
  city_name: string;
  asn: number | null;
  network_provider: string | null;
  geo_source: "city_lite" | "country_lite" | "asn_lite" | "unknown" | "missing_file";
};

export type InsightsGeoLookupOptions = {
  geoCityEnabled?: boolean;
  countryPath?: string | null;
  asnPath?: string | null;
  cityPath?: string | null;
  /** Test seam — inject Reader factory instead of mmdb-lib. */
  createReader?: (buf: Buffer) => { get: (ip: string) => unknown };
  readFileSync?: (path: string) => Buffer;
  existsSync?: (path: string) => boolean;
};

type ReaderLike = { get: (ip: string) => unknown };

type LoadedDb = {
  path: string;
  reader: ReaderLike;
};

let countryDb: LoadedDb | null = null;
let asnDb: LoadedDb | null = null;
let cityDb: LoadedDb | null = null;
let mmdbReaderCtor: ((buf: Buffer) => ReaderLike) | null = null;
let mmdbImportAttempted = false;

const UNKNOWN: InsightsGeoResult = {
  country_code: "XX",
  country_name: "unknown",
  region_name: "unknown",
  city_name: "unknown",
  asn: null,
  network_provider: null,
  geo_source: "missing_file",
};

function envPath(name: string): string | null {
  const v = String(process.env[name] || "").trim();
  return v || null;
}

function loadMmdbCtor(
  createReader?: InsightsGeoLookupOptions["createReader"]
): ((buf: Buffer) => ReaderLike) | null {
  if (createReader) return createReader;
  if (mmdbReaderCtor) return mmdbReaderCtor;
  if (mmdbImportAttempted) return mmdbReaderCtor;
  mmdbImportAttempted = true;
  try {
    // Lazy require — never at module evaluation / boot.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mmdb = require("mmdb-lib") as { Reader: new (buf: Buffer) => ReaderLike };
    mmdbReaderCtor = (buf: Buffer) => new mmdb.Reader(buf);
    return mmdbReaderCtor;
  } catch {
    mmdbReaderCtor = null;
    return null;
  }
}

function openDb(
  filePath: string | null | undefined,
  cache: LoadedDb | null,
  ctor: ((buf: Buffer) => ReaderLike) | null,
  readFileSync: (path: string) => Buffer,
  existsSync: (path: string) => boolean
): LoadedDb | null {
  if (!filePath || !ctor) return null;
  if (cache && cache.path === filePath) return cache;
  try {
    if (!existsSync(filePath)) return null;
    const buf = readFileSync(filePath);
    return { path: filePath, reader: ctor(buf) };
  } catch {
    return null;
  }
}

function strField(obj: unknown, ...keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // nested names: { country: { iso_code, names: { en } } }
  return null;
}

function pickCountry(rec: unknown): { code: string; name: string } | null {
  if (!rec || typeof rec !== "object") return null;
  const r = rec as Record<string, unknown>;
  const country = (r.country || r.registered_country || r) as Record<string, unknown> | undefined;
  if (!country || typeof country !== "object") return null;
  const code = String(country.iso_code || country.country_code || "").trim().toUpperCase();
  const names = country.names as Record<string, string> | undefined;
  const name =
    (names && (names.en || Object.values(names)[0])) ||
    strField(country, "name", "country_name") ||
    "";
  if (!code && !name) return null;
  return { code: code || "XX", name: name || "unknown" };
}

function pickRegionCity(rec: unknown): { region: string; city: string } {
  if (!rec || typeof rec !== "object") return { region: "unknown", city: "unknown" };
  const r = rec as Record<string, unknown>;
  let region = "unknown";
  const subdivisions = r.subdivisions;
  if (Array.isArray(subdivisions) && subdivisions[0] && typeof subdivisions[0] === "object") {
    const sub = subdivisions[0] as Record<string, unknown>;
    const names = sub.names as Record<string, string> | undefined;
    region = (names && (names.en || Object.values(names)[0])) || String(sub.name || "unknown");
  } else {
    region =
      strField(r, "region_name", "state", "province") ||
      strField((r.region || {}) as object, "name") ||
      "unknown";
  }
  const cityObj = r.city as Record<string, unknown> | undefined;
  let city = "unknown";
  if (cityObj && typeof cityObj === "object") {
    const names = cityObj.names as Record<string, string> | undefined;
    city = (names && (names.en || Object.values(names)[0])) || String(cityObj.name || "unknown");
  } else {
    city = strField(r, "city_name", "city") || "unknown";
  }
  return { region: region || "unknown", city: city || "unknown" };
}

function pickAsn(rec: unknown): { asn: number | null; org: string | null } {
  if (!rec || typeof rec !== "object") return { asn: null, org: null };
  const r = rec as Record<string, unknown>;
  const asnRaw = r.autonomous_system_number ?? r.asn;
  const asn = Number(asnRaw);
  const org =
    strField(r, "autonomous_system_organization", "organization", "org", "name") || null;
  return {
    asn: Number.isFinite(asn) && asn > 0 ? Math.floor(asn) : null,
    org,
  };
}

/** Clear in-memory readers (Settings “Reload geo DB” / tests). */
export function reloadInsightsGeo(): void {
  countryDb = null;
  asnDb = null;
  cityDb = null;
}

/** True after at least one MMDB reader has been opened (not at import). */
export function insightsGeoHasLoadedReaders(): boolean {
  return !!(countryDb || asnDb || cityDb);
}

/** Test helper — reset lazy import state too. */
export function __resetInsightsGeoForTests(): void {
  reloadInsightsGeo();
  mmdbReaderCtor = null;
  mmdbImportAttempted = false;
}

/** Combined attribution constant for Geography UI later. */
export const DBIP_ATTRIBUTION = {
  text: DBIP_ATTRIBUTION_TEXT,
  url: DBIP_ATTRIBUTION_URL,
} as const;

/**
 * Lookup IP. Never throws. Missing files => unknown + geo_source=missing_file.
 * Does not load at import time.
 */
export function lookupInsightsGeo(
  ip: string,
  opts: InsightsGeoLookupOptions = {}
): InsightsGeoResult {
  const rawIp = String(ip || "").trim();
  if (!rawIp || rawIp === "unknown") {
    return { ...UNKNOWN };
  }

  const readFileSync = opts.readFileSync || ((p: string) => fs.readFileSync(p));
  const existsSync = opts.existsSync || ((p: string) => fs.existsSync(p));
  const ctor = loadMmdbCtor(opts.createReader);
  const countryPath = opts.countryPath ?? envPath("INSIGHTS_DBIP_COUNTRY_PATH");
  const asnPath = opts.asnPath ?? envPath("INSIGHTS_DBIP_ASN_PATH");
  const cityPath = opts.cityPath ?? envPath("INSIGHTS_DBIP_CITY_PATH");
  const cityEnabled = opts.geoCityEnabled === true;

  countryDb = openDb(countryPath, countryDb, ctor, readFileSync, existsSync);
  asnDb = openDb(asnPath, asnDb, ctor, readFileSync, existsSync);
  if (cityEnabled) {
    cityDb = openDb(cityPath, cityDb, ctor, readFileSync, existsSync);
  } else {
    cityDb = null;
  }

  let country_code = "XX";
  let country_name = "unknown";
  let region_name = "unknown";
  let city_name = "unknown";
  let geo_source: InsightsGeoResult["geo_source"] = "missing_file";
  let asn: number | null = null;
  let network_provider: string | null = null;

  try {
    if (cityEnabled && cityDb) {
      const rec = cityDb.reader.get(rawIp);
      const c = pickCountry(rec);
      if (c) {
        country_code = c.code;
        country_name = c.name;
        geo_source = "city_lite";
      }
      const rc = pickRegionCity(rec);
      region_name = rc.region;
      city_name = rc.city;
    } else if (countryDb) {
      const rec = countryDb.reader.get(rawIp);
      const c = pickCountry(rec);
      if (c) {
        country_code = c.code;
        country_name = c.name;
        geo_source = "country_lite";
      }
    }

    if (asnDb) {
      const rec = asnDb.reader.get(rawIp);
      const a = pickAsn(rec);
      asn = a.asn;
      network_provider = a.org;
      if (geo_source === "missing_file" && (asn || network_provider)) {
        geo_source = "asn_lite";
      }
    }

    if (geo_source === "missing_file" && !countryDb && !asnDb && !(cityEnabled && cityDb)) {
      return { ...UNKNOWN };
    }
    if (geo_source === "missing_file") {
      geo_source = "unknown";
    }
  } catch {
    return { ...UNKNOWN };
  }

  return {
    country_code: country_code.slice(0, 2),
    country_name: country_name.slice(0, 128) || "unknown",
    region_name: region_name.slice(0, 128) || "unknown",
    city_name: city_name.slice(0, 128) || "unknown",
    asn,
    network_provider: network_provider ? network_provider.slice(0, 255) : null,
    geo_source,
  };
}
