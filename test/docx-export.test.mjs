import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { buildManuscriptDocx } from "../docx-export.mjs";

const png = Buffer.alloc(24);
png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
png.writeUInt32BE(1, 16);
png.writeUInt32BE(1, 20);

test("DOCX contains the manuscript, 6x9 page size, table, and image relationship", async () => {
  const buffer = await buildManuscriptDocx({
    platform: "KDP",
    packageTitle: "RV Winterization Record Book",
    deliverableType: "Paperback logbook",
    draftMarkdown: "## Owner records\n\n| Date | Work |\n| --- | --- |\n| | |\n\n![Interior illustration 1](interior-art-01.png)"
  }, { interiorArt: [{ filename: "interior-art-01.png", alt: "Test image", buffer: png }] });
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file("word/document.xml"));
  assert.ok(zip.file("word/styles.xml"));
  assert.ok(zip.file("word/media/interior-art-01.png"));
  const xml = await zip.file("word/document.xml").async("string");
  assert.ok(xml.includes('w:w="8640" w:h="12960"'));
  assert.ok(xml.includes("Owner records"));
  assert.ok(xml.includes('r:embed="rIdImage1"'));
});

test("DOCX includes repair forms and coloring-book supplements", async () => {
  const buffer = await buildManuscriptDocx({
    platform: "KDP",
    packageTitle: "Adult Coloring Book",
    deliverableType: "KDP paperback coloring book",
    draftMarkdown: "## Coloring pages"
  }, { recordPagesAdded: 2 });
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml").async("string");
  assert.ok(xml.includes("Color Test Page"));
  assert.ok(xml.includes("Seasonal Storage Record"));
});
