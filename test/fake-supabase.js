// Test-only stand-in for @supabase/supabase-js that talks straight to a local
// Postgres with the same builder calls the API uses (select/insert/update/
// upsert/delete/rpc + filters). Lets the real schema.sql and the real API
// code be exercised without a Supabase account.
const { Pool, types } = require('pg');
types.setTypeParser(1700, (v) => parseFloat(v));      // numeric → number (PostgREST does this too)
types.setTypeParser(20, (v) => parseInt(v, 10));      // bigint  → number
types.setTypeParser(1082, (v) => v);                  // date    → 'YYYY-MM-DD'

const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

function createClient() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  return { from: (t) => new Builder(pool, t), rpc: (fn, args) => new Rpc(pool, fn, args), _pool: pool };
}

class Base {
  then(res, rej) { return this.exec().then(res, rej); }
}

class Rpc extends Base {
  constructor(pool, fn, args) { super(); this.pool = pool; this.fn = fn; this.args = args || {}; this.lim = null; this.off = 0; }
  range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
  limit(n) { this.lim = n; return this; }
  async exec() {
    try {
      const keys = Object.keys(this.args);
      const vals = keys.map((k) => this.args[k]);
      const meta = await this.pool.query('select proretset from pg_proc where proname = $1 limit 1', [this.fn]);
      const set = meta.rows[0] && meta.rows[0].proretset;
      let sql = `select * from ${q(this.fn)}(${keys.map((k, i) => `${q(k)} => $${i + 1}`).join(', ')})`;
      if (this.lim != null) sql += ` limit ${this.lim} offset ${this.off}`;
      const r = await this.pool.query(sql, vals);
      if (set) return { data: r.rows, error: null };
      const row = r.rows[0];
      return { data: row ? row[Object.keys(row)[0]] : null, error: null };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
  }
}

class Builder extends Base {
  constructor(pool, table) {
    super();
    Object.assign(this, { pool, table, op: 'select', cols: '*', where: [], orders: [], lim: null, off: 0, mode: 'many', head: false, count: null, returning: false, payload: null, onConflict: null });
  }
  select(cols, opts) {
    if (this.op !== 'select') { this.returning = cols || '*'; return this; }
    this.cols = cols || '*';
    if (opts && opts.count) this.count = opts.count;
    if (opts && opts.head) this.head = true;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(row) { this.op = 'update'; this.payload = row; return this; }
  upsert(rows, o) { this.op = 'upsert'; this.payload = rows; this.onConflict = o && o.onConflict; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.where.push([c, '=', v]); return this; }
  neq(c, v) { this.where.push([c, '<>', v]); return this; }
  gt(c, v) { this.where.push([c, '>', v]); return this; }
  gte(c, v) { this.where.push([c, '>=', v]); return this; }
  lt(c, v) { this.where.push([c, '<', v]); return this; }
  lte(c, v) { this.where.push([c, '<=', v]); return this; }
  is(c, v) { this.where.push([c, 'is', v]); return this; }
  in(c, arr) { this.where.push([c, 'in', arr]); return this; }
  order(c, o) { this.orders.push(q(c) + (o && o.ascending === false ? ' desc' : ' asc')); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  whereSql(vals) {
    if (!this.where.length) return '';
    return ' where ' + this.where.map(([c, op, v]) => {
      if (op === 'is') return `${q(c)} is ${v === null ? 'null' : v}`;
      if (op === 'in') { vals.push(v); return `${q(c)} = any($${vals.length})`; }
      vals.push(v); return `${q(c)} ${op} $${vals.length}`;
    }).join(' and ');
  }
  colsSql(c) { return c === '*' ? '*' : c.split(',').map((x) => q(x.trim())).join(', '); }

  async exec() {
    try {
      const vals = [];
      let sql, r;
      if (this.op === 'select') {
        if (this.head && this.count) {
          sql = `select count(*)::int c from ${q(this.table)}` + this.whereSql(vals);
          r = await this.pool.query(sql, vals);
          return { data: null, count: r.rows[0].c, error: null };
        }
        sql = `select ${this.colsSql(this.cols)} from ${q(this.table)}` + this.whereSql(vals);
      } else if (this.op === 'insert' || this.op === 'upsert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        const keys = Object.keys(rows[0]);
        const tuples = rows.map((row) => '(' + keys.map((k) => { vals.push(clean(row[k])); return '$' + vals.length; }).join(',') + ')');
        sql = `insert into ${q(this.table)} (${keys.map(q).join(',')}) values ${tuples.join(',')}`;
        if (this.op === 'upsert') {
          const oc = String(this.onConflict).split(',').map((x) => x.trim());
          const upd = keys.filter((k) => !oc.includes(k));
          sql += ` on conflict (${oc.map(q).join(',')}) ` + (upd.length ? `do update set ${upd.map((k) => `${q(k)} = excluded.${q(k)}`).join(', ')}` : 'do nothing');
        }
      } else if (this.op === 'update') {
        const keys = Object.keys(this.payload);
        sql = `update ${q(this.table)} set ${keys.map((k) => { vals.push(clean(this.payload[k])); return `${q(k)} = $${vals.length}`; }).join(', ')}` + this.whereSql(vals);
      } else if (this.op === 'delete') {
        sql = `delete from ${q(this.table)}` + this.whereSql(vals);
      }
      if (this.op !== 'select') {
        if (this.returning) sql += ` returning ${this.colsSql(this.returning)}`;
      } else {
        if (this.orders.length) sql += ' order by ' + this.orders.join(', ');
        if (this.lim != null) sql += ` limit ${this.lim} offset ${this.off}`;
      }
      r = await this.pool.query(sql, vals);
      let data = this.op !== 'select' && !this.returning ? null : r.rows;
      if (this.mode === 'single' || this.mode === 'maybe') {
        if (!data || data.length === 0) {
          if (this.mode === 'single') return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
          data = null;
        } else data = data[0];
      }
      return { data, error: null, count: null };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
  }
}
function clean(v) { return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v; }

module.exports = { createClient };
