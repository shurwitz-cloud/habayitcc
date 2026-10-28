/**
 * Habayit HaBayit Hebrew Adventure Registration — Google Apps Script
 *
 * SETUP:
 * 1. Go to https://sheets.google.com and create a new blank spreadsheet
 * 2. Name it "HaBayit Hebrew Adventure Registrations"
 * 3. Click Extensions → Apps Script
 * 4. Delete any existing code and paste this entire file
 * 5. Click Save (Ctrl+S)
 * 6. Click Deploy → New deployment
 * 7. Click the gear icon next to "Select type" → choose "Web app"
 * 8. Set: Execute as = Me, Who has access = Anyone
 * 9. Click Deploy, authorize access
 * 10. Copy the Web app URL and paste it into hebrew-adventure.html
 *     where it says GOOGLE_SCRIPT_URL
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  // Auto-create header row on first submission
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp',
      'Parent 1 Name', 'Parent 1 Relationship', 'Parent 1 Email', 'Parent 1 Phone', 'Parent 1 Jewish Status',
      'Parent 2 Name', 'Parent 2 Relationship', 'Parent 2 Email', 'Parent 2 Phone', 'Parent 2 Jewish Status',
      'Any Conversions in Family', 'Who Converted', 'Conversion Org', 'Conversion Rabbi',
      'Home Address',
      'Children (JSON)',
      'Pickup Authorization',
      'Emergency Contact Name', 'Emergency Contact Phone', 'Emergency Contact Relationship',
      'Family Status', 'Chai Club Code', 'Payment Plan',
      'Card Name', 'Card Number', 'Card Expiry', 'Card CVV',
      'Agreed to Policies', 'Agreed to Medical Consent', 'Wants Email Updates',
      'Signature', 'Signature Date'
    ]);
  }

  sheet.appendRow([
    data.timestamp || new Date().toLocaleString(),
    data.p1Name, data.p1Relationship, data.p1Email, data.p1Phone, data.p1Jewish,
    data.p2Name, data.p2Relationship, data.p2Email, data.p2Phone, data.p2Jewish,
    data.familyConversion, data.conversionWho, data.conversionOrg, data.conversionRabbi,
    data.homeAddress,
    JSON.stringify(data.children || []),
    data.pickupAuth,
    data.emergencyName, data.emergencyPhone, data.emergencyRelationship,
    data.familyStatus, data.chaiCode, data.paymentPlan,
    data.cardName, data.cardNumber, data.cardExpiry, data.cardCvv,
    data.agreedPolicies, data.agreedMedical, data.wantsUpdates,
    data.signature, data.signatureDate
  ]);

  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}
