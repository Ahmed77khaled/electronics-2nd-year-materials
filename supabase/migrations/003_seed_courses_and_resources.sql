-- ===========================================================================
-- 003_seed_courses_and_resources.sql
-- Deterministic Seed Migration: Electronics 2nd Year (Term 1)
-- Apply after 001_student_analytics_foundation.sql and 002_secure_tracking_rpcs.sql.
--
-- Idempotent: Uses ON CONFLICT (slug / resource_key) DO UPDATE.
-- Preserves all existing UUIDs and guarantees topological insert order
-- (parents are always inserted before their dependent children).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Seed Courses (The 6 Main Subjects + 1 General Course for Root Term Drive)
-- ---------------------------------------------------------------------------
insert into public.courses (slug, title, sort_order, is_active)
values
  ('general-term-1', 'الفرقة الثانية — الترم الأول (مجلد مجمع)', 0, true),
  ('emf', 'المجالات الكهرومغناطيسية (EMF)', 1, true),
  ('logic-circuits', 'الدوائر المنطقية (Logic Circuits)', 2, true),
  ('oop-java', 'البرمجة كائنية التوجه (OOP Java)', 3, true),
  ('electric-circuits', 'تصميم الدوائر الكهربية (Electric Circuits)', 4, true),
  ('math-5', 'الرياضيات الهندسية 5 (Math 5)', 5, true),
  ('humanities', 'حقوق الإنسان وإنسانيات (Humanities)', 6, true)
on conflict (slug) do update set
  title = excluded.title,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Seed All 75 Resources with Strict Parent-Child Ordering
-- ---------------------------------------------------------------------------
do $$
declare
  c_general uuid; c_emf uuid; c_logic uuid; c_oop uuid; c_circuits uuid; c_math uuid; c_humanities uuid;
begin
  select id into c_general from public.courses where slug = 'general-term-1';
  select id into c_emf from public.courses where slug = 'emf';
  select id into c_logic from public.courses where slug = 'logic-circuits';
  select id into c_oop from public.courses where slug = 'oop-java';
  select id into c_circuits from public.courses where slug = 'electric-circuits';
  select id into c_math from public.courses where slug = 'math-5';
  select id into c_humanities from public.courses where slug = 'humanities';

  -- [1/75] ROOT_DRIVE_TERM1 (root) -> parent: NONE
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_general, 'ROOT_DRIVE_TERM1', 'مجلد الترم الأول بالكامل — الفرقة الثانية هندسة إلكترونيات', 'folder', 'https://drive.google.com/drive/folders/1bzeSTyWumsJ3hBC5F2vBu9RWhMymVOnP', null, 1, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [2/75] SUB_01_EMF (subject) -> parent: ROOT_DRIVE_TERM1
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF', 'المجالات الكهرومغناطيسية (EMF)', 'folder', 'https://drive.google.com/drive/folders/1ObIiM7q7myJtpnN-LddSD06MQeb66fkB', (select id from public.resources where resource_key = 'ROOT_DRIVE_TERM1'), 2, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [3/75] SUB_02_LOGIC (subject) -> parent: ROOT_DRIVE_TERM1
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC', 'الدوائر المنطقية (LOGIC)', 'folder', 'https://drive.google.com/drive/folders/1A42n3hBNRAqkXXciBXN81FJXt9XaIe-n', (select id from public.resources where resource_key = 'ROOT_DRIVE_TERM1'), 3, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [4/75] SUB_03_OOP_JAVA (subject) -> parent: ROOT_DRIVE_TERM1
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA', 'البرمجة كائنية التوجه (OOP_JAVA)', 'folder', 'https://drive.google.com/drive/folders/1Ct0U9Ia1zM9vhcfZDEkI_ZJCKvdEQ5iY', (select id from public.resources where resource_key = 'ROOT_DRIVE_TERM1'), 4, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [5/75] SUB_04_CIRCUITS (subject) -> parent: ROOT_DRIVE_TERM1
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS', 'تصميم الدوائر الكهربية (CIRCUITS)', 'folder', 'https://drive.google.com/drive/folders/10ZRjwWKBCa6XRPZrwcrTDIA3BtpYCJp4', (select id from public.resources where resource_key = 'ROOT_DRIVE_TERM1'), 5, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [6/75] SUB_05_MATH5 (subject) -> parent: ROOT_DRIVE_TERM1
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_math, 'SUB_05_MATH5', 'الرياضيات الهندسية 5 (MATH5)', 'folder', 'https://drive.google.com/drive/folders/1q-5GZESVNaLVWnpL3jke22sMvtBkkOLy', (select id from public.resources where resource_key = 'ROOT_DRIVE_TERM1'), 6, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [7/75] SUB_06_HUMANITIES (subject) -> parent: ROOT_DRIVE_TERM1
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES', 'حقوق الإنسان وإنسانيات (HUMANITIES)', 'folder', 'https://drive.google.com/drive/folders/1pNgXZpj_CrqV-EtfmDKtCy0hxF8Lb0bV', (select id from public.resources where resource_key = 'ROOT_DRIVE_TERM1'), 7, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [8/75] SUB_01_EMF_MAIN (card) -> parent: SUB_01_EMF
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_MAIN', 'مجالات (د.رجب السحيمى)', 'folder', 'https://drive.google.com/drive/folders/16wbcWi28jzkrDxE0VkuKWQxY54ntcHpp', (select id from public.resources where resource_key = 'SUB_01_EMF'), 8, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [9/75] SUB_02_LOGIC_MAIN (card) -> parent: SUB_02_LOGIC
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_MAIN', 'Logic Circuit Design (د. محمد عبد الرحمن)', 'folder', 'https://drive.google.com/drive/folders/17l2TgNnU401gMaJbHr42JlQ4Ct_nUf_s', (select id from public.resources where resource_key = 'SUB_02_LOGIC'), 9, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [10/75] SUB_03_OOP_JAVA_MAIN (card) -> parent: SUB_03_OOP_JAVA
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAIN', 'Oop java (د. هالة الحديدي)', 'folder', 'https://drive.google.com/drive/folders/18XdbYvfPOlFSEd6BXrlJ3Wau2x32VCtd', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA'), 10, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [11/75] SUB_04_CIRCUITS_MAIN (card) -> parent: SUB_04_CIRCUITS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_MAIN', 'Electric Circle Design (د. رمضان عبد العال)', 'folder', 'https://drive.google.com/drive/folders/1s6QOcuNwfFiKIfHYpT2-llvKvNsEdSRz', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS'), 11, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [12/75] SUB_05_MATH5_MAIN (card) -> parent: SUB_05_MATH5
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_math, 'SUB_05_MATH5_MAIN', 'Math 5 (د. حموده ابو الدهب)', 'folder', 'https://drive.google.com/drive/folders/12Pq4iel8ZXYSNp_5lTGY9YOoKPx-QMM6', (select id from public.resources where resource_key = 'SUB_05_MATH5'), 12, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [13/75] SUB_06_HUMANITIES_MAIN (card) -> parent: SUB_06_HUMANITIES
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_MAIN', 'انسانيات (د.محمد اسماعيل)', 'folder', 'https://drive.google.com/drive/folders/1m-ycL4YUAeZVb4uKraSlHHEadHiHmp8o', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES'), 13, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [14/75] SUB_01_EMF_EXAMS (subfolder) -> parent: SUB_01_EMF_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_EXAMS', 'Exams', 'folder', 'https://drive.google.com/drive/folders/18rInBwg3HI83y5wf_RTmvjb3Qtp9UrDk', (select id from public.resources where resource_key = 'SUB_01_EMF_MAIN'), 14, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [15/75] SUB_01_EMF_MAT (subfolder) -> parent: SUB_01_EMF_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_MAT', 'material', 'folder', 'https://drive.google.com/drive/folders/11uJnVqIpCF3Wy2VzAVCDoJ6vnZ9dacFW', (select id from public.resources where resource_key = 'SUB_01_EMF_MAIN'), 15, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [16/75] SUB_01_EMF_SHEETS (subfolder) -> parent: SUB_01_EMF_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_SHEETS', 'sheets', 'folder', 'https://drive.google.com/drive/folders/1mXY9NP1Sq3pKexiRKuO17ZIRJ8_qFqmO', (select id from public.resources where resource_key = 'SUB_01_EMF_MAIN'), 16, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [17/75] SUB_02_LOGIC_EXAMS (subfolder) -> parent: SUB_02_LOGIC_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_EXAMS', 'Exams', 'folder', 'https://drive.google.com/drive/folders/1w329Ks7o8KRjkj9a-9eaRz8x60uqHE87', (select id from public.resources where resource_key = 'SUB_02_LOGIC_MAIN'), 17, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [18/75] SUB_02_LOGIC_REVISION (subfolder) -> parent: SUB_02_LOGIC_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_REVISION', 'Lectures & Revision', 'folder', 'https://drive.google.com/drive/folders/1azBWzbV-ScH4nV4DDiA3DKWGptlfwGy6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_MAIN'), 18, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [19/75] SUB_02_LOGIC_SOLVED_QUESTIONS (subfolder) -> parent: SUB_02_LOGIC_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_SOLVED_QUESTIONS', 'Solved Questions & Notes', 'folder', 'https://drive.google.com/drive/folders/1JWLZ4A_ZH4jt143GzF7QSXRlHOlLAZR6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_MAIN'), 19, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [20/75] SUB_03_OOP_JAVA_MAT (subfolder) -> parent: SUB_03_OOP_JAVA_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAT', 'material H.I.E', 'folder', 'https://drive.google.com/drive/folders/13bO7QHasyGPt26V1WB4fJf_3-gRRZL8b', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAIN'), 20, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [21/75] SUB_03_OOP_JAVA_OTHER_MAT (subfolder) -> parent: SUB_03_OOP_JAVA_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_OTHER_MAT', 'other Material', 'folder', 'https://drive.google.com/drive/folders/1KtZs0T-kmfao_7h9MXSNIVPAUZ7F3pWE', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAIN'), 21, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [22/75] SUB_03_OOP_JAVA_YT_MAT (subfolder) -> parent: SUB_03_OOP_JAVA_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_YT_MAT', 'Youtube', 'folder', 'https://drive.google.com/drive/folders/1uSTPgb9TuprJLaFqRtCxDIxK7BC1r5Op', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAIN'), 22, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [23/75] SUB_04_CIRCUITS_EXAMS (subfolder) -> parent: SUB_04_CIRCUITS_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_EXAMS', 'Exams', 'folder', 'https://drive.google.com/drive/folders/1LIXvVHZ5F0_QFWftcqRgaBaNtAsFXm23', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_MAIN'), 23, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [24/75] SUB_04_CIRCUITS_REVISION (subfolder) -> parent: SUB_04_CIRCUITS_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_REVISION', 'Lectures & Revision', 'folder', 'https://drive.google.com/drive/folders/16IIH4amu633mV6lHNLNFiixv8TrGPfLu', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_MAIN'), 24, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [25/75] SUB_04_CIRCUITS_SHEETS (subfolder) -> parent: SUB_04_CIRCUITS_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_SHEETS', 'Sheets', 'folder', 'https://drive.google.com/drive/folders/1l74TmM8vav-BsMeFmG-G-gm7eUJpRvVy', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_MAIN'), 25, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [26/75] SUB_04_CIRCUITS_YT_GUIDE (subfolder) -> parent: SUB_04_CIRCUITS_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_YT_GUIDE', 'Youtube Guide', 'folder', 'https://drive.google.com/drive/folders/1dRORKjuodtVupbHBbJWyjTJ7gODwW8el', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_MAIN'), 26, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [27/75] SUB_06_HUMANITIES_PRESENTATIONS (subfolder) -> parent: SUB_06_HUMANITIES_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_PRESENTATIONS', 'presentation Human Rights', 'folder', 'https://drive.google.com/drive/folders/1-6L4lJpB2-s4Sde2RhIPjnZCE59uAfiG', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_MAIN'), 27, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [28/75] SUB_06_HUMANITIES_QUESTION_BANK (subfolder) -> parent: SUB_06_HUMANITIES_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_QUESTION_BANK', 'Questions & Question Bank', 'folder', 'https://drive.google.com/drive/folders/1ONn0eTxbqQI-qSR9qO0crfua2HadVdfK', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_MAIN'), 28, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [29/75] SUB_06_HUMANITIES_SUMMARIES (subfolder) -> parent: SUB_06_HUMANITIES_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_SUMMARIES', 'Lectures & Summaries', 'folder', 'https://drive.google.com/drive/folders/1ibtJaw3ysgbKqMvH9fDC6PxSIEZLPlSF', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_MAIN'), 29, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [30/75] SUB_01_EMF_EXAMS_MIDTERM (item) -> parent: SUB_01_EMF_EXAMS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_EXAMS_MIDTERM', 'حل امتحان الميدترم', 'drive', 'https://drive.google.com/drive/folders/18rInBwg3HI83y5wf_RTmvjb3Qtp9UrDk', (select id from public.resources where resource_key = 'SUB_01_EMF_EXAMS'), 30, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [31/75] SUB_01_EMF_EXAMS_QUIZZES (item) -> parent: SUB_01_EMF_EXAMS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_EXAMS_QUIZZES', 'كويز 1 وكويز 2 لعام 2025-2026 بالحل', 'drive', 'https://drive.google.com/drive/folders/18rInBwg3HI83y5wf_RTmvjb3Qtp9UrDk', (select id from public.resources where resource_key = 'SUB_01_EMF_EXAMS'), 31, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [32/75] SUB_01_EMF_MAT_EXAM_BANK (item) -> parent: SUB_01_EMF_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_MAT_EXAM_BANK', 'بنك أسئلة وتجميعات الامتحانات السابقة', 'drive', 'https://drive.google.com/drive/folders/11uJnVqIpCF3Wy2VzAVCDoJ6vnZ9dacFW', (select id from public.resources where resource_key = 'SUB_01_EMF_MAT'), 32, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [33/75] SUB_01_EMF_MAT_FORMULAS (item) -> parent: SUB_01_EMF_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_MAT_FORMULAS', 'ملخصات القوانين ونظم الإحداثيات', 'drive', 'https://drive.google.com/drive/folders/11uJnVqIpCF3Wy2VzAVCDoJ6vnZ9dacFW', (select id from public.resources where resource_key = 'SUB_01_EMF_MAT'), 33, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [34/75] SUB_01_EMF_MAT_NOTEBOOK (item) -> parent: SUB_01_EMF_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_MAT_NOTEBOOK', 'كشكول المحاضرات والسكاشن بخط يد م/ أحمد الفلاح', 'drive', 'https://drive.google.com/drive/folders/11uJnVqIpCF3Wy2VzAVCDoJ6vnZ9dacFW', (select id from public.resources where resource_key = 'SUB_01_EMF_MAT'), 34, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [35/75] SUB_01_EMF_SHEETS_1_2_3 (item) -> parent: SUB_01_EMF_SHEETS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_SHEETS_1_2_3', 'شيت 1، 2، 3 بحل م/ أحمد الفلاح', 'drive', 'https://drive.google.com/drive/folders/1mXY9NP1Sq3pKexiRKuO17ZIRJ8_qFqmO', (select id from public.resources where resource_key = 'SUB_01_EMF_SHEETS'), 35, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [36/75] SUB_01_EMF_SHEETS_4_5 (item) -> parent: SUB_01_EMF_SHEETS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_emf, 'SUB_01_EMF_SHEETS_4_5', 'شيت 4 و 5 بحل م/ أحمد الفلاح', 'drive', 'https://drive.google.com/drive/folders/1mXY9NP1Sq3pKexiRKuO17ZIRJ8_qFqmO', (select id from public.resources where resource_key = 'SUB_01_EMF_SHEETS'), 36, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [37/75] SUB_02_LOGIC_EXAMS_FINALS (chip) -> parent: SUB_02_LOGIC_EXAMS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_EXAMS_FINALS', 'Finals', 'drive', 'https://drive.google.com/drive/folders/1BEPvTfDLsw4Rcu7YsvzFdDtTvPGJuSYy', (select id from public.resources where resource_key = 'SUB_02_LOGIC_EXAMS'), 37, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [38/75] SUB_02_LOGIC_EXAMS_MIDTERMS (chip) -> parent: SUB_02_LOGIC_EXAMS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_EXAMS_MIDTERMS', 'Midterms', 'drive', 'https://drive.google.com/drive/folders/1PbWJOLufGkGppWVXomKt8XYq9lLW9Qjh', (select id from public.resources where resource_key = 'SUB_02_LOGIC_EXAMS'), 38, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [39/75] SUB_02_LOGIC_EXAMS_QUIZZES (chip) -> parent: SUB_02_LOGIC_EXAMS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_EXAMS_QUIZZES', 'Quizzes', 'drive', 'https://drive.google.com/drive/folders/19SgktUiKQjzX7RjyLgb0-io_hEY1voFf', (select id from public.resources where resource_key = 'SUB_02_LOGIC_EXAMS'), 39, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [40/75] SUB_02_LOGIC_REV_COMBINATIONAL (item) -> parent: SUB_02_LOGIC_REVISION
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_REV_COMBINATIONAL', 'مسائل Combinational Logic للمحاضرات 1-5', 'drive', 'https://drive.google.com/drive/folders/1azBWzbV-ScH4nV4DDiA3DKWGptlfwGy6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_REVISION'), 40, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [41/75] SUB_02_LOGIC_REV_FLIPFLOPS (item) -> parent: SUB_02_LOGIC_REVISION
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_REV_FLIPFLOPS', 'ملخص مخططات وجداول الـ Flip-Flops', 'drive', 'https://drive.google.com/drive/folders/1azBWzbV-ScH4nV4DDiA3DKWGptlfwGy6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_REVISION'), 41, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [42/75] SUB_02_LOGIC_REV_LEC6 (item) -> parent: SUB_02_LOGIC_REVISION
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_REV_LEC6', 'محاضرة 6 (Function Implementation MUX/Decoders)', 'drive', 'https://drive.google.com/drive/folders/1azBWzbV-ScH4nV4DDiA3DKWGptlfwGy6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_REVISION'), 42, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [43/75] SUB_02_LOGIC_REV_SECTIONS (item) -> parent: SUB_02_LOGIC_REVISION
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_REV_SECTIONS', 'مراجعة السكاشن الشاملة (19 صفحة)', 'drive', 'https://drive.google.com/drive/folders/1azBWzbV-ScH4nV4DDiA3DKWGptlfwGy6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_REVISION'), 43, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [44/75] SUB_02_LOGIC_SOLVED_APPLICATIONS (item) -> parent: SUB_02_LOGIC_SOLVED_QUESTIONS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_SOLVED_APPLICATIONS', 'تطبيقات ومسائل دوائر منطقية هامة', 'drive', 'https://drive.google.com/drive/folders/1JWLZ4A_ZH4jt143GzF7QSXRlHOlLAZR6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_SOLVED_QUESTIONS'), 44, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [45/75] SUB_02_LOGIC_SOLVED_EXAMS (item) -> parent: SUB_02_LOGIC_SOLVED_QUESTIONS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_logic, 'SUB_02_LOGIC_SOLVED_EXAMS', 'أسئلة امتحانات خاصة محلولة', 'drive', 'https://drive.google.com/drive/folders/1JWLZ4A_ZH4jt143GzF7QSXRlHOlLAZR6', (select id from public.resources where resource_key = 'SUB_02_LOGIC_SOLVED_QUESTIONS'), 45, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [46/75] SUB_03_OOP_JAVA_MAT_BOOK (chip) -> parent: SUB_03_OOP_JAVA_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAT_BOOK', 'book', 'drive', 'https://drive.google.com/drive/folders/13mJgJcbwrVxVM06NNkByyMaTZDEw9uVt', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAT'), 46, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [47/75] SUB_03_OOP_JAVA_MAT_EXAMS (chip) -> parent: SUB_03_OOP_JAVA_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAT_EXAMS', 'exams', 'drive', 'https://drive.google.com/drive/folders/1_I7m_6gy8trRPpjWO4b0Nig8hGdd-ZK1', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAT'), 47, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [48/75] SUB_03_OOP_JAVA_MAT_LABS (chip) -> parent: SUB_03_OOP_JAVA_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAT_LABS', 'labs', 'drive', 'https://drive.google.com/drive/folders/1-ffJzBP2Gs0_xXHW7xOkCyQzY3TVd7v0', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAT'), 48, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [49/75] SUB_03_OOP_JAVA_MAT_LECTURE (chip) -> parent: SUB_03_OOP_JAVA_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAT_LECTURE', 'lecture', 'drive', 'https://drive.google.com/drive/folders/16_ugmx-nda6q-zw-EXY6dDuTuacJ0lTO', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAT'), 49, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [50/75] SUB_03_OOP_JAVA_MAT_SECTIONS (chip) -> parent: SUB_03_OOP_JAVA_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAT_SECTIONS', 'sections', 'drive', 'https://drive.google.com/drive/folders/1M1KiYf1V-prG4Xj_98uLV_cWxW5oh7ah', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAT'), 50, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [51/75] SUB_03_OOP_JAVA_MAT_SHEETS (chip) -> parent: SUB_03_OOP_JAVA_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_MAT_SHEETS', 'sheets&Assighments', 'drive', 'https://drive.google.com/drive/folders/1xnSk6agCcZ3nnJ0q-N8cH1necDFEt-LL', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_MAT'), 51, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [52/75] SUB_03_OOP_JAVA_OTHER_FINALS (chip) -> parent: SUB_03_OOP_JAVA_OTHER_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_OTHER_FINALS', 'Final Exams', 'drive', 'https://drive.google.com/drive/folders/11bdg5s8AF-6Lu5OeWf_psHLyM8mE1r5P', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_OTHER_MAT'), 52, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [53/75] SUB_03_OOP_JAVA_OTHER_MIDTERMS (chip) -> parent: SUB_03_OOP_JAVA_OTHER_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_OTHER_MIDTERMS', 'midterms', 'drive', 'https://drive.google.com/drive/folders/1fnchkZk2ju544e7aDpqZzvgY0iGNZZZb', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_OTHER_MAT'), 53, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [54/75] SUB_03_OOP_JAVA_OTHER_QUIZZES (chip) -> parent: SUB_03_OOP_JAVA_OTHER_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_OTHER_QUIZZES', 'quizes', 'drive', 'https://drive.google.com/drive/folders/1tOwNm4UHXRwMWokCzhkGMrIfiwXD0PV-', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_OTHER_MAT'), 54, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [55/75] SUB_03_OOP_JAVA_YT_PLAYLIST_BASICS (playlist) -> parent: SUB_03_OOP_JAVA_YT_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_YT_PLAYLIST_BASICS', '▶ جزء الأساسيات — مراجعة أساسيات Java قبل OOP', 'youtube', 'https://youtube.com/playlist?list=PL1DUmTEdeA6K7rdxKiWJq6JIxTvHalY8f&si=z8nmHaUdaqSRIdve', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_YT_MAT'), 55, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [56/75] SUB_03_OOP_JAVA_YT_PLAYLIST_OOP (playlist) -> parent: SUB_03_OOP_JAVA_YT_MAT
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_oop, 'SUB_03_OOP_JAVA_YT_PLAYLIST_OOP', '▶ جزء الـ OOP — شرح مفاهيم OOP بالتدريج', 'youtube', 'https://youtube.com/playlist?list=PL1DUmTEdeA6Icttz-O9C3RPRF8R8Px5vk&si=-4a3rKLdl8YQXjPE', (select id from public.resources where resource_key = 'SUB_03_OOP_JAVA_YT_MAT'), 56, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [57/75] SUB_04_CIRCUITS_EXAMS_FINALS (chip) -> parent: SUB_04_CIRCUITS_EXAMS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_EXAMS_FINALS', 'Finals', 'drive', 'https://drive.google.com/drive/folders/1_Wi30o3KZCbhuc2O_8oRQQSSmSNq5yCf', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_EXAMS'), 57, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [58/75] SUB_04_CIRCUITS_EXAMS_MIDTERMS (chip) -> parent: SUB_04_CIRCUITS_EXAMS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_EXAMS_MIDTERMS', 'Midterms', 'drive', 'https://drive.google.com/drive/folders/1tiLDfAyAUPVnszkxVw7B_rFKI08E1Mlz', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_EXAMS'), 58, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [59/75] SUB_04_CIRCUITS_REV_BOOK (item) -> parent: SUB_04_CIRCUITS_REVISION
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_REV_BOOK', 'كتاب المرجع الشامل للدوائر ( Electrical Circuit.pdf )', 'drive', 'https://drive.google.com/drive/folders/16IIH4amu633mV6lHNLNFiixv8TrGPfLu', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_REVISION'), 59, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [60/75] SUB_04_CIRCUITS_REV_LAPLACE (item) -> parent: SUB_04_CIRCUITS_REVISION
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_REV_LAPLACE', 'مسائل وتطبيقات تحويلات لابلاس (10 صفحات)', 'drive', 'https://drive.google.com/drive/folders/16IIH4amu633mV6lHNLNFiixv8TrGPfLu', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_REVISION'), 60, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [61/75] SUB_04_CIRCUITS_REV_NOTEBOOK (item) -> parent: SUB_04_CIRCUITS_REVISION
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_REV_NOTEBOOK', 'كشكول مسائل وتطبيقات التصميم المهمة (30 صفحة)', 'drive', 'https://drive.google.com/drive/folders/16IIH4amu633mV6lHNLNFiixv8TrGPfLu', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_REVISION'), 61, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [62/75] SUB_04_CIRCUITS_SHEETS_1_4 (item) -> parent: SUB_04_CIRCUITS_SHEETS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_SHEETS_1_4', 'شيتات 1 إلى 4 كاملة بنماذج الحل', 'drive', 'https://drive.google.com/drive/folders/1l74TmM8vav-BsMeFmG-G-gm7eUJpRvVy', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_SHEETS'), 62, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [63/75] SUB_04_CIRCUITS_YT_GUIDE_LINK (item) -> parent: SUB_04_CIRCUITS_YT_GUIDE
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_circuits, 'SUB_04_CIRCUITS_YT_GUIDE_LINK', 'دليل محاضرات الفيديو على درايف', 'drive', 'https://drive.google.com/drive/folders/1dRORKjuodtVupbHBbJWyjTJ7gODwW8el', (select id from public.resources where resource_key = 'SUB_04_CIRCUITS_YT_GUIDE'), 63, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [64/75] SUB_05_MATH5_FINAL_SOLVED (item) -> parent: SUB_05_MATH5_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_math, 'SUB_05_MATH5_FINAL_SOLVED', 'حل امتحان الفاينل السابق', 'drive', 'https://drive.google.com/drive/folders/12Pq4iel8ZXYSNp_5lTGY9YOoKPx-QMM6', (select id from public.resources where resource_key = 'SUB_05_MATH5_MAIN'), 64, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [65/75] SUB_05_MATH5_IMPORTANT_EXAMS (item) -> parent: SUB_05_MATH5_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_math, 'SUB_05_MATH5_IMPORTANT_EXAMS', 'حلول باقي أسئلة الامتحانات المهمة', 'drive', 'https://drive.google.com/drive/folders/12Pq4iel8ZXYSNp_5lTGY9YOoKPx-QMM6', (select id from public.resources where resource_key = 'SUB_05_MATH5_MAIN'), 65, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [66/75] SUB_05_MATH5_NOTEBOOK_ALL (item) -> parent: SUB_05_MATH5_MAIN
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_math, 'SUB_05_MATH5_NOTEBOOK_ALL', 'المذكرة الشاملة للمنهج كامل', 'drive', 'https://drive.google.com/drive/folders/12Pq4iel8ZXYSNp_5lTGY9YOoKPx-QMM6', (select id from public.resources where resource_key = 'SUB_05_MATH5_MAIN'), 66, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [67/75] SUB_06_HUMANITIES_BOOK_QUESTIONS (item) -> parent: SUB_06_HUMANITIES_SUMMARIES
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_BOOK_QUESTIONS', 'حل باب الأسئلة في الكتاب ( PDF )', 'drive', 'https://drive.google.com/drive/folders/1ibtJaw3ysgbKqMvH9fDC6PxSIEZLPlSF', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_SUMMARIES'), 67, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [68/75] SUB_06_HUMANITIES_PRES_TOPICS_1_4 (item) -> parent: SUB_06_HUMANITIES_PRESENTATIONS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_PRES_TOPICS_1_4', '1- المناخ • 2- الهجرة • 3- الأعمال التجارية • 4- الفقر', 'drive', 'https://drive.google.com/drive/folders/1-6L4lJpB2-s4Sde2RhIPjnZCE59uAfiG', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_PRESENTATIONS'), 68, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [69/75] SUB_06_HUMANITIES_PRES_TOPICS_5_7 (item) -> parent: SUB_06_HUMANITIES_PRESENTATIONS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_PRES_TOPICS_5_7', '5- حرية الرأي والتعبير • 6- المرأة • 7- العنصرية', 'drive', 'https://drive.google.com/drive/folders/1-6L4lJpB2-s4Sde2RhIPjnZCE59uAfiG', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_PRESENTATIONS'), 69, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [70/75] SUB_06_HUMANITIES_PRES_TOPICS_8_9 (item) -> parent: SUB_06_HUMANITIES_PRESENTATIONS
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_PRES_TOPICS_8_9', '8- أطفال الشوارع • 9- كبار السن', 'drive', 'https://drive.google.com/drive/folders/1-6L4lJpB2-s4Sde2RhIPjnZCE59uAfiG', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_PRESENTATIONS'), 70, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [71/75] SUB_06_HUMANITIES_QB_PRESENTATION_DISCUSSIONS (item) -> parent: SUB_06_HUMANITIES_QUESTION_BANK
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_QB_PRESENTATION_DISCUSSIONS', 'أسئلة البريزنتيشن ومناقشات المحاضرات ( PDF )', 'drive', 'https://drive.google.com/drive/folders/1ONn0eTxbqQI-qSR9qO0crfua2HadVdfK', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_QUESTION_BANK'), 71, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [72/75] SUB_06_HUMANITIES_QB_QUESTIONS_ONLY (item) -> parent: SUB_06_HUMANITIES_QUESTION_BANK
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_QB_QUESTIONS_ONLY', 'حق إنسان (أسئلة فقط) ( PDF )', 'drive', 'https://drive.google.com/drive/folders/1ONn0eTxbqQI-qSR9qO0crfua2HadVdfK', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_QUESTION_BANK'), 72, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [73/75] SUB_06_HUMANITIES_QB_WITH_ANSWERS (item) -> parent: SUB_06_HUMANITIES_QUESTION_BANK
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_QB_WITH_ANSWERS', 'حق إنسان أسئلة مع الإجابات ( PDF )', 'drive', 'https://drive.google.com/drive/folders/1ONn0eTxbqQI-qSR9qO0crfua2HadVdfK', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_QUESTION_BANK'), 73, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [74/75] SUB_06_HUMANITIES_SUMMARY_ELFALAH (item) -> parent: SUB_06_HUMANITIES_SUMMARIES
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_SUMMARY_ELFALAH', 'ملخص إنسانيات إعداد م/ أحمد خالد الفلاح', 'drive', 'https://drive.google.com/drive/folders/1ibtJaw3ysgbKqMvH9fDC6PxSIEZLPlSF', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_SUMMARIES'), 74, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  -- [75/75] SUB_06_HUMANITIES_UN_SUMMARY (item) -> parent: SUB_06_HUMANITIES_SUMMARIES
  insert into public.resources (course_id, resource_key, title, resource_type, url, parent_resource_id, sort_order, is_active)
  values (c_humanities, 'SUB_06_HUMANITIES_UN_SUMMARY', 'ملخص منظومة الأمم المتحدة ( PDF )', 'drive', 'https://drive.google.com/drive/folders/1ibtJaw3ysgbKqMvH9fDC6PxSIEZLPlSF', (select id from public.resources where resource_key = 'SUB_06_HUMANITIES_SUMMARIES'), 75, true)
  on conflict (resource_key) do update set
    course_id = excluded.course_id,
    title = excluded.title,
    resource_type = excluded.resource_type,
    url = excluded.url,
    parent_resource_id = excluded.parent_resource_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

end $$;

commit;