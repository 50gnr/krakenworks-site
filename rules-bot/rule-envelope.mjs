export function parseRuleEnvelope(text) {
  if (typeof text !== "string") return null;
  const provenanceMarker = "\n\nPackage provenance:";
  const provenanceIndex = text.indexOf(provenanceMarker);
  if (provenanceIndex < 0) return null;

  const readingsText = text.slice(0, provenanceIndex).trim();
  const provenance = text.slice(provenanceIndex + 2).trim();
  const provenanceLines = provenance.split("\n").map(line => line.trim()).filter(Boolean);
  if (
    provenanceLines.length !== 3 ||
    !/^Package provenance:\s+\S/.test(provenanceLines[0]) ||
    !/^License:\s+\S/.test(provenanceLines[1]) ||
    !/^Attribution:\s+\S/.test(provenanceLines[2])
  ) return null;

  const entries = [];
  const entryPattern = /(?:^|\n\n)([^\n]+)\n([\s\S]*?)\nSource: ([^\n]+)(?=\n\n|$)/g;
  let consumed = "";
  for (const match of readingsText.matchAll(entryPattern)) {
    const title = match[1].trim();
    let body = match[2].trim();
    const leadHeading = body.match(/^#{1,4}\s+([^\n]+)\n+/);
    if (leadHeading?.[1].trim().toLocaleLowerCase() === title.toLocaleLowerCase()) {
      body = body.slice(leadHeading[0].length).trim();
    }
    const entry = {
      title,
      body,
      source: match[3].trim(),
    };
    if (!entry.title || !entry.body || !entry.source) return null;
    entries.push(entry);
    consumed += match[0];
  }
  if (!entries.length || consumed.replace(/^\n+/, "").trim() !== readingsText) return null;
  return {entries, provenance};
}
