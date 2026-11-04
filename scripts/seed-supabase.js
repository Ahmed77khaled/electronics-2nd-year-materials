/**
 * Supabase Resource Importer & Upsert CLI
 * Synchronizes data/resource-registry.json with Supabase database
 * Idempotent: Can be run multiple times safely without duplicates or data deletion.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const registryPath = path.join(__dirname, '..', 'data', 'resource-registry.json');
if (!fs.existsSync(registryPath)) {
  console.error('[Error] Registry file not found:', registryPath);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
const flat = registry.flatIndex;

// Read config from args or environment
const args = process.argv.slice(2);
let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) supabaseUrl = args[i + 1];
  if (args[i] === '--key' && args[i + 1]) supabaseKey = args[i + 1];
}

// Fallback to js/config.js if empty
if (!supabaseUrl || !supabaseKey) {
  const configPath = path.join(__dirname, '..', 'js', 'config.js');
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const urlMatch = configContent.match(/url:\s*['"]([^'"]+)['"]/);
    const keyMatch = configContent.match(/anonKey:\s*['"]([^'"]+)['"]/);
    if (urlMatch && urlMatch[1]) supabaseUrl = urlMatch[1];
    if (keyMatch && keyMatch[1]) supabaseKey = keyMatch[1];
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.log('------------------------------------------------------------');
  console.log('[Notice] Supabase credentials not provided.');
  console.log('To run this seed script against your live Supabase project:');
  console.log('  node scripts/seed-supabase.js --url <SUPABASE_URL> --key <SERVICE_ROLE_KEY>');
  console.log('Alternatively, you can run the SQL migration directly:');
  console.log('  supabase/migrations/002_seed_courses_and_resources.sql');
  console.log('------------------------------------------------------------');
  console.log(`[Dry Run Verification] Total resources to seed: ${Object.keys(flat).length}`);
  process.exit(0);
}

console.log('[Supabase Seed] Connecting to:', supabaseUrl);

// REST API Helper
function requestSupabase(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(endpoint, supabaseUrl);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      }
    };

    const req = https.request(options, (res) => {
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

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSeed() {
  try {
    // 1. Seed Courses
    console.log('[1/2] Upserting courses...');
    const courses = [
      { slug: 'general-term-1', title: 'الفرقة الثانية — الترم الأول (مجلد مجمع)', sort_order: 0, is_active: true },
      { slug: 'emf', title: 'المجالات الكهرومغناطيسية (EMF)', sort_order: 1, is_active: true },
      { slug: 'logic-circuits', title: 'الدوائر المنطقية (Logic Circuits)', sort_order: 2, is_active: true },
      { slug: 'oop-java', title: 'البرمجة كائنية التوجه (OOP Java)', sort_order: 3, is_active: true },
      { slug: 'electric-circuits', title: 'تصميم الدوائر الكهربية (Electric Circuits)', sort_order: 4, is_active: true },
      { slug: 'math-5', title: 'الرياضيات الهندسية 5 (Math 5)', sort_order: 5, is_active: true },
      { slug: 'humanities', title: 'حقوق الإنسان وإنسانيات (Humanities)', sort_order: 6, is_active: true }
    ];

    const courseMap = {};
    for (const c of courses) {
      const res = await requestSupabase('/rest/v1/courses', 'POST', c);
      if (res && res[0]) {
        courseMap[c.slug] = res[0].id;
      }
    }
    console.log(`[OK] Successfully upserted ${courses.length} courses.`);

    // 2. Fetch all course IDs
    const allCourses = await requestSupabase('/rest/v1/courses?select=id,slug', 'GET');
    allCourses.forEach(c => { courseMap[c.slug] = c.id; });

    // 3. Upsert Resources
    console.log('[2/2] Upserting 75 resources...');
    const subjectToSlug = {
      'ROOT_DRIVE_TERM1': 'general-term-1',
      'SUB_01_EMF': 'emf',
      'SUB_02_LOGIC': 'logic-circuits',
      'SUB_03_OOP_JAVA': 'oop-java',
      'SUB_04_CIRCUITS': 'electric-circuits',
      'SUB_05_MATH5': 'math-5',
      'SUB_06_HUMANITIES': 'humanities'
    };

    let count = 0;
    for (const [key, item] of Object.entries(flat)) {
      const slug = subjectToSlug[item.subject] || 'general-term-1';
      const courseId = courseMap[slug] || courseMap['general-term-1'];
      let url = item.url || '';
      if (!url) {
        const parentKey = item.parentSubfolder || item.parentCard;
        if (parentKey && flat[parentKey] && flat[parentKey].url) {
          url = flat[parentKey].url;
        } else {
          url = 'https://drive.google.com/drive/folders/1bzeSTyWumsJ3hBC5F2vBu9RWhMymVOnP';
        }
      }

      let resType = 'drive';
      if (item.type === 'playlist' || url.includes('youtube.com')) resType = 'youtube';
      else if (['root', 'subject', 'card', 'subfolder'].includes(item.type)) resType = 'folder';

      const payload = {
        course_id: courseId,
        resource_key: key,
        title: item.title || item.name || key,
        resource_type: resType,
        url: url,
        sort_order: ++count,
        is_active: true
      };

      await requestSupabase('/rest/v1/resources', 'POST', payload);
    }

    console.log(`[OK] Successfully upserted ${count} resources into Supabase!`);
  } catch (err) {
    console.error('[Error during seed]:', err.message);
  }
}

runSeed();
