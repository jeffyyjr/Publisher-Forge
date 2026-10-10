import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const E = 914400;
const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const br = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const textRun = (v,bold=false) => '<w:r>' + (bold ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(v) + '</w:t></w:r>';
const para = (v,style="",align="") => '<w:p>' + ((style || align) ? '<w:pPr>' + (style ? '<w:pStyle w:val="' + style + '"/>' : '') + (align ? '<w:jc w:val="' + align + '"/>' : '') + '</w:pPr>' : '') + v + '</w:p>';
const plain = (v,style="",align="") => para(inline(v),style,align);

function tableXml(rows) {
  const cols = Math.max(1,...rows.map(r=>r.length));
  const cw = Math.floor((PAGE_W - MARGIN * 2) / cols);
  const grid = Array.from({length:cols},()=>'<w:gridCol w:w="' + cw + '"/>').join("");
  const body = rows.map((row,i)=>'<w:tr>'+Array.from({length:cols},(_,j)=>'<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/>'+(i===0?'<w:shd w:fill="EAF0F6"/>':'')+'</w:tcPr><w:p>'+textRun(row[j]||"",i===0)+'</w:p></w:tc>').join("")+'</w:tr>').join("");
  return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid>'+grid+'</w:tblGrid>'+body+'</w:tbl>';
}
function imageXml(alt, rel, id) {
  const cx = 4 * E, cy = 4 * E;
  return para('<w:r><w:drawing><wp:inline><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+id+'" name="interior-art-'+id+'.png" descr="'+esc(alt)+'"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="interior-art-'+id+'.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rel+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',"","center");
}
const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="'+W+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style></w:styles>';
function documentXml(body) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+W+'" xmlns:r="'+R+'" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body+'<w:sectPr><w:pgSz w:w="8640" w:h="12960"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>';
}
export async function buildManuscriptDocx(pkg, options={}) {
  if (!pkg || String(pkg.platform).toUpperCase()!=="KDP") throw new Error("Word export is only available for KDP packages.");
  const zip = new JSZip();
  const art = Array.isArray(options.interiorArt)?options.interiorArt:[];
  const byName = new Map(art.map(x=>[String(x.filename).toLowerCase(),x]));
  const imageRels=[];
  const body=[plain("PAPERBACK EDITION","Heading2"),plain(pkg.packageTitle||"Untitled product","Title")];
  if(pkg.subtitle) body.push(plain(pkg.subtitle,"Heading2"));
  if(pkg.authorName) body.push(plain("By "+pkg.authorName));
  body.push(br());
  const lines=String(pkg.draftMarkdown||"").split(/\r?\n/);
  let i=0, imgId=1;
  while(i<lines.length){
    const line=lines[i].trim();
    if(!line){i++;continue;}
    if(line.startsWith("|") && i+1<lines.length && /^\|?\s*:?-{3,}/.test(lines[i+1])){
      const rows=[line.replace(/^\||\|$/g,"").split("|").map(x=>x.trim())]; i+=2;
      while(i<lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim().replace(/^\||\|$/g,"").split("|").map(x=>x.trim()));
      body.push(tableXml(rows)); continue;
    }
    const im=line.match(/^!\[([^\]]*)\]\((?:interior-art\/)?(interior-art-\d{2}\.png)\)$/i);
    if(im){
      const item=byName.get(im[2].toLowerCase());
      if(item){
        const rel="rIdImage"+imgId;
        imageRels.push({id:rel,target:"media/"+String(item.filename).toLowerCase()});
        body.push(imageXml(im[1]||item.alt||"Interior illustration",rel,imgId));
        if(/coloring|colouring/i.test((pkg.packageTitle||"")+" "+(pkg.deliverableType||""))) body.push(br(),br());
        imgId++;
      } else body.push(plain("[Missing illustration: "+im[1]+"]","Heading3"));
      i++;continue;
    }
    const h=line.match(/^(#{1,3})\s+(.+)$/);
    if(h){body.push(plain(h[2],h[1].length===1?"Heading1":h[1].length===2?"Heading2":"Heading3"));i++;continue;}
    const c=line.match(/^-\s*\[([ xX])\]\s+(.+)$/);
    const b=line.match(/^[-*]\s+(.+)$/);
    if(c) body.push(plain((c[1].trim()?"[x] ":"[ ] ")+c[2]));
    else if(b) body.push(plain("• "+b[1]));
    else if(/^\d+[.)]\s+/.test(line)) body.push(plain(line));
    else body.push(plain(line));
    i++;
  }
  if(/coloring|colouring/i.test((pkg.packageTitle||"")+" "+(pkg.deliverableType||""))){
    body.push(br(),plain("Color Test Page","Heading1"),plain("Test pencils, markers, and shading before coloring an illustration."),tableXml([["","","",""],["","","",""],["","","",""],["","","",""]]));
    body.push(br(),plain("Palette Planner","Heading1"),tableXml([["Color / pencil","Combination or notes"],["",""],["",""],["",""]]));
    body.push(br(),plain("My Favorite Pages","Heading1"));
    for(let n=0;n<10;n++) body.push(plain("____________________________________________"));
    body.push(br(),plain("Creative Notes","Heading1"));
    for(let n=0;n<12;n++) body.push(plain("____________________________________________"));
  }
  for(let n=0;n<Math.min(100,Number(options.recordPagesAdded)||0);n++){
    body.push(br(),plain(n%2===0?"Seasonal Storage Record":"Maintenance and Service Record","Heading1"));
    for(const label of ["Date / reference","Work or component","Provider / receipt","Observations","Next review date"]){body.push(plain(label,"Heading3"),plain("____________________________________________"),plain("____________________________________________"));}
  }
  zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.folder("_rels").file(".rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const word=zip.folder("word");
  word.file("document.xml",documentXml(body.join("")));
  word.file("styles.xml",styles);
  word.folder("_rels").file("document.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+imageRels.map(x=>'<Relationship Id="'+x.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="'+esc(x.target)+'"/>').join("")+'</Relationships>');
  const media=word.folder("media");
  for(const item of art) media.file(String(item.filename).toLowerCase(),item.buffer,{binary:true});
  return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE",compressionOptions:{level:1}});
}
