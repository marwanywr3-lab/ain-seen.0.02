import type { ReactNode } from "react";
import { categories } from "./catalog";
export function CategoryPicker({
  value,
  onChange,
  disabled = false,
  children,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="category-picker panel" aria-label="اختيار الفئات">
      <div className="toolbar">
        <div>
          <h2>اختاروا ساحة التحدي</h2>
          <p>٦ فئات من أصل ٣٠ · ١٨ سؤالًا · ٢٠٠ / ٤٠٠ / ٦٠٠</p>
        </div>
        <b role="status">{value.length.toLocaleString("ar-SA")} / ٦</b>
        <button
          disabled={disabled}
          onClick={() => {
            const shuffled = categories.map((c) => c.id);
            for (let i = shuffled.length - 1; i > 0; i--) {
              let n;
              const limit = Math.floor(0x100000000 / (i + 1)) * (i + 1);
              do {
                n = crypto.getRandomValues(new Uint32Array(1))[0]!;
              } while (n >= limit);
              const j = n % (i + 1);
              [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
            }
            onChange(shuffled.slice(0, 6));
          }}
        >
          قرعة ٦ فئات
        </button>
        <button
          disabled={disabled || !value.length}
          onClick={() => onChange([])}
        >
          مسح الاختيار
        </button>
      </div>
      <div className="category-choices">
        {categories.map((c) => {
          const checked = value.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              className={`category-choice ${checked ? "chosen" : ""}`}
              aria-pressed={checked}
              disabled={disabled || (!checked && value.length === 6)}
              onClick={() =>
                onChange(
                  checked
                    ? value.filter((id) => id !== c.id)
                    : [...value, c.id],
                )
              }
              title="٣ أسئلة في المباراة: ٢٠٠ و٤٠٠ و٦٠٠"
            >
              <img
                src={c.icon}
                alt=""
                loading="lazy"
                width="100"
                height="100"
              />
              <span>{c.name.split(" (")[0]}</span>
              <b aria-hidden="true">{checked ? "✓" : "+"}</b>
            </button>
          );
        })}
      </div>
      {children && <div className="category-confirm">{children}</div>}
    </section>
  );
}
