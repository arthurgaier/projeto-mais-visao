import { unzipSync, strFromU8 } from "fflate";

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (match) => XML_ENTITIES[match] ?? match);
}

// A .docx file is a zip archive; the document body lives in
// word/document.xml as WordprocessingML. This extracts plain text without a
// full XML parser (not available in the Workers runtime), which is enough
// for narrative clinical notes: paragraphs, line breaks, and tabs.
export function extractTextFromDocx(fileBuffer: ArrayBuffer): string {
  const zip = unzipSync(new Uint8Array(fileBuffer));
  const documentXmlBytes = zip["word/document.xml"];
  if (!documentXmlBytes) {
    throw new Error("word/document.xml não encontrado — o arquivo não parece ser um .docx válido.");
  }

  const xml = strFromU8(documentXmlBytes);

  const withBreaks = xml
    .replace(/<w:p[ >][^>]*>/g, "")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n");

  const withoutTags = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = decodeXmlEntities(withoutTags);

  return decoded
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
