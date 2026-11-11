import { categories } from "./catalog";
import { useEffect, useState } from "react";
import { api } from "./client";
import { createGame, parseQuestions, type Question } from "./engine";
interface Bank {
  questions: Question[];
  disabled: number[];
  revision: number;
  canEdit?: boolean;
}
const blank: Question = {
  id: 0,
  category: categories[0]!.name,
  categoryId: categories[0]!.id,
  points: 200,
  difficulty: "سهل",
  question: "",
  options: ["", "", "", ""],
  answer: "",
  hint: "",
};
export function Admin({ base }: { base: string }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [points, setPoints] = useState("");
  const [edit, setEdit] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      if (base)
        setBank(
          await api<Bank>(base, "/bank", {
            headers: import.meta.env.DEV
              ? { Authorization: "Bearer local-test-only" }
              : {},
          }),
        );
      else {
        const response = await fetch(
          new URL("./questions.json", document.baseURI),
        );
        if (!response.ok) throw Error("تعذر تحميل الأسئلة");
        setBank({
          questions: parseQuestions(await response.json()),
          disabled: [],
          revision: 0,
        });
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [base]);
  const save = async (next: Bank) => {
    setSaving(true);
    setError("");
    try {
      parseQuestions(next.questions);
      const res = await api<{ revision: number }>(base, "/bank", {
        method: "PUT",
        credentials: "include",
        headers: import.meta.env.DEV
          ? { Authorization: "Bearer local-test-only" }
          : {},

        body: JSON.stringify(next),
      });
      setBank({ ...next, revision: res.revision });
      setEdit(null);
      setNotice("حُفظت التغييرات. المباريات الجارية تحتفظ بأسئلتها.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const exportBank = () => {
    if (!bank) return;
    const blob = new Blob([JSON.stringify(bank, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ain-seen-bank-r${bank.revision}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importBank = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const questions = parseQuestions(
        Array.isArray(data)
          ? data
          : (data.questions ??
              data.categories?.flatMap(
                (c: { questions: unknown[] }) => c.questions,
              )),
      );
      const disabled = Array.isArray(data.disabled) ? data.disabled : [];
      if (!bank) return;
      if (
        confirm(
          `استيراد ${questions.length} سؤالًا بدل المجموعة الحالية؟ نزّل نسخة احتياطية أولًا إذا احتجتها.`,
        )
      )
        await save({ questions, disabled, revision: bank.revision });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  let capacity = "";
  if (bank)
    try {
      createGame(
        bank.questions.filter((q) => !bank.disabled.includes(q.id)),
        ["أ", "ب"],
        1,
      );
    } catch (e) {
      capacity = (e as Error).message;
    }
  return (
    <main>
      <section className="panel">
        <span className="pill">مفتوحة للجميع</span>
        <h1>بوابة الأسئلة</h1>
        {capacity && (
          <p className="error" role="alert">
            تنبيه توفر الأسئلة: {capacity}
          </p>
        )}
        <p>تصفح الأسئلة والبحث والتصدير متاح للجميع. التعديل لمسؤول الأسئلة.</p>
        {!base && (
          <p className="note">
            يمكنك تصفح الأسئلة وتصديرها الآن. حفظ التعديلات يتطلب اتصال خادم
            اللعبة.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {!bank ? (
          <>
            <p>الأسئلة متاحة للجميع دون تسجيل دخول.</p>
            <button onClick={() => void load()}>تحديث</button>
          </>
        ) : (
          <>
            <div className="toolbar">
              <b>
                {bank.questions.length} سؤال · الإصدار {bank.revision}
              </b>
              <button
                disabled={!bank.canEdit}
                onClick={() =>
                  setEdit({
                    ...blank,
                    id: Math.max(...bank.questions.map((q) => q.id), 0) + 1,
                  })
                }
              >
                إضافة سؤال
              </button>
              <button onClick={exportBank}>تصدير نسخة احتياطية</button>
              <button onClick={() => void load()}>إعادة التحميل</button>
              <label className="upload">
                استيراد JSON
                <input
                  type="file"
                  accept=".json"
                  disabled={saving || !base || !bank?.canEdit}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importBank(f);
                  }}
                />
              </label>
            </div>
            <div className="filters">
              <input
                aria-label="بحث في الأسئلة"
                placeholder="ابحث عن سؤال أو معلومة…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="الفئة"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">كل الفئات</option>
                {[...new Set(bank.questions.map((q) => q.category))].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
              <select
                aria-label="النقاط"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              >
                <option value="">كل القيم</option>
                {[200, 400, 600].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            {edit && (
              <form
                className="editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    parseQuestions([edit]);
                    void save({
                      ...bank,
                      questions: bank.questions.some((q) => q.id === edit.id)
                        ? bank.questions.map((q) =>
                            q.id === edit.id ? edit : q,
                          )
                        : [...bank.questions, edit],
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <h2>معاينة وتحرير السؤال #{edit.id}</h2>
                <label>
                  الفئة
                  <select
                    value={edit.categoryId}
                    onChange={(e) => {
                      const c = categories.find(
                        (c) => c.id === e.target.value,
                      )!;
                      setEdit({ ...edit, categoryId: c.id, category: c.name });
                    }}
                  >
                    {categories.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  النقاط
                  <select
                    value={edit.points}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        points: Number(e.target.value) as 200 | 400 | 600,
                      })
                    }
                  >
                    {[200, 400, 600].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  الصعوبة
                  <input
                    required
                    value={edit.difficulty}
                    onChange={(e) =>
                      setEdit({ ...edit, difficulty: e.target.value })
                    }
                  />
                </label>
                <label>
                  نص السؤال
                  <textarea
                    required
                    value={edit.question}
                    onChange={(e) =>
                      setEdit({ ...edit, question: e.target.value })
                    }
                  />
                </label>
                {edit.options.map((v, i) => (
                  <label key={i}>
                    الخيار {i + 1}
                    <input
                      required
                      value={v}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          options: edit.options.map((o, n) =>
                            n === i ? e.target.value : o,
                          ),
                          answer:
                            edit.answer === v ? e.target.value : edit.answer,
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  الإجابة الصحيحة
                  <select
                    required
                    value={edit.answer}
                    onChange={(e) =>
                      setEdit({ ...edit, answer: e.target.value })
                    }
                  >
                    <option value="">اختر الإجابة</option>
                    {edit.options.filter(Boolean).map((v, i) => (
                      <option key={i}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  التلميح
                  <textarea
                    required
                    value={edit.hint}
                    onChange={(e) => setEdit({ ...edit, hint: e.target.value })}
                  />
                </label>
                <button
                  className="primary"
                  disabled={saving || !base || !bank?.canEdit}
                >
                  حفظ السؤال
                </button>
                <button type="button" onClick={() => setEdit(null)}>
                  إلغاء
                </button>
              </form>
            )}
            <div className="question-list">
              {bank.questions
                .filter(
                  (q) =>
                    (!category || q.category === category) &&
                    (!points || q.points === Number(points)) &&
                    `${q.question} ${q.hint}`.includes(query),
                )
                .map((q) => (
                  <article key={q.id} className="bank-row">
                    <span className="pill">
                      #{q.id} · {q.category} · {q.points}
                    </span>
                    <h3>{q.question}</h3>
                    <p>{q.answer}</p>
                    <button
                      disabled={!bank.canEdit}
                      onClick={() => setEdit(structuredClone(q))}
                    >
                      تعديل ومعاينة
                    </button>
                    <button
                      disabled={saving || !base || !bank?.canEdit}
                      onClick={() =>
                        void save({
                          ...bank,
                          disabled: bank.disabled.includes(q.id)
                            ? bank.disabled.filter((id) => id !== q.id)
                            : [...bank.disabled, q.id],
                        })
                      }
                    >
                      {bank.disabled.includes(q.id) ? "إعادة التفعيل" : "تعطيل"}
                    </button>
                  </article>
                ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
