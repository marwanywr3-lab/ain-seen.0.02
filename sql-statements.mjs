// Split migrations without breaking semicolons inside quoted question text.
export function sqlStatements(sql) {
  const result = [];
  let current = "",
    quote = "",
    comment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i],
      next = sql[i + 1];
    if (comment) {
      if (ch === "\n") comment = false;
      else continue;
    }
    if (!quote && ch === "-" && next === "-") {
      comment = true;
      i++;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (next === quote) {
          current += next;
          i++;
        } else quote = "";
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === ";") {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (quote) throw Error("Unterminated SQL literal");
  if (current.trim()) result.push(current.trim());
  return result;
}
