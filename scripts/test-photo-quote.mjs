// Exercises api/photo-quote.js against a fake Claude API on localhost: the
// setup gate, photo validation, the request it sends (model, images, schema),
// and how it cleans up the answer. No real API calls, no Supabase.
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../pricing.config.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

// Fake Messages API: records the request, answers with `reply`.
let seen = null, reply = null;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen = { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [{ type: 'text', text: JSON.stringify(reply) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const handler = require(path.join(ROOT, 'api/photo-quote.js'));
let ipN = 0;
async function call(body, env = {}) {
  Object.assign(process.env, env);
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${++ipN}` }, body }, res);
  return { status, json };
}
// The smallest thing that passes the JPEG check.
const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 1)]).toString('base64');

console.log('== setup gate ==');
delete process.env.ANTHROPIC_API_KEY;
ok((await call({ photos: [jpeg] })).status === 503, 'no API key did not 503');
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

console.log('== validation ==');
ok((await call({ photos: [] })).status === 400, 'no photos accepted');
ok((await call({ photos: [jpeg, jpeg, jpeg, jpeg, jpeg] })).status === 400, 'five photos accepted');
ok((await call({ photos: [Buffer.alloc(300, 7).toString('base64')] })).status === 400, 'non-JPEG accepted');
ok(seen === null, 'a bad request reached the API');

console.log('== a read ==');
reply = { items: [{ key: 'couch', count: 2 }, { key: 'boxes', count: 3 }, { key: 'couch', count: 1 }], notes: 'We see a couch and some boxes.', unsure: false };
const r = await call({ photos: [jpeg, jpeg] });
ok(r.status === 200, `read failed: ${JSON.stringify(r.json)}`);
ok(r.json.items.couch === 3 && r.json.items.boxes === 3, `counts not merged: ${JSON.stringify(r.json.items)}`);
ok(Array.isArray(r.json.photos) && r.json.photos.length === 0, 'photos claimed stored without Supabase');
const b = seen && seen.body;
ok(b && b.model === 'claude-opus-5', `model is ${b && b.model}`);
ok(b && b.messages[0].content.filter((c) => c.type === 'image').length === 2, 'both photos not sent');
ok(b && b.output_config && b.output_config.format.type === 'json_schema', 'no structured output');
const keys = b && b.output_config.format.schema.properties.items.items.properties.key.enum;
ok(JSON.stringify(keys) === JSON.stringify(ITEMS.map((i) => i.key)), 'schema keys differ from ITEMS');
// The service area is the Portland metro (2026-10-07), from a Gresham base.
const sys = b && (typeof b.system === 'string' ? b.system : JSON.stringify(b.system));
ok(/Portland metro/.test(sys || '') && !/in Gresham, Oregon price/.test(sys || ''), 'the prompt does not name the Portland metro');

console.log('== cleanup ==');
const { tidy } = handler;
const t = tidy({ items: [{ key: 'piano', count: 1 }, { key: 'tv', count: 500 }, { key: 'table', count: -2 }], notes: 'x'.repeat(900), unsure: 0 });
ok(!('piano' in t.items) && t.items.tv === 30 && !('table' in t.items), `bad counts not clamped: ${JSON.stringify(t.items)}`);
ok(t.notes.length === 300 && t.unsure === false, 'notes not trimmed');
ok(JSON.stringify(tidy(null)) === JSON.stringify({ items: {}, notes: '', unsure: false }), 'null answer not handled');

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
