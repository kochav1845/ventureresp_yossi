// Simulating what should happen for invoice 098742
const invoiceRefs = ['098742'];

console.log('Testing query with invoice refs:', invoiceRefs);
console.log('Query should be: .in("invoice_reference_number", ["098742"])');
