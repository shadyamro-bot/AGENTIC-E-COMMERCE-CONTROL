'use strict';

const COLOR_MAP = {
  black: 'Black', 'أسود': 'Black', grey: 'Grey', gray: 'Grey', 'رمادي': 'Grey',
  white: 'White', 'أبيض': 'White', beige: 'Beige', 'بيج': 'Beige',
  brown: 'Brown', havan: 'Brown', 'هافان': 'Brown', red: 'Red', nabity: 'Red', 'نبيتي': 'Red',
  green: 'Green', ziti: 'Green', 'زيتي': 'Green', blue: 'Blue', petroly: 'Blue', betroly: 'Blue', 'كحلي': 'Blue'
};

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function extractSku(text) {
  const m = text.match(/(?:sku|parent(?:\s+sku)?|كود|منتج)\s*[:#-]?\s*([A-Z0-9_-]{2,24})/i);
  return (m?.[1] || text.match(/\b[A-Z]{1,8}\d{1,8}[A-Z0-9_-]*\b/i)?.[0] || '').toUpperCase();
}
function extractPrice(text) {
  const m = text.match(/(?:price|السعر)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : null;
}
function extractSizes(text) {
  const range = text.match(/(?:sizes?|مقاسات?|المقاسات)\s*(?:from|من)?\s*(\d{2})\s*(?:to|-|إلى|الي)\s*(\d{2})/i);
  if (range) {
    const a = Number(range[1]), b = Number(range[2]);
    return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => String(a + i));
  }
  const list = text.match(/(?:sizes?|مقاسات?|المقاسات)\s*[:=-]?\s*((?:\d{2}[,\s/]+){1,10}\d{2})/i);
  return list ? unique(list[1].match(/\d{2}/g) || []) : [];
}
function extractColors(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [key, normalized] of Object.entries(COLOR_MAP)) if (lower.includes(key.toLowerCase())) found.push(normalized);
  return unique(found);
}
function parseCommand(command) {
  const parentSku = extractSku(command);
  const colors = extractColors(command);
  const sizes = extractSizes(command);
  const price = extractPrice(command);
  const gender = /women|woman|حريمي|نساء/i.test(command) ? 'Women' : /kids|children|اطفال|أطفال/i.test(command) ? 'Kids' : 'Men';
  const fulfillment = /mfn|merchant/i.test(command) ? 'MFN' : 'FBA';
  const origin = /egypt|مصر/i.test(command) ? 'Egypt' : null;
  const productName = /slipper|شبشب/i.test(command) ? 'Casual Slippers' : /sandal|صندل/i.test(command) ? 'Casual Sandals' : 'Casual Shoes';
  const errors = [];
  if (!parentSku) errors.push('Parent SKU is required');
  if (!colors.length) errors.push('At least one color is required');
  if (!sizes.length) errors.push('At least one size is required');
  if (!price) errors.push('Price is required');
  const variants = [];
  for (const color of colors) for (const size of sizes) {
    const slug = color.toUpperCase().replace(/\s+/g, '-');
    variants.push({ sku: `${parentSku}-${slug}-${size}`, color, size, price, quantity: 0, title: `Now Shoes ${gender}'s ${productName} ${parentSku}, ${color}, ${size}` });
  }
  return { parentSku, productName, gender, colors, sizes, price, countryOfOrigin: origin, fulfillment, variants, errors };
}
module.exports = { parseCommand, COLOR_MAP };
