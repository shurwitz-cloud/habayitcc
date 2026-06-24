# Chai Club — Membership Form
## Setup Instructions

---

### Step 1 — Deploy to Netlify

1. Go to https://netlify.com and log in (or create a free account)
2. Click **"Add new site" → "Deploy manually"**
3. Drag the entire `chai-club` folder onto the upload area
4. Your site will be live at a URL like `https://random-name.netlify.app`
5. To use a custom domain, go to **Site settings → Domain management**

---

### Step 2 — Set up Google Sheet

1. Go to https://sheets.google.com and create a new blank spreadsheet
2. Name it something like **"Chai Club Members"**
3. Click **Extensions → Apps Script**
4. Delete any existing code in the editor
5. Open the file `google-apps-script.js` from this folder and paste the entire contents
6. Click the **Save** icon (or Ctrl+S)
7. Click **Deploy → New deployment**
8. Click the gear icon next to "Select type" and choose **Web app**
9. Set the following:
   - Description: `Chai Club Form`
   - Execute as: **Me**
   - Who has access: **Anyone**
10. Click **Deploy**
11. Click **Authorize access** and follow the Google prompts
12. Copy the **Web app URL** — it looks like:
    `https://script.google.com/macros/s/XXXXXXX/exec`

---

### Step 3 — Connect form to Google Sheet

1. Open `index.html` in a text editor
2. Find this line near the bottom:
   ```
   const GOOGLE_SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
   ```
3. Replace `YOUR_GOOGLE_APPS_SCRIPT_URL_HERE` with the URL you copied
4. Save the file
5. Re-upload/redeploy to Netlify (drag the folder again, or use Netlify CLI)

---

### That's it!

Every form submission will now:
- Show the thank-you page to the member
- Add a new row to your Google Sheet with all their information
- The sheet auto-creates a header row on the first submission

The columns in the sheet will be:
`Timestamp | First Name | Last Name | Email | Phone | Address | Monthly Amount | Name on Card | Card Number | Expiry | CVV | Billing Address`

---

### Need help?
Contact your web developer or reach out for support.
