// Offsets in API and storage use Unicode code points, not UTF-16 code units.
export function editMentions(before, after, mentions) {
  const a = Array.from(before), b = Array.from(after);
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const oldEnd = a.length - end, delta = b.length - a.length;
  return mentions.flatMap((mention) => {
    if (mention.end === start && delta > 0 && /[a-zA-Z0-9_]/.test(b[start] || '')) return [];
    return mention.end <= start ? [mention] : mention.start >= oldEnd ? [{ ...mention, start: mention.start + delta, end: mention.end + delta }] : [];
  });
}

export function trimMentionInput(text, mentions) {
  const offset = Array.from(text).length - Array.from(text.trimStart()).length;
  return { text: text.trim(), mentions: mentions.map((item) => ({ user_id: item.user_id, start: item.start - offset, end: item.end - offset })) };
}
