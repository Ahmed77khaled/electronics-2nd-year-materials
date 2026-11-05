/**
 * Administrative Supabase Resource Importer & Upsert CLI
 * Electronics 2nd Year Materials Portal
 * 
 * Strict Security & Data Integrity Protocol:
 * 1. Accepts only sb_secret_* or a legacy service_role JWT; rejects publishable/anon keys.
 * 2. Reads secrets only from environment variables; never accepts secret values as CLI args.
 * 3. NEVER reads or inspects frontend config files (js/config.js).
 * 4. NEVER logs, masks, or exposes any part of an API secret.
 * 5. Requires HTTPS for remote Supabase endpoints and supports --validate-only.
 * 6. Preserves parent_resource_id relationships via topological tiered batches.
 * 7. Fully idempotent: retains existing UUIDs on re-run via ON CONFLICT (resource_key).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load registry
const registryPath = path.join(__dirname, '..', 'data', 'resource-registry.json');
if (!fs.existsSync(registryPath)) {
  console.error('[FATAL] Resource registry JSON file not found at:', registryPath);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
const flat = registry.flatIndex;

// Read secrets only from environment variables. Do not accept keys as CLI
// arguments because command history and process listings can expose them.
const args = process.argv.slice(2);
let supabaseUrl = (process.env.SUPABASE_URL || '').trim();
let adminApiKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const validateOnly = args.includes('--validate-only');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) supabaseUrl = args[i + 1].trim();
  if (args[i] === '--secret-key' || args[i] === '--service-key') {
    console.error('[SECURITY ERROR] Do not pass API keys as command-line arguments.');
    console.error('Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in the process environment.');
    process.exit(1);
  }
}

// Current Supabase keys are opaque strings. Legacy service_role keys are JWTs.
// Accept only an elevated secret; never infer that an unknown key is privileged.
function classifyAdminKey(key) {
  if (typeof key !== 'string' || !key) return 'missing';
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return 'secret';
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return 'publishable';

  try {
    const parts = key.split('.');
    if (parts.length !== 3) return 'invalid';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    if (payload.role === 'service_role') return 'legacy_service_role';
    if (payload.role === 'anon') return 'anon';
    return 'non_elevated_jwt';
  } catch (e) {
    return 'invalid';
  }
}

const adminKeyType = classifyAdminKey(adminApiKey);
if (!supabaseUrl || !adminApiKey) {
  console.error('[SECURITY ERROR] Missing Supabase URL or server-side API key.');
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY (legacy).');
  process.exit(1);
}

let parsedSupabaseUrl;
try {
  parsedSupabaseUrl = new URL(supabaseUrl);
} catch (e) {
  console.error('[SECURITY ERROR] SUPABASE_URL is not a valid URL.');
  process.exit(1);
}
const isLocalLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedSupabaseUrl.hostname);
if (parsedSupabaseUrl.protocol !== 'https:' && !(parsedSupabaseUrl.protocol === 'http:' && isLocalLoopback)) {
  console.error('[SECURITY ERROR] HTTPS is required when sending an elevated API key.');
  process.exit(1);
}

if (adminKeyType !== 'secret' && adminKeyType !== 'legacy_service_role') {
  console.error('[SECURITY REJECTION] The supplied key is not an elevated Supabase secret/service_role key.');
  console.error('Accepted formats: sb_secret_* or a legacy JWT with role="service_role".');
  process.exit(1);
}

console.log('============================================================');
console.log('SUPABASE RESOURCE IMPORT & UPSERT CLI');
console.log('============================================================');
console.log('Target URL :', supabaseUrl);
console.log('Admin key  :', adminKeyType === 'secret' ? 'Secret API key [value hidden]' : 'Legacy service_role JWT [value hidden]');
console.log('Total Items:', Object.keys(flat).length);
console.log('============================================================');

if (validateOnly) {
  console.log('[Validation] URL and elevated key format accepted. No network request was made.');
  process.exit(0);
}

// HTTPS Request Helper
function requestSupabase(endpoint, method, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(endpoint, supabaseUrl);
    } catch (e) {
      return reject(new Error('Invalid Supabase URL: ' + supabaseUrl));
    }

    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': adminApiKey,
      'Content-Type': 'application/json',
      ...extraHeaders
    };

    // Opaque sb_secret_* keys must only be sent in apikey. Legacy service_role
    // JWTs can be sent in both headers for backwards compatibility.
    if (adminKeyType === 'legacy_service_role') {
      headers['Authorization'] = 'Bearer ' + adminApiKey;
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers
    };

    const req = (urlObj.protocol === 'https:' ? https : require('http')).request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error('Network error: ' + err.message)));
    if (postData) req.write(postData);
    req.end();
  });
}

// Map Subject to Course Slug
const subjectToSlug = {
  null: 'general-term-1',
  'ROOT_DRIVE_TERM1': 'general-term-1',
  'SUB_01_EMF': 'emf',
  'SUB_02_LOGIC': 'logic-circuits',
  'SUB_03_OOP_JAVA': 'oop-java',
  'SUB_04_CIRCUITS': 'electric-circuits',
  'SUB_05_MATH5': 'math-5',
  'SUB_06_HUMANITIES': 'humanities'
};

function mapResourceType(t, url) {
  if (t === 'playlist' || (url && url.includes('youtube.com'))) return 'youtube';
  if (['root', 'subject', 'card', 'subfolder'].includes(t)) return 'folder';
  return 'drive';
}

async function runSeed() {
  try {
    // -------------------------------------------------------------------------
    // Step 1: Upsert Courses
    // -------------------------------------------------------------------------
    console.log('[Batch 1/6] Upserting 7 Courses...');
    const coursesToUpsert = [
      { slug: 'general-term-1', title: 'الفرقة الثانية — الترم الأول (مجلد مجمع)', sort_order: 0, is_active: true },
      { slug: 'emf', title: 'المجالات الكهرومغناطيسية (EMF)', sort_order: 1, is_active: true },
      { slug: 'logic-circuits', title: 'الدوائر المنطقية (Logic Circuits)', sort_order: 2, is_active: true },
      { slug: 'oop-java', title: 'البرمجة كائنية التوجه (OOP Java)', sort_order: 3, is_active: true },
      { slug: 'electric-circuits', title: 'تصميم الدوائر الكهربية (Electric Circuits)', sort_order: 4, is_active: true },
      { slug: 'math-5', title: 'الرياضيات الهندسية 5 (Math 5)', sort_order: 5, is_active: true },
      { slug: 'humanities', title: 'حقوق الإنسان وإنسانيات (Humanities)', sort_order: 6, is_active: true }
    ];

    await requestSupabase(
      '/rest/v1/courses?on_conflict=slug',
      'POST',
      coursesToUpsert,
      { 'Prefer': 'resolution=merge-duplicates,return=representation' }
    );

    // Fetch Course UUID map
    const dbCourses = await requestSupabase('/rest/v1/courses?select=id,slug', 'GET');
    const courseMap = {};
    dbCourses.forEach(c => { courseMap[c.slug] = c.id; });
    console.log(`  -> Courses verified: ${Object.keys(courseMap).length} active courses.`);

    // -------------------------------------------------------------------------
    // Step 2: Organize 75 Resources into 5 Strict Topological Tiers
    // -------------------------------------------------------------------------
    const tiers = {
      0: [], // root
      1: [], // subjects
      2: [], // cards
      3: [], // subfolders
      4: []  // children (chips, playlists, items)
    };

    for (const [key, item] of Object.entries(flat)) {
      const t = item.type;
      if (t === 'root') tiers[0].push({ key, item });
      else if (t === 'subject') tiers[1].push({ key, item });
      else if (t === 'card') tiers[2].push({ key, item });
      else if (t === 'subfolder') tiers[3].push({ key, item });
      else tiers[4].push({ key, item });
    }

    // Cache of Resource key -> UUID
    const resourceUuidMap = {};

    // Fetch any existing resources to preserve existing UUIDs
    const existingResources = await requestSupabase('/rest/v1/resources?select=id,resource_key', 'GET');
    if (Array.isArray(existingResources)) {
      existingResources.forEach(r => { resourceUuidMap[r.resource_key] = r.id; });
    }

    const tierLabels = [
      'Tier 1 (Root Drive)',
      'Tier 2 (6 Main Subjects)',
      'Tier 3 (6 Subject Cards)',
      'Tier 4 (16 Subfolders)',
      'Tier 5 (46 Child Chips, Playlists & Items)'
    ];

    let totalUpserted = 0;

    for (let tierIdx = 0; tierIdx < 5; tierIdx++) {
      const currentTier = tiers[tierIdx];
      console.log(`[Batch ${tierIdx + 2}/6] Upserting ${tierLabels[tierIdx]} (${currentTier.length} items)...`);

      const batchPayload = currentTier.map(({ key, item }) => {
        const slug = subjectToSlug[item.subject] || 'general-term-1';
        const courseId = courseMap[slug] || courseMap['general-term-1'];

        let url = item.url || '';
        if (!url) {
          const pKey = item.parentSubfolder || item.parentCard;
          if (pKey && flat[pKey] && flat[pKey].url) {
            url = flat[pKey].url;
          } else {
            url = 'https://drive.google.com/drive/folders/1bzeSTyWumsJ3hBC5F2vBu9RWhMymVOnP';
          }
        }

        // Determine parent_key
        let parentKey = null;
        if (item.type === 'root') {
          parentKey = null;
        } else if (item.type === 'subject') {
          parentKey = 'ROOT_DRIVE_TERM1';
        } else if (item.type === 'card') {
          parentKey = item.subject;
        } else if (item.type === 'subfolder') {
          parentKey = item.subject + '_MAIN';
        } else {
          parentKey = item.parentSubfolder || item.parentCard || (item.subject + '_MAIN');
        }

        const parentUuid = parentKey ? (resourceUuidMap[parentKey] || null) : null;

        const row = {
          course_id: courseId,
          resource_key: key,
          title: item.title || item.name || key,
          resource_type: mapResourceType(item.type, url),
          url: url,
          parent_resource_id: parentUuid,
          is_active: true
        };

        // If UUID already known, preserve it
        if (resourceUuidMap[key]) {
          row.id = resourceUuidMap[key];
        }

        return row;
      });

      const upsertResult = await requestSupabase(
        '/rest/v1/resources?on_conflict=resource_key',
        'POST',
        batchPayload,
        { 'Prefer': 'resolution=merge-duplicates,return=representation' }
      );

      if (Array.isArray(upsertResult)) {
        upsertResult.forEach(r => {
          resourceUuidMap[r.resource_key] = r.id;
        });
        totalUpserted += upsertResult.length;
        console.log(`  -> Successfully verified ${upsertResult.length} items in ${tierLabels[tierIdx]}.`);
      } else {
        throw new Error(`Failed to upsert ${tierLabels[tierIdx]}: Invalid response.`);
      }
    }

    console.log('\n============================================================');
    console.log(`🎉 SUCCESS: All ${totalUpserted} resources verified and synchronized.`);
    console.log('============================================================');
    process.exit(0);

  } catch (err) {
    console.error('\n[FATAL ERROR during seed execution]:', err.message);
    process.exit(1);
  }
}

runSeed();
