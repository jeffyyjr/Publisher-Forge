import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { after, before, test } from "node:test";
import JSZip from "jszip";
import { app, buildReleaseQa } from "../server.js";

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);

  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function solidPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height, 255);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  for (let row = 0; row < height; row += 1) {
    pixels[row * stride] = 0;
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const coverPng = solidPng(1838, 2775);
const interiorPng = solidPng(1024, 1024);
const qualityReview = { verdict: "PASS", overallScore: 92 };

function kdpPackage(overrides = {}) {
  return {
    platform: "KDP",
    packageTitle: "Release QA Coloring Book",
    subtitle: "A regression-test edition",
    deliverableType: "KDP paperback coloring book",
    draftMarkdown: [
      "## Coloring pages",
      "![Interior illustration 1](interior-art-01.png)"
    ].join("\n\n"),
    listingTitle: "Release QA Coloring Book",
    listingDescription:
      "A useful original coloring book prepared to verify the Publisher Forge release pipeline from manuscript through final upload files.",
    keywords: [
      "coloring book",
      "Coloring Book",
      "creative practice",
      "relaxing activity",
      "adult coloring",
      "line art",
      "paperback activity",
      "creative gift",
      "mindful hobby"
    ],
    productionChecklist: [],
    riskFlags: [],
    interiorArt: [{
      mimeType: "image/png",
      base64: interiorPng.toString("base64"),
      alt: "Interior illustration 1"
    }],
    authorName: "Maxx Powers",
    ...overrides
  };
}

function cover() {
  return {
    mimeType: "image/png",
    base64: coverPng.toString("base64"),
    authorName: "Maxx Powers"
  };
}

test("Release QA builds and validates a complete KDP paperback", async () => {
  const release = await buildReleaseQa({
    title: "Release QA Coloring Book",
    package: kdpPackage(),
    qualityReview,
    cover: cover(),
    authorName: "Maxx Powers"
  });

  assert.equal(release.report.verdict, "READY");
  assert.equal(release.report.blockers.length, 0);
  assert.equal(release.report.artifacts.interiorPdf.pageCount, 24);
  assert.ok(release.report.artifacts.coverPdf.bytes > 1000);
  assert.match(release.report.packageFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(release.packageData.keywords.length, 7);
  assert.ok(release.report.autoFixes.some((item) => /keyword/i.test(item)));
  assert.ok(release.report.checks.every((item) => item.status !== "BLOCKED"));
});

test("Release QA blocks a KDP package with no cover", async () => {
  const release = await buildReleaseQa({
    title: "Release QA Coloring Book",
    package: kdpPackage(),
    qualityReview,
    cover: null,
    authorName: "Maxx Powers"
  });

  assert.equal(release.report.verdict, "BLOCKED");
  assert.ok(release.report.blockers.some((item) => /front cover/i.test(item)));
  assert.equal(
    release.report.checks.find((item) => item.id === "cover-art").status,
    "BLOCKED"
  );
});

test("Release QA catches skipped chapter numbers", async () => {
  const release = await buildReleaseQa({
    title: "Chapter Fixture",
    package: {
      platform: "Etsy",
      packageTitle: "Chapter Fixture",
      subtitle: "",
      deliverableType: "Printable guide",
      draftMarkdown: [
        "## Chapter 1 — Start",
        "Useful opening guidance. ".repeat(12),
        "## Chapter 3 — Finish",
        "Useful closing guidance. ".repeat(12)
      ].join("\n\n"),
      listingTitle: "Chapter Fixture",
      listingDescription:
        "A detailed printable guide used to verify missing-chapter detection.",
      keywords: ["guide"],
      productionChecklist: [],
      riskFlags: []
    },
    qualityReview,
    authorName: "Maxx Powers"
  });

  assert.equal(release.report.verdict, "BLOCKED");
  assert.ok(release.report.blockers.some((item) => /chapter numbering skips: 2/i.test(item)));
});

function recordPackage(overrides = {}) {
  return kdpPackage({
    packageTitle: "Seasonal Winterization and Storage Logbook",
    subtitle: "RV owner records", deliverableType: "Paperback logbook",
    draftMarkdown: "## Owner records\n\n" +
      "Record work completed by your provider and refer to your vehicle owner's manual.\n" +
      Array.from({ length: 160 }, (_, i) => "Record " + (i + 1) + ": Date ______ Service ______ Receipt ______").join("\n"),
    interiorArt: [], ...overrides
  });
}

test("short RV logbook repairs page count, pricing and cover PDF in one build without AI", async () => {
  const release = await buildReleaseQa({ package: recordPackage(), qualityReview, cover: cover() });
  assert.equal(release.report.verdict, "READY");
  assert.equal(release.printable.pageCount, 24);
  assert.ok(release.printable.recordPagesAdded > 0);
  assert.equal(release.printable.intentionalBlankPageCount, 0);
  assert.ok(release.report.autoFixes.some(item => /usable, labeled record forms/.test(item)));
  for (const id of ["page-count", "pricing", "cover-pdf"]) {
    assert.equal(release.report.checks.find(item => item.id === id).status, "PASS");
  }
  assert.equal(release.report.pricing.actualPageCount, 24);
  const rebuilt = await buildReleaseQa({ package: release.packageData, qualityReview, cover: cover() });
  assert.equal(rebuilt.printable.pageCount, 24);
  assert.equal(rebuilt.printable.recordPagesAdded, release.printable.recordPagesAdded);
  assert.equal(rebuilt.report.packageFingerprint, release.report.packageFingerprint);
});

test("record form completion cannot pass missing covers, failed QA, empty drafts or narrative books", async () => {
  for (const options of [
    { package: recordPackage(), qualityReview, cover: null },
    { package: recordPackage(), qualityReview: { verdict: "BLOCKED" }, cover: cover() },
    { package: recordPackage({ draftMarkdown: "## Records\nTiny draft." }), qualityReview, cover: cover() },
    { package: recordPackage({ draftMarkdown: "## Chapter 1\n" + "Record dates and references. ".repeat(30) + "\n## Chapter 3\nRecord the follow-up." }), qualityReview, cover: cover() },
    { package: recordPackage({ deliverableType: "Short story fiction", draftMarkdown: "## Chapter 1\n" + "Original narrative material. ".repeat(30) }), qualityReview, cover: cover() }
  ]) {
    const release = await buildReleaseQa(options);
    assert.equal(release.report.verdict, "BLOCKED");
  }
});

test("repaired record pages are present and retested in the actual exported KDP ZIP", async () => {
  const packageData = recordPackage({ approvedAt: "2026-09-12T00:00:00Z" });
  const response = await fetch(baseUrl + "/api/export-bundle", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: packageData.packageTitle, brief: "RV record book", packageText: "Approved RV record package", package: packageData, qualityReview, cover: cover(), authorName: "Maxx Powers" })
  });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const report = JSON.parse(await zip.file("review/release-qa.json").async("string"));
  assert.equal(report.verdict, "READY");
  assert.equal(report.artifacts.interiorPdf.pageCount, 24);
  assert.ok(report.artifacts.interiorPdf.recordPagesAdded > 0);
  assert.ok(zip.file("UPLOAD-TO-KDP/2-paperback-cover.pdf"));
  const pdf = await zip.file("UPLOAD-TO-KDP/1-manuscript-interior.pdf").async("nodebuffer");
  assert.equal((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length, 24);
});

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = "http://127.0.0.1:" + server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("approved KDP ZIP has an unmistakable four-file upload folder", async () => {
  const packageData = kdpPackage({
    approvedAt: "2026-09-08T00:00:00.000Z"
  });
  const response = await fetch(baseUrl + "/api/export-bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: packageData.packageTitle,
      brief: "Approved regression-test brief.",
      packageText: "Approved production package.",
      package: packageData,
      qualityReview,
      cover: cover(),
      authorName: "Maxx Powers"
    })
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/zip/);

  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  for (const filename of [
    "START-HERE.txt",
    "UPLOAD-TO-KDP/1-manuscript-interior.pdf",
    "UPLOAD-TO-KDP/2-paperback-cover.pdf",
    "UPLOAD-TO-KDP/3-copy-paste-book-details.txt",
    "UPLOAD-TO-KDP/4-upload-steps.txt",
    "review/release-qa.json"
  ]) {
    assert.ok(zip.file(filename), filename + " must be present");
  }

  const report = JSON.parse(
    await zip.file("review/release-qa.json").async("string")
  );
  assert.equal(report.verdict, "READY");
});
