const chalk = require("chalk");
const { randomUUID } = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const config = require("../../config/config.json");

const secrets = config.secrets || {};
if (!secrets.SUPABASE_URL || !secrets.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in config.json secrets.");
}

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

const supabase = createClient(normalizeUrl(secrets.SUPABASE_URL), secrets.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(chalk.green("Connected to Supabase"));

// ── Helpers ──────────────────────────────────────────────────────────────────

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function normalizeId(v) { return v == null ? null : String(v); }

function rowToDoc(row) {
  const doc = row.data || {};
  doc._id = doc._id || row.id;
  return doc;
}

// Returns true if every key/value in filter matches the doc.
// Supports: equality, { $in: [...] }, _id shorthand.
function matchesFilter(doc, filter = {}) {
  for (const [key, condition] of Object.entries(filter)) {
    const val = doc[key];
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      if ("$in" in condition) {
        if (!(condition.$in || []).map(String).includes(String(val))) return false;
        continue;
      }
    }
    if (key === "_id") {
      if (String(doc._id) !== String(condition)) return false;
      continue;
    }
    if (String(val) !== String(condition)) return false;
  }
  return true;
}

// Classify filter keys so we can push simple equalities to Postgres and
// handle complex operators ($in etc.) in memory.
function classifyFilter(filter = {}) {
  const push = {};   // push to Supabase via JSONB expression filter
  const local = {};  // must be handled in-memory

  for (const [key, val] of Object.entries(filter)) {
    if (val === null || val === undefined) { local[key] = val; continue; }
    if (typeof val === "object") { local[key] = val; continue; }
    push[key] = val;
  }
  return { push, local };
}

// ── Document instance ─────────────────────────────────────────────────────────

class SupabaseDocument {
  constructor(model, data) {
    this.__model = model;
    Object.assign(this, clone(data));
  }

  async save() {
    const payload = {};
    for (const [k, v] of Object.entries(this)) {
      if (k === "__model" || typeof v === "function") continue;
      payload[k] = v;
    }
    if (!payload._id) payload._id = randomUUID();
    await this.__model._upsertById(payload._id, payload);
    Object.assign(this, clone(payload));
    return this;
  }
}

// ── Query builder ─────────────────────────────────────────────────────────────

class QueryBuilder {
  constructor(model, filter = {}, { single = false } = {}) {
    this.model = model;
    this.filter = filter || {};
    this.single = single;
    this._sort = null;
    this._limit = null;
    this._lean = false;
  }

  sort(obj) { this._sort = obj; return this; }
  limit(n)  { this._limit = Number(n); return this; }

  lean() {
    this._lean = true;
    return this.exec();
  }

  then(resolve, reject) { return this.exec().then(resolve, reject); }

  async exec() {
    let docs = await this.model._fetchFiltered(this.filter);

    if (this._sort) {
      const [field, dir] = Object.entries(this._sort)[0] || [];
      if (field) docs.sort((a, b) => (a[field] > b[field] ? 1 : -1) * (dir < 0 ? -1 : 1));
    }
    if (this._limit != null && !Number.isNaN(this._limit)) docs = docs.slice(0, this._limit);

    if (this.single) {
      const item = docs[0] ?? null;
      if (!item) return null;
      return this._lean ? clone(item) : new SupabaseDocument(this.model, item);
    }
    return this._lean ? docs.map(clone) : docs.map(d => new SupabaseDocument(this.model, d));
  }
}

// ── Model ─────────────────────────────────────────────────────────────────────

class SupabaseModel {
  constructor(tableName) { this.tableName = tableName; }

  // Fetch all rows (no filter).
  async _fetchAll() {
    const { data, error } = await supabase.from(this.tableName).select("id,data");
    if (error) throw new Error(`[${this.tableName}] ${error.message}`);
    return (data || []).map(rowToDoc);
  }

  // Fetch single row by primary key — fastest possible lookup.
  async _fetchById(id) {
    const { data, error } = await supabase
      .from(this.tableName).select("id,data")
      .eq("id", normalizeId(id)).maybeSingle();
    if (error) throw new Error(`[${this.tableName}] ${error.message}`);
    return data ? rowToDoc(data) : null;
  }

  // Fetch rows, pushing simple equality filters to Postgres (uses expression
  // indexes), falling back to in-memory for $in and other operators.
  async _fetchFiltered(filter = {}) {
    const { push, local } = classifyFilter(filter);
    const hasComplex = Object.keys(local).length > 0;

    // If the only filter is _id, use the fast primary-key path.
    const keys = Object.keys(push);
    if (keys.length === 1 && keys[0] === "_id" && !hasComplex) {
      const doc = await this._fetchById(push._id);
      return doc ? [doc] : [];
    }

    let query = supabase.from(this.tableName).select("id,data");

    for (const [key, val] of Object.entries(push)) {
      if (key === "_id") {
        query = query.eq("id", normalizeId(val));
      } else {
        // Pushes down to Postgres: WHERE data->>'key' = 'val'
        // Uses the expression indexes created in the migration.
        query = query.filter(`data->>${key}`, "eq", String(val));
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(`[${this.tableName}] ${error.message}`);
    let docs = (data || []).map(rowToDoc);

    // Apply remaining in-memory filters ($in, null checks, etc.)
    if (hasComplex) docs = docs.filter(d => matchesFilter(d, local));

    return docs;
  }

  async _upsertById(id, doc) {
    const payload = clone(doc);
    payload._id = payload._id || normalizeId(id);
    const { error } = await supabase
      .from(this.tableName)
      .upsert({ id: normalizeId(id), data: payload }, { onConflict: "id" });
    if (error) throw new Error(`[${this.tableName}] ${error.message}`);
  }

  // ── Mongoose-compatible API ─────────────────────────────────────────────────

  find(filter = {}) {
    return new QueryBuilder(this, filter, { single: false });
  }

  findOne(filter = {}) {
    return new QueryBuilder(this, filter, { single: true });
  }

  // Uses primary-key path directly — no table scan.
  findById(id) {
    const model = this;
    const nid = normalizeId(id);
    const p = this._fetchById(nid).then(doc => doc ? new SupabaseDocument(model, doc) : null);
    return {
      then:   (res, rej) => p.then(res, rej),
      lean:   ()         => model._fetchById(nid),
      sort:   ()         => ({ then: (res, rej) => p.then(res, rej), lean: () => model._fetchById(nid) }),
    };
  }

  async create(payload) {
    if (Array.isArray(payload)) {
      const docs = payload.map(item => { const d = clone(item); d._id = d._id || randomUUID(); return d; });
      const rows = docs.map(d => ({ id: normalizeId(d._id), data: d }));
      const { error } = await supabase.from(this.tableName).insert(rows);
      if (error) throw new Error(`[${this.tableName}] ${error.message}`);
      return docs.map(d => new SupabaseDocument(this, d));
    }
    const doc = clone(payload);
    doc._id = doc._id || randomUUID();
    const { error } = await supabase.from(this.tableName).insert({ id: normalizeId(doc._id), data: doc });
    if (error) throw new Error(`[${this.tableName}] ${error.message}`);
    return new SupabaseDocument(this, doc);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    const existing = await this._fetchById(id);
    if (!existing) return null;
    const merged = { ...existing, ...clone(update), _id: existing._id };
    await this._upsertById(existing._id, merged);
    return new SupabaseDocument(this, options.new ? merged : existing);
  }

  async findByIdAndDelete(id) {
    const existing = await this._fetchById(id);
    if (!existing) return null;
    const { error } = await supabase.from(this.tableName).delete().eq("id", normalizeId(id));
    if (error) throw new Error(`[${this.tableName}] ${error.message}`);
    return new SupabaseDocument(this, existing);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    const existing = await this.findOne(filter).lean();
    if (existing) {
      const merged = { ...existing, ...clone(update), _id: existing._id };
      await this._upsertById(existing._id, merged);
      return new SupabaseDocument(this, merged);
    }
    if (options.upsert) {
      return await this.create({ ...clone(filter), ...clone(update) });
    }
    return null;
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

const TeamMatchPerformance = new SupabaseModel("team_match_performances");
const Event                = new SupabaseModel("events");
const User                 = new SupabaseModel("users");
const Item                 = new SupabaseModel("items");
const UserItem             = new SupabaseModel("user_items");
const UserAchievement      = new SupabaseModel("user_achievements");
const CrateHistory         = new SupabaseModel("crate_history");

// Stub so code that calls db.on/db.once doesn't throw.
const db = { on: () => {}, once: (e, cb) => { if (e === "open") cb(); } };

module.exports = { db, TeamMatchPerformance, Event, User, Item, UserItem, UserAchievement, CrateHistory };
