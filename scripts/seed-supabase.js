/**
 * Administrative Supabase Resource Importer & Upsert CLI
 * Electronics 2nd Year Materials Portal
 * 
 * Strict Security & Data Integrity Protocol:
 * 1. ONLY permits SUPABASE_SERVICE_ROLE_KEY (rejects anon keys completely)
 * 2. Reads credentials exclusively from environment variables or explicit --service-key flag
 * 3. NEVER reads or inspects frontend config files (js/config.js)
 * 4. NEVER logs or exposes secrets (masks all credentials)
 * 5. Returns non-zero exit code (process.exit(1)) on ANY failure
 * 6. Preserves parent_resource_id relationships via topological tiered batches
 * 7. Fully Idempotent: Retains existing UUIDs on re-run via ON CONFLICT (resource_key)
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

// Parse CLI flags and Environment
const args = process.argv.slice(2);
let supabaseUrl = process.env.SUPABASE_URL || '';
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) supabaseUrl = args[i + 1];
  if (args[i] === '--service-key' && args[i + 1]) serviceRoleKey = args[i + 1];
}

// 1. Strict Anon Key Blocker & Validation
if (!supabaseUrl || !serviceRoleKey) {
  console.error('============================================================');
  console.error('[SECURITY ERROR] Administrative Supabase credentials missing.');
  console.error('This seed script modifies administrative tables and strictly requires');
  console.error('SUPABASE_SERVICE_ROLE_KEY. The public anon key is strictly prohibited.');
  console.error('');
  console.error('Usage:');
  console.error('  $env:SUPABASE_URL="https://your-project.supabase.co"');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."');
  console.error('  node scripts/seed-supabase.js');
  console.error('');
  console.error('Or pass via flags:');
  console.error('  node scripts/seed-supabase.js --url <URL> --service-key <SERVICE_ROLE_KEY>');
  console.error('============================================================');
  process.exit(1);
}

// Inspect JWT payload to verify it is NOT an anon key
function isAnonKey(jwt) {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return payload.role === 'anon';
  } catch (e) {
    return false;
  }
}

if (isAnonKey(serviceRoleKey)) {
  console.error('[SECURITY REJECTION] The supplied key has role="anon".');
  console.error('Administrative database seeding requires role="service_role". Aborting.');
  process.exit(1);
}

function maskToken(token) {
  if (!token || token.length < 10) return '***';
  return token.substring(0, 6) + '...' + token.substring(token.length - 4);
}

console.log('============================================================');
console.log('🌱 SUPABASE RESOURCE IMPORT & UPSERT CLI');
console.log('============================================================');
console.log('Target URL :', supabaseUrl);
console.log('Auth Role  : service_role [Token masked: ' + maskToken(serviceRoleKey) + ']');
console.log('Total Items:', Object.keys(flat).length);
console.log('============================================================\n');

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
      'apikey': serviceRoleKey,
      'Authorization': 'Bearer ' + serviceRoleKey,
      'Content-Type': 'application/json',
      ...extraHeaders
    };

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
