# 🏛️ دليل وسجل المعرفات الدائم لماتريال الفرقة الثانية (Resource Registry)
> **القسم:** هندسة الإلكترونيات والاتصالات الكهربية — الفرقة الثانية — الترم الأول  
> **الإصدار المعياري:** 1.0.0 (نظام المعرفات الثابتة لتتبع النقرات وإحصائيات الطلاب)  
> **تاريخ الإنشاء:** 2026-11-05  

---

## 🎯 1. الهدف من السجل وهيكلية المعرفات (Architecture & Objectives)
تم تصميم هذا السجل وتوثيقه لمنح كل مادة، ومجلد رئيسي، ومجلد فرعي، وشيت، وكويز، وامتحان، ومحاضرة، ورابط يوتيوب **معرّفاً فريداً ثابتاً ودائماً (`Resource ID`)**.

### فوائد النظام:
1. **تتبع نقرات وإحصائيات الطلاب (Student Click Telemetry):** إمكانية قياس مدى إقبال الطلاب على كل شيت أو كويز أو مرجع بالـ ID بدون الاعتماد على نصوص قد تتغير صياغتها.
2. **الربط مع قواعد البيانات والتحليلات (Firebase / Umami / GA4):** إرسال أحداث فورية عند فتح أي مجلد مع تحديد المادة والقسم تلقائياً.
3. **ثبات الروابط (Deterministic Resolution):** سهولة استرجاع أي رابط درايف عبر المعرف دون فحص كود الواجهة.

### معيار تسمية المعرفات (ID Naming Convention):
- **الجذر العام:** `ROOT_DRIVE_TERM1`
- **المواد الرئيسية:** `SUB_01_EMF`, `SUB_02_LOGIC`, `SUB_03_OOP_JAVA`, `SUB_04_CIRCUITS`, `SUB_05_MATH5`, `SUB_06_HUMANITIES`
- **المجلدات المباشرة:** `[SUB_ID]_MAIN`
- **الفولدرات الفرعية:** `[SUB_ID]_[MAT|SHEETS|EXAMS|REVISION|YT]`
- **العناصر والشرائح (Chips):** `[SUB_ID]_[PARENT]_[NAME]`
- **قوائم التشغيل (Playlists):** `[SUB_ID]_[PARENT]_PLAYLIST_[NAME]`

---

## 📊 2. إحصائيات عامة عن الموارد المسجلة
- **إجمالي الكيانات المفهرسة:** 75 مورداً ومجلداً ومحاضرة
- **عدد المواد الأساسية:** 6 مواد دراسية
- **رابط الترم الشامل:** [مجلد الترم الأول بالكامل — الفرقة الثانية هندسة إلكترونيات](https://drive.google.com/drive/folders/1bzeSTyWumsJ3hBC5F2vBu9RWhMymVOnP) (Drive ID: `1bzeSTyWumsJ3hBC5F2vBu9RWhMymVOnP`)

---

## 📑 3. الجداول التفصيلية للمواد والكيانات المفهرسة

### 📘 1. المجالات الكهرومغناطيسية — EMF
- **المحاضر / الدكتور:** د. رجب السحيمى
- **معرف المادة:** `SUB_01_EMF`
- **رابط درايف المادة:** [فتح مجلد المادة](https://drive.google.com/drive/folders/1ObIiM7q7myJtpnN-LddSD06MQeb66fkB) (Drive ID: `1ObIiM7q7myJtpnN-LddSD06MQeb66fkB`)

| المعرف الدائم (Resource ID) | النوع | العنوان / الوصف | الرابط الخارجي | معرّف درايف (Drive ID) |
| :--- | :---: | :--- | :--- | :--- |
| `SUB_01_EMF` | `subject` | **المجالات الكهرومغناطيسية** | [رابط درايف](https://drive.google.com/drive/folders/1ObIiM7q7myJtpnN-LddSD06MQeb66fkB) | `1ObIiM7q7myJtpnN-LddSD06MQeb66fkB` |
| `SUB_01_EMF_MAIN` | `card` | مجالات (د.رجب السحيمى) | [رابط المجلد](https://drive.google.com/drive/folders/16wbcWi28jzkrDxE0VkuKWQxY54ntcHpp) | `16wbcWi28jzkrDxE0VkuKWQxY54ntcHpp` |
| `SUB_01_EMF_MAT` | `subfolder` | 📂 **material** — ملخص المحاضرات والسكاشن + أسئلة صح وغلط | [رابط الفولدر](https://drive.google.com/drive/folders/11uJnVqIpCF3Wy2VzAVCDoJ6vnZ9dacFW) | `11uJnVqIpCF3Wy2VzAVCDoJ6vnZ9dacFW` |
| `SUB_01_EMF_MAT_NOTEBOOK` | `item` | • كشكول المحاضرات والسكاشن بخط يد م/ أحمد الفلاح | — | — |
| `SUB_01_EMF_MAT_FORMULAS` | `item` | • ملخصات القوانين ونظم الإحداثيات | — | — |
| `SUB_01_EMF_MAT_EXAM_BANK` | `item` | • بنك أسئلة وتجميعات الامتحانات السابقة | — | — |
| `SUB_01_EMF_SHEETS` | `subfolder` | 📂 **sheets** — شيتات 1 إلى 5 كاملة بالحلول | [رابط الفولدر](https://drive.google.com/drive/folders/1mXY9NP1Sq3pKexiRKuO17ZIRJ8_qFqmO) | `1mXY9NP1Sq3pKexiRKuO17ZIRJ8_qFqmO` |
| `SUB_01_EMF_SHEETS_1_2_3` | `item` | • شيت 1، 2، 3 بحل م/ أحمد الفلاح | — | — |
| `SUB_01_EMF_SHEETS_4_5` | `item` | • شيت 4 و 5 بحل م/ أحمد الفلاح | — | — |
| `SUB_01_EMF_EXAMS` | `subfolder` | 📂 **Exams** — حلول الميدترم + كويز 1 و 2 | [رابط الفولدر](https://drive.google.com/drive/folders/18rInBwg3HI83y5wf_RTmvjb3Qtp9UrDk) | `18rInBwg3HI83y5wf_RTmvjb3Qtp9UrDk` |
| `SUB_01_EMF_EXAMS_MIDTERM` | `item` | • حل امتحان الميدترم | — | — |
| `SUB_01_EMF_EXAMS_QUIZZES` | `item` | • كويز 1 وكويز 2 لعام 2025-2026 بالحل | — | — |

---

### 📘 2. الدوائر المنطقية — LOGIC
- **المحاضر / الدكتور:** د. محمد عبد الرحمن
- **معرف المادة:** `SUB_02_LOGIC`
- **رابط درايف المادة:** [فتح مجلد المادة](https://drive.google.com/drive/folders/1A42n3hBNRAqkXXciBXN81FJXt9XaIe-n) (Drive ID: `1A42n3hBNRAqkXXciBXN81FJXt9XaIe-n`)

| المعرف الدائم (Resource ID) | النوع | العنوان / الوصف | الرابط الخارجي | معرّف درايف (Drive ID) |
| :--- | :---: | :--- | :--- | :--- |
| `SUB_02_LOGIC` | `subject` | **الدوائر المنطقية** | [رابط درايف](https://drive.google.com/drive/folders/1A42n3hBNRAqkXXciBXN81FJXt9XaIe-n) | `1A42n3hBNRAqkXXciBXN81FJXt9XaIe-n` |
| `SUB_02_LOGIC_MAIN` | `card` | Logic Circuit Design (د. محمد عبد الرحمن) | [رابط المجلد](https://drive.google.com/drive/folders/17l2TgNnU401gMaJbHr42JlQ4Ct_nUf_s) | `17l2TgNnU401gMaJbHr42JlQ4Ct_nUf_s` |
| `SUB_02_LOGIC_EXAMS` | `subfolder` | 📂 **Exams** — مجلد امتحانات الدوائر المنطقية (ميدترمات، فاينل، كويزات) | [رابط الفولدر](https://drive.google.com/drive/folders/1w329Ks7o8KRjkj9a-9eaRz8x60uqHE87) | `1w329Ks7o8KRjkj9a-9eaRz8x60uqHE87` |
| `SUB_02_LOGIC_EXAMS_MIDTERMS` | `chip` | 🏷️ **Midterms**: ميدترمات 2022 حتى 2026 كاملة بالحلول | [فتح](https://drive.google.com/drive/folders/1PbWJOLufGkGppWVXomKt8XYq9lLW9Qjh) | `1PbWJOLufGkGppWVXomKt8XYq9lLW9Qjh` |
| `SUB_02_LOGIC_EXAMS_FINALS` | `chip` | 🏷️ **Finals**: فاينل 2023-2024 و 2024-2025 بالحل | [فتح](https://drive.google.com/drive/folders/1BEPvTfDLsw4Rcu7YsvzFdDtTvPGJuSYy) | `1BEPvTfDLsw4Rcu7YsvzFdDtTvPGJuSYy` |
| `SUB_02_LOGIC_EXAMS_QUIZZES` | `chip` | 🏷️ **Quizzes**: كويز 1 وكويز 2 لعام 2025-2026 بالحل | [فتح](https://drive.google.com/drive/folders/19SgktUiKQjzX7RjyLgb0-io_hEY1voFf) | `19SgktUiKQjzX7RjyLgb0-io_hEY1voFf` |
| `SUB_02_LOGIC_REVISION` | `subfolder` | 📂 **Lectures & Revision** — محاضرات ومراجعات وتطبيقات الدوائر المنطقية | [رابط الفولدر](https://drive.google.com/drive/folders/1azBWzbV-ScH4nV4DDiA3DKWGptlfwGy6) | `1azBWzbV-ScH4nV4DDiA3DKWGptlfwGy6` |
| `SUB_02_LOGIC_REV_SECTIONS` | `item` | • مراجعة السكاشن الشاملة (19 صفحة) | — | — |
| `SUB_02_LOGIC_REV_LEC6` | `item` | • محاضرة 6 (Function Implementation MUX/Decoders) | — | — |
| `SUB_02_LOGIC_REV_COMBINATIONAL` | `item` | • مسائل Combinational Logic للمحاضرات 1-5 | — | — |
| `SUB_02_LOGIC_REV_FLIPFLOPS` | `item` | • ملخص مخططات وجداول الـ Flip-Flops | — | — |
| `SUB_02_LOGIC_SOLVED_QUESTIONS` | `subfolder` | 📂 **Solved Questions & Notes** — أسئلة امتحانات وتطبيقات دوائر منطقية هامة | [رابط الفولدر](https://drive.google.com/drive/folders/1JWLZ4A_ZH4jt143GzF7QSXRlHOlLAZR6) | `1JWLZ4A_ZH4jt143GzF7QSXRlHOlLAZR6` |
| `SUB_02_LOGIC_SOLVED_EXAMS` | `item` | • أسئلة امتحانات خاصة محلولة | — | — |
| `SUB_02_LOGIC_SOLVED_APPLICATIONS` | `item` | • تطبيقات ومسائل دوائر منطقية هامة | — | — |

---

### 📘 3. البرمجة كائنية التوجه — OOP_JAVA
- **المحاضر / الدكتور:** د. هالة الحديدي
- **معرف المادة:** `SUB_03_OOP_JAVA`
- **رابط درايف المادة:** [فتح مجلد المادة](https://drive.google.com/drive/folders/1Ct0U9Ia1zM9vhcfZDEkI_ZJCKvdEQ5iY) (Drive ID: `1Ct0U9Ia1zM9vhcfZDEkI_ZJCKvdEQ5iY`)

| المعرف الدائم (Resource ID) | النوع | العنوان / الوصف | الرابط الخارجي | معرّف درايف (Drive ID) |
| :--- | :---: | :--- | :--- | :--- |
| `SUB_03_OOP_JAVA` | `subject` | **البرمجة كائنية التوجه** | [رابط درايف](https://drive.google.com/drive/folders/1Ct0U9Ia1zM9vhcfZDEkI_ZJCKvdEQ5iY) | `1Ct0U9Ia1zM9vhcfZDEkI_ZJCKvdEQ5iY` |
| `SUB_03_OOP_JAVA_MAIN` | `card` | Oop java (د. هالة الحديدي) | [رابط المجلد](https://drive.google.com/drive/folders/18XdbYvfPOlFSEd6BXrlJ3Wau2x32VCtd) | `18XdbYvfPOlFSEd6BXrlJ3Wau2x32VCtd` |
| `SUB_03_OOP_JAVA_MAT` | `subfolder` | 📂 **material H.I.E** — الماتريال كاملة: محاضرات 1-6 + سكاشن + لابات + شيتات | [رابط الفولدر](https://drive.google.com/drive/folders/13bO7QHasyGPt26V1WB4fJf_3-gRRZL8b) | `13bO7QHasyGPt26V1WB4fJf_3-gRRZL8b` |
| `SUB_03_OOP_JAVA_MAT_LECTURE` | `chip` | 🏷️ **lecture**: المحاضرات من 1 إلى 6 كاملة (Review, Objects, Constructors, GUI...) | [فتح](https://drive.google.com/drive/folders/16_ugmx-nda6q-zw-EXY6dDuTuacJ0lTO) | `16_ugmx-nda6q-zw-EXY6dDuTuacJ0lTO` |
| `SUB_03_OOP_JAVA_MAT_SECTIONS` | `chip` | 🏷️ **sections**: سكاشن المادة الشاملة | [فتح](https://drive.google.com/drive/folders/1M1KiYf1V-prG4Xj_98uLV_cWxW5oh7ah) | `1M1KiYf1V-prG4Xj_98uLV_cWxW5oh7ah` |
| `SUB_03_OOP_JAVA_MAT_LABS` | `chip` | 🏷️ **labs**: لابات البرمجة العملية 3 و 4 | [فتح](https://drive.google.com/drive/folders/1-ffJzBP2Gs0_xXHW7xOkCyQzY3TVd7v0) | `1-ffJzBP2Gs0_xXHW7xOkCyQzY3TVd7v0` |
| `SUB_03_OOP_JAVA_MAT_SHEETS` | `chip` | 🏷️ **sheets&Assighments**: شيتات 1 إلى 4 بالحلول | [فتح](https://drive.google.com/drive/folders/1xnSk6agCcZ3nnJ0q-N8cH1necDFEt-LL) | `1xnSk6agCcZ3nnJ0q-N8cH1necDFEt-LL` |
| `SUB_03_OOP_JAVA_MAT_EXAMS` | `chip` | 🏷️ **exams**: ميدترم وكويزات المعهد بالحلول | [فتح](https://drive.google.com/drive/folders/1_I7m_6gy8trRPpjWO4b0Nig8hGdd-ZK1) | `1_I7m_6gy8trRPpjWO4b0Nig8hGdd-ZK1` |
| `SUB_03_OOP_JAVA_MAT_BOOK` | `chip` | 🏷️ **book**: كتاب المرجع للجافا | [فتح](https://drive.google.com/drive/folders/13mJgJcbwrVxVM06NNkByyMaTZDEw9uVt) | `13mJgJcbwrVxVM06NNkByyMaTZDEw9uVt` |
| `SUB_03_OOP_JAVA_OTHER_MAT` | `subfolder` | 📂 **other Material** — بنك الامتحانات: فاينل وميدترم وكويزات — معهد دمياط | [رابط الفولدر](https://drive.google.com/drive/folders/1KtZs0T-kmfao_7h9MXSNIVPAUZ7F3pWE) | `1KtZs0T-kmfao_7h9MXSNIVPAUZ7F3pWE` |
| `SUB_03_OOP_JAVA_OTHER_FINALS` | `chip` | 🏷️ **Final Exams**: أرشيف امتحانات الفاينل السابقة مع الحلول | [فتح](https://drive.google.com/drive/folders/11bdg5s8AF-6Lu5OeWf_psHLyM8mE1r5P) | `11bdg5s8AF-6Lu5OeWf_psHLyM8mE1r5P` |
| `SUB_03_OOP_JAVA_OTHER_MIDTERMS` | `chip` | 🏷️ **midterms**: نماذج إجابة امتحانات الميدترم | [فتح](https://drive.google.com/drive/folders/1fnchkZk2ju544e7aDpqZzvgY0iGNZZZb) | `1fnchkZk2ju544e7aDpqZzvgY0iGNZZZb` |
| `SUB_03_OOP_JAVA_OTHER_QUIZZES` | `chip` | 🏷️ **quizes**: كويزات 1 حتى 4 بنماذج الحل | [فتح](https://drive.google.com/drive/folders/1tOwNm4UHXRwMWokCzhkGMrIfiwXD0PV-) | `1tOwNm4UHXRwMWokCzhkGMrIfiwXD0PV-` |
| `SUB_03_OOP_JAVA_YT_MAT` | `subfolder` | 📂 **Youtube** — ماتريال كورس Java للبشمهندس محمد الدسوقي على اليوتيوب | [رابط الفولدر](https://drive.google.com/drive/folders/1uSTPgb9TuprJLaFqRtCxDIxK7BC1r5Op) | `1uSTPgb9TuprJLaFqRtCxDIxK7BC1r5Op` |
| `SUB_03_OOP_JAVA_YT_PLAYLIST_BASICS` | `playlist` | ▶️ ▶ جزء الأساسيات — مراجعة أساسيات Java قبل OOP | [مشاهدة على YouTube](https://youtube.com/playlist?list=PL1DUmTEdeA6K7rdxKiWJq6JIxTvHalY8f&si=z8nmHaUdaqSRIdve) | `PL1DUmTEdeA6K7rdxKiWJq6JIxTvHalY8f` |
| `SUB_03_OOP_JAVA_YT_PLAYLIST_OOP` | `playlist` | ▶️ ▶ جزء الـ OOP — شرح مفاهيم OOP بالتدريج | [مشاهدة على YouTube](https://youtube.com/playlist?list=PL1DUmTEdeA6Icttz-O9C3RPRF8R8Px5vk&si=-4a3rKLdl8YQXjPE) | `PL1DUmTEdeA6Icttz-O9C3RPRF8R8Px5vk` |

---

### 📘 4. تصميم الدوائر الكهربية — CIRCUITS
- **المحاضر / الدكتور:** د. رمضان عبد العال
- **معرف المادة:** `SUB_04_CIRCUITS`
- **رابط درايف المادة:** [فتح مجلد المادة](https://drive.google.com/drive/folders/10ZRjwWKBCa6XRPZrwcrTDIA3BtpYCJp4) (Drive ID: `10ZRjwWKBCa6XRPZrwcrTDIA3BtpYCJp4`)

| المعرف الدائم (Resource ID) | النوع | العنوان / الوصف | الرابط الخارجي | معرّف درايف (Drive ID) |
| :--- | :---: | :--- | :--- | :--- |
| `SUB_04_CIRCUITS` | `subject` | **تصميم الدوائر الكهربية** | [رابط درايف](https://drive.google.com/drive/folders/10ZRjwWKBCa6XRPZrwcrTDIA3BtpYCJp4) | `10ZRjwWKBCa6XRPZrwcrTDIA3BtpYCJp4` |
| `SUB_04_CIRCUITS_MAIN` | `card` | Electric Circle Design (د. رمضان عبد العال) | [رابط المجلد](https://drive.google.com/drive/folders/1s6QOcuNwfFiKIfHYpT2-llvKvNsEdSRz) | `1s6QOcuNwfFiKIfHYpT2-llvKvNsEdSRz` |
| `SUB_04_CIRCUITS_REVISION` | `subfolder` | 📂 **Lectures & Revision** — محاضرات ومذكرات تصميم الدوائر ومسائل لابلاس | [رابط الفولدر](https://drive.google.com/drive/folders/16IIH4amu633mV6lHNLNFiixv8TrGPfLu) | `16IIH4amu633mV6lHNLNFiixv8TrGPfLu` |
| `SUB_04_CIRCUITS_REV_BOOK` | `item` | • كتاب المرجع الشامل للدوائر ( Electrical Circuit.pdf ) | — | — |
| `SUB_04_CIRCUITS_REV_NOTEBOOK` | `item` | • كشكول مسائل وتطبيقات التصميم المهمة (30 صفحة) | — | — |
| `SUB_04_CIRCUITS_REV_LAPLACE` | `item` | • مسائل وتطبيقات تحويلات لابلاس (10 صفحات) | — | — |
| `SUB_04_CIRCUITS_SHEETS` | `subfolder` | 📂 **Sheets** — شيتات 1 إلى 4 كاملة بنماذج الحل | [رابط الفولدر](https://drive.google.com/drive/folders/1l74TmM8vav-BsMeFmG-G-gm7eUJpRvVy) | `1l74TmM8vav-BsMeFmG-G-gm7eUJpRvVy` |
| `SUB_04_CIRCUITS_SHEETS_1_4` | `item` | • شيتات 1 إلى 4 كاملة بنماذج الحل | — | — |
| `SUB_04_CIRCUITS_EXAMS` | `subfolder` | 📂 **Exams** — امتحانات الفاينل والميدترم السابقة لمادة الدوائر | [رابط الفولدر](https://drive.google.com/drive/folders/1LIXvVHZ5F0_QFWftcqRgaBaNtAsFXm23) | `1LIXvVHZ5F0_QFWftcqRgaBaNtAsFXm23` |
| `SUB_04_CIRCUITS_EXAMS_FINALS` | `chip` | 🏷️ **Finals**: أسئلة وحل فاينل 2024-2025 (14 صفحة) | [فتح](https://drive.google.com/drive/folders/1_Wi30o3KZCbhuc2O_8oRQQSSmSNq5yCf) | `1_Wi30o3KZCbhuc2O_8oRQQSSmSNq5yCf` |
| `SUB_04_CIRCUITS_EXAMS_MIDTERMS` | `chip` | 🏷️ **Midterms**: نموذج حل امتحان الميدترم | [فتح](https://drive.google.com/drive/folders/1tiLDfAyAUPVnszkxVw7B_rFKI08E1Mlz) | `1tiLDfAyAUPVnszkxVw7B_rFKI08E1Mlz` |
| `SUB_04_CIRCUITS_YT_GUIDE` | `subfolder` | 📂 **Youtube Guide** — دليل محاضرات الفيديو على درايف | [رابط الفولدر](https://drive.google.com/drive/folders/1dRORKjuodtVupbHBbJWyjTJ7gODwW8el) | `1dRORKjuodtVupbHBbJWyjTJ7gODwW8el` |
| `SUB_04_CIRCUITS_YT_GUIDE_LINK` | `item` | • دليل محاضرات الفيديو على درايف | — | — |

---

### 📘 5. الرياضيات الهندسية 5 — MATH5
- **المحاضر / الدكتور:** د. حموده أبو الدهب
- **معرف المادة:** `SUB_05_MATH5`
- **رابط درايف المادة:** [فتح مجلد المادة](https://drive.google.com/drive/folders/1q-5GZESVNaLVWnpL3jke22sMvtBkkOLy) (Drive ID: `1q-5GZESVNaLVWnpL3jke22sMvtBkkOLy`)

| المعرف الدائم (Resource ID) | النوع | العنوان / الوصف | الرابط الخارجي | معرّف درايف (Drive ID) |
| :--- | :---: | :--- | :--- | :--- |
| `SUB_05_MATH5` | `subject` | **الرياضيات الهندسية 5** | [رابط درايف](https://drive.google.com/drive/folders/1q-5GZESVNaLVWnpL3jke22sMvtBkkOLy) | `1q-5GZESVNaLVWnpL3jke22sMvtBkkOLy` |
| `SUB_05_MATH5_MAIN` | `card` | Math 5 (د. حموده ابو الدهب) | [رابط المجلد](https://drive.google.com/drive/folders/12Pq4iel8ZXYSNp_5lTGY9YOoKPx-QMM6) | `12Pq4iel8ZXYSNp_5lTGY9YOoKPx-QMM6` |
| `SUB_05_MATH5_NOTEBOOK_ALL` | `item` | • المذكرة الشاملة للمنهج كامل | — | — |
| `SUB_05_MATH5_FINAL_SOLVED` | `item` | • حل امتحان الفاينل السابق | — | — |
| `SUB_05_MATH5_IMPORTANT_EXAMS` | `item` | • حلول باقي أسئلة الامتحانات المهمة | — | — |

---

### 📘 6. حقوق الإنسان وإنسانيات — HUMANITIES
- **المحاضر / الدكتور:** د. محمد إسماعيل
- **معرف المادة:** `SUB_06_HUMANITIES`
- **رابط درايف المادة:** [فتح مجلد المادة](https://drive.google.com/drive/folders/1pNgXZpj_CrqV-EtfmDKtCy0hxF8Lb0bV) (Drive ID: `1pNgXZpj_CrqV-EtfmDKtCy0hxF8Lb0bV`)

| المعرف الدائم (Resource ID) | النوع | العنوان / الوصف | الرابط الخارجي | معرّف درايف (Drive ID) |
| :--- | :---: | :--- | :--- | :--- |
| `SUB_06_HUMANITIES` | `subject` | **حقوق الإنسان وإنسانيات** | [رابط درايف](https://drive.google.com/drive/folders/1pNgXZpj_CrqV-EtfmDKtCy0hxF8Lb0bV) | `1pNgXZpj_CrqV-EtfmDKtCy0hxF8Lb0bV` |
| `SUB_06_HUMANITIES_MAIN` | `card` | انسانيات (د.محمد اسماعيل) | [رابط المجلد](https://drive.google.com/drive/folders/1m-ycL4YUAeZVb4uKraSlHHEadHiHmp8o) | `1m-ycL4YUAeZVb4uKraSlHHEadHiHmp8o` |
| `SUB_06_HUMANITIES_SUMMARIES` | `subfolder` | 📂 **Lectures & Summaries** — حل باب الأسئلة بالكتاب + ملخص المادة ومنظومة الأمم المتحدة | [رابط الفولدر](https://drive.google.com/drive/folders/1ibtJaw3ysgbKqMvH9fDC6PxSIEZLPlSF) | `1ibtJaw3ysgbKqMvH9fDC6PxSIEZLPlSF` |
| `SUB_06_HUMANITIES_BOOK_QUESTIONS` | `item` | • حل باب الأسئلة في الكتاب ( PDF ) | — | — |
| `SUB_06_HUMANITIES_SUMMARY_ELFALAH` | `item` | • ملخص إنسانيات إعداد م/ أحمد خالد الفلاح | — | — |
| `SUB_06_HUMANITIES_UN_SUMMARY` | `item` | • ملخص منظومة الأمم المتحدة ( PDF ) | — | — |
| `SUB_06_HUMANITIES_QUESTION_BANK` | `subfolder` | 📂 **Questions & Question Bank** — بنك أسئلة حقوق الإنسان بالحلول + أسئلة البريزنتيشن | [رابط الفولدر](https://drive.google.com/drive/folders/1ONn0eTxbqQI-qSR9qO0crfua2HadVdfK) | `1ONn0eTxbqQI-qSR9qO0crfua2HadVdfK` |
| `SUB_06_HUMANITIES_QB_WITH_ANSWERS` | `item` | • حق إنسان أسئلة مع الإجابات ( PDF ) | — | — |
| `SUB_06_HUMANITIES_QB_QUESTIONS_ONLY` | `item` | • حق إنسان (أسئلة فقط) ( PDF ) | — | — |
| `SUB_06_HUMANITIES_QB_PRESENTATION_DISCUSSIONS` | `item` | • أسئلة البريزنتيشن ومناقشات المحاضرات ( PDF ) | — | — |
| `SUB_06_HUMANITIES_PRESENTATIONS` | `subfolder` | 📂 **presentation Human Rights** — عروض البريزنتيشن الـ 9 كاملة بصيغة PDF | [رابط الفولدر](https://drive.google.com/drive/folders/1-6L4lJpB2-s4Sde2RhIPjnZCE59uAfiG) | `1-6L4lJpB2-s4Sde2RhIPjnZCE59uAfiG` |
| `SUB_06_HUMANITIES_PRES_TOPICS_1_4` | `item` | • 1- المناخ • 2- الهجرة • 3- الأعمال التجارية • 4- الفقر | — | — |
| `SUB_06_HUMANITIES_PRES_TOPICS_5_7` | `item` | • 5- حرية الرأي والتعبير • 6- المرأة • 7- العنصرية | — | — |
| `SUB_06_HUMANITIES_PRES_TOPICS_8_9` | `item` | • 8- أطفال الشوارع • 9- كبار السن | — | — |

---

## 🛠️ 4. كود التتبع البرمجي المقترح (Client-Side Telemetry Snippet)
عند تفعيل التحليلات أو الربط مع Firebase / Google Analytics، يتم استخدام الكود التالي في صفحة الويب:

```javascript
// تتبع نقرات الطلاب عبر الـ Resource ID
document.addEventListener('click', function(event) {
  const el = event.target.closest('[data-resource-id]');
  if (el) {
    const resourceId = el.getAttribute('data-resource-id');
    const resourceType = el.getAttribute('data-resource-type') || 'unknown';
    
    // إرسال للـ Telemetry
    console.log('[Telemetry Hit]', {
      resourceId: resourceId,
      type: resourceType,
      timestamp: new Date().toISOString()
    });
    
    // مثال للربط مع Google Analytics 4:
    // gtag('event', 'select_resource', { resource_id: resourceId, resource_type: resourceType });
  }
});
```

---
🏛️ **تم التوثيق والاعتماد — مشروع توثيق ماتريال الفرقة الثانية هندسة إلكترونيات.**