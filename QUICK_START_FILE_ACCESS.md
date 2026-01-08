# Quick Start: Access Payment Check Images from Acumatica

## 🎯 Goal
Enable your application to fetch and display check images attached to payments in Acumatica.

## ⏱️ Time Required
**15-20 minutes** (one-time setup)

## 📋 Prerequisites
- Access to Acumatica with System Administrator or Customization rights
- Payments in Acumatica with file attachments (check images)

## 🚀 Setup Steps

### Step 1: Create Generic Inquiry in Acumatica (10 min)

1. **Open Generic Inquiry Screen**
   ```
   System → Customization → Generic Inquiry
   ```

2. **Create New Inquiry**
   - Click `New`
   - **Inquiry Title**: `Payment Files`
   - ☑️ Check: `Expose via OData`

3. **Add Tables** (in this order):

   **Primary Table:**
   - Table: `ARPayment`
   - Alias: `Payment`

   **Join 1:**
   - Click `Add Table`
   - Table: `NoteDoc`
   - Alias: `NoteDoc`
   - Join Type: `Left Join`
   - Condition: `Payment.NoteID` = `NoteDoc.NoteID`

   **Join 2:**
   - Click `Add Table`
   - Table: `UploadFile`
   - Alias: `File`
   - Join Type: `Left Join`
   - Condition: `NoteDoc.FileID` = `File.FileID`

4. **Add Fields to Results**

   Click the `Results Grid` tab, then add these fields:

   | Table | Field | Alias |
   |-------|-------|-------|
   | Payment | DocType | PaymentType |
   | Payment | RefNbr | PaymentRefNbr |
   | Payment | CustomerID | CustomerID |
   | Payment | NoteID | PaymentNoteID |
   | File | FileID | FileID |
   | File | Name | FileName |
   | File | CreatedDateTime | FileCreatedDate |

5. **Set Permissions**
   - Click `Actions` → `Publish to UI`
   - Click `Set Granted for All Roles`
   - **Or** configure specific role access as needed

6. **Save**
   - Click `Save`
   - Note the screen ID that appears in the URL (e.g., `GI301000`)

### Step 2: Test the Generic Inquiry (2 min)

1. **View the Inquiry**
   - Click `View Inquiry` button
   - You should see a list of payments
   - Payments with attachments will show file information

2. **Verify OData Access**
   - The inquiry is now accessible via OData at:
     ```
     https://your-instance.acumatica.com/odata/Default/PaymentFiles
     ```

### Step 3: Test in Your Application (3 min)

1. **Open Your Application**
   - Navigate to the Payment Check Images section
   - Or wherever you integrated the PaymentCheckImages component

2. **Select a Payment**
   - Choose a payment from the dropdown
   - Preferably one you know has file attachments

3. **Fetch Attachments**
   - Click `Fetch Attachments from Acumatica`
   - Files should appear in the "Files in Acumatica" section (green badges)

4. **Download a File**
   - Click `Download` on any file
   - The file should download from Acumatica

## ✅ Verification

You'll know it's working when:
- ✅ No error messages appear
- ✅ Files are listed with green "From Acumatica" badges
- ✅ Download links work and return actual files
- ✅ File metadata (name, date) is displayed correctly

## 🔧 Troubleshooting

### "Generic Inquiry not configured"
**Solution**: Complete Step 1 above. Make sure "Expose via OData" is checked.

### "OData returns empty"
**Possible Causes**:
1. Generic Inquiry not published
   - **Fix**: Click "Publish to UI" in the Generic Inquiry
2. Permissions not set
   - **Fix**: Click "Set Granted for All Roles"
3. Wrong inquiry name
   - **Fix**: Verify the inquiry is named exactly "PaymentFiles"

### "No files found"
**Possible Causes**:
1. Payment genuinely has no attachments
   - **Verify**: Check in Acumatica UI if files are attached
2. Join conditions incorrect
   - **Fix**: Verify the joins match Step 1 exactly
3. Files attached to different entity
   - **Note**: Some files might be on invoices, not payments

### "Authentication failed"
**Solution**: Verify credentials in your environment variables:
- `VITE_ACUMATICA_USERNAME`
- `VITE_ACUMATICA_PASSWORD`
- `VITE_ACUMATICA_COMPANY` (optional)
- `VITE_ACUMATICA_BRANCH` (optional)

## 📚 Additional Resources

- **Full Setup Guide**: See `ACUMATICA_FILE_ACCESS_SETUP.md` for:
  - Alternative setup methods (Custom Endpoint, Custom Action)
  - Advanced configurations
  - Detailed troubleshooting

- **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md` for:
  - Technical architecture
  - How it works under the hood
  - API documentation

## 💡 Tips

1. **Test with Known Files**: Before rolling out, test with a payment you know has attachments

2. **Check File Types**: The system works with PDFs, images (JPG, PNG), and most file types

3. **Permissions**: Generic Inquiries respect Acumatica's security. Users need:
   - Access to the Generic Inquiry
   - Access to view the payments
   - Access to download files

4. **Performance**: The Generic Inquiry is fast, but with thousands of payments, consider adding filters by date range

5. **Naming**: If you named your inquiry differently, update the `giName` parameter in the Edge Function call

## 🎉 Success!

Once set up, your users can:
- ✅ View all file attachments for any payment
- ✅ Download check images directly
- ✅ See file metadata (name, date, size)
- ✅ Access files with proper authentication

## 🆘 Need Help?

If you're stuck:
1. Review the error message carefully
2. Check the browser console for detailed errors
3. Verify the Generic Inquiry works in Acumatica UI first
4. Consult `ACUMATICA_FILE_ACCESS_SETUP.md` for detailed troubleshooting

---

**Remember**: This is a one-time setup. Once configured, it works automatically for all payments with attachments!
