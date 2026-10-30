// Cylinder marks ("1S1=0; 1S2=100" or "S2=50%"): positions where limit switches and roller valves are actuated.
export function parseMarks(s) {
  return String(s || '').split(/[;,\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(.+?)\s*[=@:]\s*(-?\d+(?:[.,]\d+)?)\s*(%?)$/.exec(x);
    return m ? { name: m[1].trim(), at: parseFloat(m[2].replace(',', '.')), pct: !!m[3] } : null;
  }).filter(Boolean);
}
