#!/usr/bin/env node
// Build the Hotjar findings report as a Word (.docx) file from a JSON spec.
//
// Usage: node build_report.js <spec.json> <out.docx>
// Image paths in the spec are resolved relative to the spec file.
// Inline **bold** is supported in any text field. See report-template.md for
// the spec shape.
const fs = require("fs");
const path = require("path");
const {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel,
  ImageRun, LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, WidthType,
} = require("docx");

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error("usage: node build_report.js <spec.json> <out.docx>");
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const baseDir = path.dirname(path.resolve(specPath));

// A4 with 1" margins -> 9026 DXA of usable width.
const CONTENT_DXA = 9026;
const MAX_IMG_PX = 600; // ~6.25" at 96 dpi
const ACCENT = "5B4FE9";
const MUTED = "666666";

function runs(text, base = {}) {
  // Split "**bold**" segments into separate runs.
  return String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**")
      ? new TextRun({ ...base, text: part.slice(2, -2), bold: true })
      : new TextRun({ ...base, text: part }));
}

function para(text, opts = {}) {
  const { run = {}, ...rest } = opts;
  return new Paragraph({ spacing: { after: 120 }, ...rest, children: runs(text, run) });
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  // PNG IHDR: width at byte 16, height at byte 20 (big-endian).
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error(`${file} is not a PNG`);
  return { buf, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function figure(img, caption) {
  const file = path.resolve(baseDir, img);
  const { buf, w, h } = pngSize(file);
  const scale = Math.min(1, MAX_IMG_PX / w);
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      keepNext: !!caption, // keep the image on the same page as its caption
      children: [new ImageRun({
        type: "png", data: buf,
        transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
        altText: { title: path.basename(file), description: caption || "", name: path.basename(file) },
      })],
    }),
  ];
  if (caption) {
    out.push(para(caption, {
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      run: { italics: true, color: MUTED, size: 18 },
    }));
  }
  return out;
}

function link(url, label) {
  return new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text: label || url, style: "Hyperlink" })],
  });
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "D0D0D8" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((wd) => Math.round((wd / total) * CONTENT_DXA));
  cols[cols.length - 1] += CONTENT_DXA - cols.reduce((a, b) => a + b, 0);
  const mkRow = (cells, header) => new TableRow({
    tableHeader: header,
    children: cells.map((c, i) => new TableCell({
      borders,
      width: { size: cols[i], type: WidthType.DXA },
      shading: header ? { fill: "EEEDFD", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: runs(c, { size: 18, bold: header || undefined }) })],
    })),
  });
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: cols,
    rows: [mkRow(headers, true), ...rows.map((r) => mkRow(r, false))],
  });
}

function bullets(items) {
  return items.map((t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: runs(t) }));
}

const children = [];

// Title + metadata
children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(spec.title)] }));
for (const { label, value } of spec.meta || []) {
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: `${label}: `, bold: true }), ...runs(value)],
  }));
}
if (spec.assumption) {
  children.push(para(spec.assumption, { spacing: { before: 120, after: 200 }, run: { italics: true, color: MUTED } }));
}

// Key finding: highlighted callout, hero screenshot, summary table
const kf = spec.keyFinding;
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Key Finding")] }));
children.push(new Paragraph({
  spacing: { before: 120, after: 160 },
  shading: { fill: "F1F0FE", type: ShadingType.CLEAR, color: "auto" },
  border: { left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 8 } },
  indent: { left: 160, right: 160 },
  children: runs(kf.headline, { size: 26 }),
}));
if (kf.confidence) {
  children.push(new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text: "Confidence: ", bold: true }), ...runs(kf.confidence)],
  }));
}
for (const p of kf.body || []) children.push(para(p));
if (kf.image) children.push(...figure(kf.image, kf.imageCaption));
if (kf.table) {
  children.push(table(kf.table.headers, kf.table.rows, kf.table.widths || kf.table.headers.map(() => 1)));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
}

// Evidence
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Evidence")] }));
if (spec.evidenceIntro) children.push(para(spec.evidenceIntro, { run: { color: MUTED } }));
for (const ev of spec.evidence || []) {
  // keepNext on the heading and link line so neither is stranded at a page
  // bottom while its screenshot starts the next page.
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(ev.title)] }));
  const linkLine = [link(ev.link, ev.linkLabel || "Open recording in Hotjar")];
  if (ev.jumpTo) linkLine.push(new TextRun({ text: `  ·  Jump to ${ev.jumpTo}`, color: MUTED }));
  children.push(new Paragraph({ spacing: { after: 120 }, keepNext: !!ev.image, children: linkLine }));
  if (ev.image) children.push(...figure(ev.image, ev.imageCaption));
  for (const p of [].concat(ev.body || [])) children.push(para(p));
  if (ev.bullets) children.push(...bullets(ev.bullets));
}

// Next steps + notes
if (spec.nextSteps?.length) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Next Steps")] }));
  children.push(...bullets(spec.nextSteps));
}
if (spec.notes?.length) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Notes")] }));
  children.push(...bullets(spec.notes));
}

const doc = new Document({
  creator: spec.author || "Hotjar Pattern Finder",
  title: spec.title,
  styles: {
    default: { document: { run: { font: "Calibri", size: 21 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", next: "Normal",
        run: { size: 40, bold: true, color: "1F1F3A" }, paragraph: { spacing: { after: 200 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, color: ACCENT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: "1F1F3A" }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } } }],
    }],
  },
  sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
});
