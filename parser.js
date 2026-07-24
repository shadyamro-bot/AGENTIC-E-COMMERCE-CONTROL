'use strict';

const COLOR_MAP = {
  black: 'Black', 'أسود': 'Black', 'اسود': 'Black', grey: 'Grey', gray: 'Grey', 'رمادي': 'Grey',
  white: 'White', 'أبيض': 'White', 'ابيض': 'White', beige: 'Beige', 'بيج': 'Beige',
  brown: 'Brown', havan: 'Brown', 'هافان': 'Brown', red: 'Red', 'أحمر': 'Red', 'احمر': 'Red', nabity: 'Red', 'نبيتي': 'Red',
  green: 'Green', ziti: 'Green', 'زيتي': 'Green', blue: 'Blue', petroly: 'Blue', betroly: 'Blue', 'كحلي': 'Blue', 'ازرق': 'Blue', 'أزرق': 'Blue'
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function extractSku(text) {
  const m = String(text).match(/(?:sku|parent(?:\s+sku)?|كود|منتج)\s*[:#-]?\s*([A-Z0-9_-]{2,24})/i);
  return (m?.[1] || String(text).match(/\b[A-Z]{1,8}\d{1,8}[A-Z0-9_-]*\b/i)?.[0] || '').toUpperCase();
}
function extractPrice(text) {
  const m = String(text).match(/(?:price|السعر|سعر)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : null;
}
function extractSizes(text) {
  const value = String(text);
  const range = value.match(/(?:sizes?|مقاسات?|المقاسات)\s*(?:from|من)?\s*(\d{2})\s*(?:to|-|إلى|الي)\s*(\d{2})/i);
  if (range) {
    const a = Number(range[1]), b = Number(range[2]);
    return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => String(a + i));
  }
  const list = value.match(/(?:sizes?|مقاسات?|المقاسات)\s*[:=-]?\s*((?:\d{2}[,\s/]+){1,10}\d{2})/i);
  return list ? unique(list[1].match(/\d{2}/g) || []) : [];
}
function extractColors(text) {
  const lower = normalizeText(text);
  const found = [];
  for (const [key, normalized] of Object.entries(COLOR_MAP)) {
    if (lower.includes(normalizeText(key))) found.push(normalized);
  }
  return unique(found);
}
function buildVariants(draft) {
  const variants = [];
  for (const color of draft.colors || []) for (const size of draft.sizes || []) {
    const slug = color.toUpperCase().replace(/\s+/g, '-');
    variants.push({
      sku: `${draft.parentSku}-${slug}-${size}`,
      color,
      size,
      price: draft.price,
      quantity: Number(draft.quantity || 0),
      title: `Now Shoes ${draft.gender}'s ${draft.productName} ${draft.parentSku}, ${color}, ${size}`
    });
  }
  return variants;
}
function validateDraft(draft) {
  const errors = [];
  if (!draft.parentSku) errors.push('Parent SKU is required');
  if (!draft.colors?.length) errors.push('At least one color is required');
  if (!draft.sizes?.length) errors.push('At least one size is required');
  if (!draft.price) errors.push('Price is required');
  return errors;
}
function parseCommand(command, base = {}) {
  const text = String(command || '');
  const detectedSku = extractSku(text);
  const detectedColors = extractColors(text);
  const detectedSizes = extractSizes(text);
  const detectedPrice = extractPrice(text);
  const detectedGender = /women|woman|حريمي|نساء/i.test(text) ? 'Women' : /kids|children|اطفال|أطفال/i.test(text) ? 'Kids' : /men|man|رجالي|رجال/i.test(text) ? 'Men' : null;
  const detectedFulfillment = /mfn|merchant/i.test(text) ? 'MFN' : /fba/i.test(text) ? 'FBA' : null;
  const detectedOrigin = /egypt|مصر/i.test(text) ? 'Egypt' : null;
  const detectedProductName = /slipper|شبشب/i.test(text) ? 'Casual Slippers' : /sandal|صندل/i.test(text) ? 'Casual Sandals' : /shoe|shoes|حذاء|جزمه|جزمة|كوتشي/i.test(text) ? 'Casual Shoes' : null;
  const draft = {
    parentSku: detectedSku || base.parentSku || '',
    productName: detectedProductName || base.productName || 'Casual Shoes',
    gender: detectedGender || base.gender || 'Men',
    colors: detectedColors.length ? detectedColors : (base.colors || []),
    sizes: detectedSizes.length ? detectedSizes : (base.sizes || []),
    price: detectedPrice ?? base.price ?? null,
    quantity: base.quantity || 0,
    countryOfOrigin: detectedOrigin || base.countryOfOrigin || null,
    fulfillment: detectedFulfillment || base.fulfillment || 'FBA'
  };
  draft.errors = validateDraft(draft);
  draft.variants = draft.errors.length ? [] : buildVariants(draft);
  return draft;
}
function isConfirmation(text) {
  return /^(تمام|اعمل|نفذ|نعم|ايوه|أيوه|ok|okay|confirm|go|go ahead|ابدأ|ابدا)(\s+اعمل|\s+نفذ|\s+ابدأ|\s+ابدا)?[.!\s]*$/i.test(String(text || '').trim());
}
function hasDraftFields(text) {
  return Boolean(extractSku(text) || extractPrice(text) || extractSizes(text).length || extractColors(text).length || /fba|mfn|مصر|egypt|رجالي|حريمي|اطفال|أطفال/i.test(String(text)));
}
module.exports = { parseCommand, COLOR_MAP, isConfirmation, hasDraftFields, validateDraft };
