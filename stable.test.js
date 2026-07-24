'use strict';
const assert = require('assert');
const fs = require('fs');
const { parseCommand, isConfirmation } = require('./parser');

const first = parseCommand('أنشئ منتج CK9 مقاسات من 41 إلى 45');
assert.equal(first.parentSku, 'CK9');
assert.deepEqual(first.sizes, ['41','42','43','44','45']);
assert(first.errors.includes('At least one color is required'));
assert(first.errors.includes('Price is required'));

const second = parseCommand('لون ابيض واسود واحمر سعر 599', first);
assert.deepEqual(second.colors.sort(), ['Black','Red','White'].sort());
assert.equal(second.price, 599);
assert.equal(second.variants.length, 15);
assert.equal(isConfirmation('تمام اعمل'), true);

const server = fs.readFileSync('server.js','utf8');
assert(server.includes("const VERSION = '1.4.0'"));
assert(server.includes("/api/diagnostics"));
assert(server.includes("/api/files/:id/reanalyze"));
assert(server.includes("/api/files/:id/export-corrected"));
assert(server.includes("original_bytes"));

const app = fs.readFileSync('app.js','utf8');
assert(app.includes("['diagnostics','Diagnostics']"));
assert(app.includes('Export corrected Excel'));
console.log('AEC v1.4.0 stable tests passed');
