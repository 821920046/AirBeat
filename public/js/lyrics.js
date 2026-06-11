export function parseLRC(text) {
  const lines = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!times.length || !words) continue;
    for (const m of times) lines.push({ time: +m[1] * 60 + +m[2], text: words });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function currentLine(lines, t) {
  let i = -1;
  while (i + 1 < lines.length && lines[i + 1].time <= t) i++;
  return i;
}
