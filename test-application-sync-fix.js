// Test to verify ApplicationHistory field mapping fix
const testApplicationHistory = [
  {
    "AdjustedRefNbr": { "value": "084171" },
    "AdjustedDocType": { "value": "Invoice" },
    "AmountPaid": { "value": 248 },
    "ApplicationPeriod": { "value": "062025" },
    "Balance": { "value": 0 },
    "CustomerOrder": { "value": "APHN00000850306" },
    "Date": { "value": "2025-06-26T00:00:00+00:00" }
  }
];

console.log("Testing OLD filter (ReferenceNbr - BROKEN):");
const oldFiltered = testApplicationHistory.filter(app => app.ReferenceNbr?.value);
console.log(`  Filtered count: ${oldFiltered.length} (should be 0 - BROKEN!)`);

console.log("\nTesting NEW filter (AdjustedRefNbr - FIXED):");
const newFiltered = testApplicationHistory.filter(app => app.AdjustedRefNbr?.value);
console.log(`  Filtered count: ${newFiltered.length} (should be 1 - WORKS!)`);

console.log("\nMapping result:");
const mapped = newFiltered.map(app => ({
  doc_type: app.AdjustedDocType?.value || null,
  invoice_reference_number: app.AdjustedRefNbr.value,
  amount_paid: app.AmountPaid?.value,
}));
console.log(JSON.stringify(mapped, null, 2));
