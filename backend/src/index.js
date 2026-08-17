import "dotenv/config";
import cors from "cors";
import express from "express";
import { createReadStream, existsSync, statSync } from "fs";
import { dirname, join } from "path";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/crimelens";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";
const FORCE_REIMPORT =
  process.env.FORCE_REIMPORT === "1" || process.env.FORCE_REIMPORT === "true";
/** Clear and re-import only `global_crimes` (avoids re-importing the large India CSV). */
const FORCE_REIMPORT_GLOBAL =
  process.env.FORCE_REIMPORT_GLOBAL === "1" ||
  process.env.FORCE_REIMPORT_GLOBAL === "true";

function resolveDataPath(p, fallbackAbs) {
  if (!p) return fallbackAbs;
  if (path.isAbsolute(p)) return p;
  // Treat relative paths as relative to project root (not backend/)
  return join(ROOT, p);
}

const INDIA_CSV = resolveDataPath(
  process.env.INDIA_CRIME_CSV,
  join(ROOT, "data", "crime_dataset_india (1).csv")
);
const GLOBAL_CSV = resolveDataPath(
  process.env.GLOBAL_CRIME_CSV,
  join(ROOT, "data", "global.csv")
);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

let client;
let db;

async function connectDb() {
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  return db;
}

function stripKeys(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    o[k.trim()] = v;
  }
  return o;
}

/** Pull 4-digit year from Date strings like 01-01-2020 00:00 */
function extractYear(value) {
  if (value == null || value === "") return undefined;
  const s = String(value);
  const m = s.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : undefined;
}

async function importCsvToCollection(collectionName, csvPath, { addYear } = {}) {
  const col = db.collection(collectionName);
  return new Promise((resolve, reject) => {
    const parser = createReadStream(csvPath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
      })
    );

    let batch = [];
    const BATCH = 8000;
    let total = 0;
    let tick = 0;

    const flush = async () => {
      if (!batch.length) return;
      const toInsert = batch;
      batch = [];
      try {
        await col.insertMany(toInsert, { ordered: false });
      } catch (e) {
        if (!e?.insertedCount) throw e;
      }
      total += toInsert.length;
      tick += 1;
      if (tick % 10 === 0) {
        console.log(`[seed] ${collectionName}: ${total.toLocaleString()} rows…`);
      }
    };

    parser.on("error", reject);

    (async () => {
      try {
        for await (const record of parser) {
          let doc = stripKeys(record);
          if (addYear) {
            const y = extractYear(doc.Date ?? doc["Date"]);
            if (y) doc.Year = y;
          }
          batch.push(doc);
          if (batch.length >= BATCH) await flush();
        }
        await flush();
        resolve(total);
      } catch (e) {
        reject(e);
      }
    })();
  });
}

/**
 * Excel import (first sheet). Loads the workbook into memory — very large files may need high RAM
 * or should be exported to CSV for streaming import.
 */
async function importXlsxToCollection(collectionName, filePath, { addYear } = {}) {
  const col = db.collection(collectionName);
  const wb = XLSX.readFile(filePath, { cellDates: true, dense: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return 0;
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

  let batch = [];
  const BATCH = 8000;
  let total = 0;
  let tick = 0;

  const flush = async () => {
    if (!batch.length) return;
    const toInsert = batch;
    batch = [];
    try {
      await col.insertMany(toInsert, { ordered: false });
    } catch (e) {
      if (!e?.insertedCount) throw e;
    }
    total += toInsert.length;
    tick += 1;
    if (tick % 10 === 0) {
      console.log(`[seed] ${collectionName}: ${total.toLocaleString()} rows…`);
    }
  };

  for (const record of rows) {
    let doc = stripKeys(record);
    if (addYear) {
      const y = extractYear(doc.Date ?? doc["Date"]);
      if (y) doc.Year = y;
    }
    batch.push(doc);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return total;
}

async function importDatasetToCollection(collectionName, filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    return importXlsxToCollection(collectionName, filePath, options);
  }
  return importCsvToCollection(collectionName, filePath, options);
}

async function seedCollection(collectionName, filePath, options = {}) {
  const col = db.collection(collectionName);
  const clearGlobalOnly =
    collectionName === "global_crimes" && FORCE_REIMPORT_GLOBAL && !FORCE_REIMPORT;
  if (FORCE_REIMPORT || clearGlobalOnly) {
    const n = await col.deleteMany({});
    const why = FORCE_REIMPORT ? "FORCE_REIMPORT" : "FORCE_REIMPORT_GLOBAL";
    console.log(`[seed] ${collectionName}: cleared ${n.deletedCount} documents (${why})`);
  }
  const existing = await col.countDocuments();
  if (existing > 0) {
    console.log(
      `[seed] ${collectionName}: skip import (${existing.toLocaleString()} docs). Set FORCE_REIMPORT=1 to reload.`
    );
    return { inserted: 0, skipped: true, existing };
  }

  if (!existsSync(filePath)) {
    console.warn(`[seed] Missing file: ${filePath}`);
    return { inserted: 0, skipped: true, missing: true };
  }

  try {
    const st = statSync(filePath);
    if (st.size === 0) {
      console.warn(`[seed] Empty file (0 bytes), skipping: ${filePath}`);
      return { inserted: 0, skipped: true, empty: true };
    }
  } catch {
    // ignore stat errors; importer will throw a clearer error
  }

  let inserted = 0;
  try {
    inserted = await importDatasetToCollection(collectionName, filePath, options);
  } catch (e) {
    if (e?.code === "ENOENT") {
      console.warn(`[seed] Missing file: ${filePath}`);
      return { inserted: 0, skipped: true, missing: true };
    }
    throw e;
  }
  console.log(`[seed] ${collectionName}: imported ${inserted.toLocaleString()} rows`);
  return { inserted };
}

app.get("/api/health", async (_req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ ok: true, db: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: String(e.message) });
  }
});

app.get("/api/india/crimes", async (req, res) => {
  try {
    const { region, crime_type, month } = req.query;
    const q = {};
    if (region) q.Region = String(region);
    if (crime_type) q.Crime_Type = String(crime_type);
    if (month !== undefined && month !== "") q.Month = String(month);

    const rows = await db
      .collection("india_crimes")
      .find(q)
      .limit(5000)
      .toArray();
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/global/crimes", async (_req, res) => {
  try {
    const rows = await db.collection("global_crimes").find({}).limit(5000).toArray();
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/stats/overview", async (_req, res) => {
  try {
    const india = db.collection("india_crimes");
    const total = await india.countDocuments({ Crime_Type: { $ne: "" } });

    const topRegions = await india
      .aggregate([
        { $match: { Region: { $ne: "" } } },
        { $group: { _id: "$Region", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    const topCrimes = await india
      .aggregate([
        { $match: { Crime_Type: { $ne: "" } } },
        { $group: { _id: "$Crime_Type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    res.json({
      total_crimes: total,
      top_regions: topRegions.map((r) => ({ region: r._id, count: r.count })),
      top_crime_types: topCrimes.map((r) => ({ crime_type: r._id, count: r.count })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/stats/seasonal", async (_req, res) => {
  try {
    const rows = await db
      .collection("india_crimes")
      .aggregate([
        { $match: { Season: { $ne: "" }, Crime_Type: { $ne: "" } } },
        {
          $group: {
            _id: { season: "$Season", crime: "$Crime_Type" },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray();

    res.json({
      data: rows.map((r) => ({
        season: r._id.season,
        crime_type: r._id.crime,
        count: r.count,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/stats/city/:region", async (req, res) => {
  try {
    const region = decodeURIComponent(req.params.region);
    const col = db.collection("india_crimes");
    const filter = { Region: region, Crime_Type: { $ne: "" } };

    const total = await col.countDocuments(filter);
    const byCrime = await col
      .aggregate([
        { $match: filter },
        { $group: { _id: "$Crime_Type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    const byMonth = await col
      .aggregate([
        { $match: filter },
        { $group: { _id: "$Month", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const byWeapon = await col
      .aggregate([
        { $match: filter },
        { $match: { "Weapon Used": { $ne: "" } } },
        { $group: { _id: "$Weapon Used", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ])
      .toArray();

    const demoAgg = await col
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: { g: "$Victim_Gender", age: "$Victim_Age" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const genderCounts = {};
    for (const row of demoAgg) {
      const g = row._id.g ?? "Unknown";
      genderCounts[g] = (genderCounts[g] || 0) + row.count;
    }

    res.json({
      region,
      total,
      crime_distribution: byCrime.map((r) => ({ crime_type: r._id, count: r.count })),
      monthly_trend: byMonth.map((r) => ({ month: r._id, count: r.count })),
      weapon_usage: byWeapon.map((r) => ({ weapon: r._id, count: r.count })),
      victim_demographics: { by_gender: genderCounts },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/stats/time", async (_req, res) => {
  try {
    const col = db.collection("india_crimes");
    const byHour = await col
      .aggregate([
        { $match: { Hour: { $ne: "" } } },
        { $group: { _id: "$Hour", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const byDow = await col
      .aggregate([
        { $match: { Day_of_Week: { $ne: "" } } },
        { $group: { _id: "$Day_of_Week", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const heat = await col
      .aggregate([
        { $match: { Hour: { $ne: "" }, Day_of_Week: { $ne: "" } } },
        {
          $group: {
            _id: { hour: "$Hour", dow: "$Day_of_Week" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    res.json({
      hourly: byHour.map((r) => ({ hour: r._id, count: r.count })),
      by_weekday: byDow.map((r) => ({ day: r._id, count: r.count })),
      heatmap: heat.map((r) => ({
        hour: r._id.hour,
        day_of_week: r._id.dow,
        count: r.count,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/stats/yearly-trend", async (_req, res) => {
  try {
    const col = db.collection("india_crimes");
    const withYear = await col
      .aggregate([
        { $match: { Crime_Type: { $ne: "" } } },
        {
          $addFields: {
            yearLabel: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ["$Year", null] }, null] },
                    { $ne: [{ $toString: { $ifNull: ["$Year", ""] } }, ""] },
                  ],
                },
                { $toString: "$Year" },
                {
                  $let: {
                    vars: {
                      rf: {
                        $regexFind: {
                          input: { $toString: { $ifNull: ["$Date", ""] } },
                          regex: "(19|20)[0-9]{2}",
                        },
                      },
                    },
                    in: {
                      $cond: [
                        { $ne: ["$$rf", null] },
                        "$$rf.match",
                        "Unknown",
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
        { $group: { _id: "$yearLabel", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    res.json({
      data: withYear.map((r) => ({ year: r._id, count: r.count })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/stats/crime-domains", async (_req, res) => {
  try {
    const rows = await db
      .collection("india_crimes")
      .aggregate([
        { $match: { "Crime Domain": { $ne: "" } } },
        { $group: { _id: "$Crime Domain", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    res.json({
      data: rows.map((r) => ({ domain: r._id, count: r.count })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/stats/monthly-totals", async (_req, res) => {
  try {
    const rows = await db
      .collection("india_crimes")
      .aggregate([
        { $match: { Month: { $ne: "" }, Crime_Type: { $ne: "" } } },
        { $group: { _id: "$Month", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    res.json({
      data: rows.map((r) => ({ month: r._id, count: r.count })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/api/predict", async (req, res) => {
  try {
    const r = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || "Invalid ML response" };
    }
    if (!r.ok) {
      return res.status(r.status >= 400 ? r.status : 502).json(data);
    }
    res.json(data);
  } catch (e) {
    res.status(503).json({
      error: "ML service unavailable",
      detail: String(e.message),
      predicted_crime: null,
      confidence: null,
      top3: [],
    });
  }
});

app.get("/api/ml/model-stats", async (_req, res) => {
  try {
    const r = await fetch(`${ML_SERVICE_URL}/model-stats`);
    const data = await r.json();
    if (!r.ok) return res.status(502).json(data);
    res.json(data);
  } catch (e) {
    res.status(503).json({ error: "ML service unavailable", detail: String(e.message) });
  }
});

async function main() {
  await connectDb();
  await seedCollection("india_crimes", INDIA_CSV, { addYear: true });
  await seedCollection("global_crimes", GLOBAL_CSV, { addYear: true });

  app.listen(PORT, () => {
    console.log(`CrimeLens API http://localhost:${PORT}`);
    console.log(`[seed] India CSV: ${INDIA_CSV}`);
    console.log(`[seed] Global CSV: ${GLOBAL_CSV}`);
    if (FORCE_REIMPORT_GLOBAL && !FORCE_REIMPORT) {
      console.log("[seed] Tip: set FORCE_REIMPORT_GLOBAL=0 after global import to speed up startup.");
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
