'use strict';
const assert = require('assert');
const { analyzeWorkbook } = require('./amazonTemplateParser');

const matrix = [
  ['settings'],
  ['Use English'],
  ['Listing Identity'],
  ['SKU','Product Type','Listing Action','Parentage Level','Parent SKU','Variation Theme Name','Color Map','Color','Size','Main Image URL','Your Price EGP (Sell on Amazon, EG)'],
  ['contribution_sku#1.value','product_type#1.value','::record_action','parentage_level[...]#1.value','child_parent_sku_relationship[...]#1.parent_sku','variation_theme#1.name','color[...]standardized','color[...]value','size[...]value','main_product_image_locator[...]','purchasable_offer[...]our_price'],
  ['ABC123','SHOES','Create','Parent','ABC123','Size/Color','Red','Cranberry','8.5','http://example.com/sample.jpg','9.00'],
  ['POMA','SHOES','Create or Replace (Full Update)','Parent','','SIZE/COLOR','','','','',''],
  ['POMA-B*B-41','SHOES','Create or Replace (Full Update)','Child','POMA','SIZE/COLOR','Black','BLACK*BLACK','41','https://example.com/1.jpg','499'],
  ['POMA-B*B-42','SHOES','Create or Replace (Full Update)','Child','POMA','SIZE/COLOR','Black','BLACK*BLACK','42','https://example.com/1.jpg','499'],
];
const workbook={SheetNames:['Template'],Sheets:{Template:{matrix}}};
const XLSX={utils:{sheet_to_json:(sheet)=>sheet.matrix}};
const result=analyzeWorkbook(workbook,XLSX,'LISTING');
assert.equal(result.headerRow,4);
assert.equal(result.dataStartRow,7);
assert.equal(result.totalRows,3);
assert.equal(result.parentRows,1);
assert.equal(result.childRows,2);
assert.equal(result.blockedRows,0);
assert.equal(result.accepted,3);
assert.equal(result.analysisVersion,'1.4.0');
console.log('AEC parser v1.4.0 test passed');
