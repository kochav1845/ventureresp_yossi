# Acumatica Payment File Access Setup Guide

This guide provides two approaches to access payment check images from Acumatica:
1. **Generic Inquiry + OData** (Easier, no code)
2. **Custom REST API Endpoint** (More flexible, requires customization)

---

## Option 1: Generic Inquiry + OData Access (RECOMMENDED)

This approach creates a Generic Inquiry that joins payment data with file attachments and exposes it via OData.

### Step 1: Create Generic Inquiry in Acumatica

1. **Navigate to Generic Inquiry**
   - Go to: `System` → `Customization` → `Generic Inquiry`
   - Click `New` to create a new inquiry

2. **Set Basic Information**
   - **Inquiry Title**: `Payment Files`
   - **Screen ID**: Will be auto-generated (e.g., `GI301000`)
   - Check: `☑ Expose via OData`

3. **Configure Tables and Joins**

   **Primary Table:**
   - Table: `ARPayment`
   - Alias: `Payment`

   **Join 1: Link to NoteDoc**
   - Table: `NoteDoc`
   - Alias: `NoteDoc`
   - Join Type: `Left Join`
   - Join Condition: `Payment.NoteID = NoteDoc.NoteID`

   **Join 2: Link to UploadFile**
   - Table: `UploadFile`
   - Alias: `File`
   - Join Type: `Left Join`
   - Join Condition: `NoteDoc.FileID = File.FileID`

4. **Add Fields to Results Grid**

   Select these fields to expose in the API:

   | Table | Field | Alias (Suggested) |
   |-------|-------|-------------------|
   | Payment | DocType | PaymentType |
   | Payment | RefNbr | PaymentRefNbr |
   | Payment | CustomerID | CustomerID |
   | Payment | NoteID | PaymentNoteID |
   | File | FileID | FileID |
   | File | Name | FileName |
   | File | CreatedDateTime | FileCreatedDate |

5. **Add Filter Parameters (Optional)**

   Create a parameter to filter by payment reference:
   - Parameter Name: `RefNbr`
   - Field: `Payment.RefNbr`
   - Condition: `Equal`
   - Default Value: (leave empty)

6. **Set Permissions**
   - Click `Actions` → `Publish to UI`
   - Click `Set Granted for All Roles` (or configure specific role access)
   - **Important**: In Acumatica 2024, permissions default to NONE. You must explicitly grant access.

7. **Test the Inquiry**
   - Click `View Inquiry` to test
   - Verify that payments with attachments show file information

8. **Note the Screen ID**
   - The URL will show the screen ID (e.g., `GI301000`)
   - You'll use this in the OData URL

### Step 2: Access via OData API

Once the Generic Inquiry is created and published, access it via:

**OData URL Pattern:**
```
https://your-instance.acumatica.com/odata/Default/PaymentFiles
```

**With Filter:**
```
https://your-instance.acumatica.com/odata/Default/PaymentFiles?$filter=PaymentRefNbr eq '000602'
```

**Authentication:**
Use the same authentication cookies from the Contract-Based API login:
```bash
# Login first
POST https://your-instance.acumatica.com/entity/auth/login
Content-Type: application/json
{
  "name": "username",
  "password": "password"
}

# Use cookies from login response
GET https://your-instance.acumatica.com/odata/Default/PaymentFiles?$filter=PaymentRefNbr eq '000602'
Cookie: [cookies from login]
```

**Response Example:**
```json
{
  "@odata.context": "https://your-instance.acumatica.com/odata/Default/$metadata#PaymentFiles",
  "value": [
    {
      "PaymentType": "Payment",
      "PaymentRefNbr": "000602",
      "CustomerID": "CUST001",
      "PaymentNoteID": "b9d2f2e2-68f7-ea11-817f-0aaa5a5328f0",
      "FileID": "09171b47-f342-40cb-a4f8-aa687466cde2",
      "FileName": "check_image.pdf",
      "FileCreatedDate": "2024-11-15T10:30:00Z"
    }
  ]
}
```

### Step 3: Download Files Using FileID

Once you have the FileID, download the file:

```
GET https://your-instance.acumatica.com/(W(2))/Frames/GetFile.ashx?fileID={FileID}
Cookie: [cookies from login]
```

---

## Option 2: Custom REST API Endpoint

This approach requires Acumatica customization knowledge and creates a dedicated REST endpoint.

### Step 1: Extend the Default Endpoint

1. **Open Web Services Endpoints**
   - Go to: `System` → `Integration` → `Web Service Endpoints`
   - Find the `Default` endpoint (version `24.200.001`)
   - Click `Actions` → `Extend Endpoint`

2. **Configure Extended Endpoint**
   - **Name**: `CustomPaymentFiles`
   - **Version**: `24.200.001`
   - Click `OK`

### Step 2: Create Generic Inquiry (Same as Option 1)

Follow Option 1, Steps 1-7 to create the Generic Inquiry.

### Step 3: Add Generic Inquiry to Endpoint

1. **In the Extended Endpoint**
   - Go to the `Entities` tab
   - Click `Add Entity`

2. **Configure Entity**
   - **Screen ID**: Enter the GI screen ID (e.g., `GI301000`)
   - **Entity Name**: `PaymentFiles`
   - **Top Level Entity**: Yes

3. **Map Fields**
   - Click on the newly added entity
   - Add all fields from the GI:
     - PaymentType (String)
     - PaymentRefNbr (String)
     - CustomerID (String)
     - PaymentNoteID (Guid)
     - FileID (Guid)
     - FileName (String)
     - FileCreatedDate (DateTime)

4. **Save and Validate**
   - Click `Save`
   - Click `Actions` → `Validate Entity`
   - Resolve any validation errors

### Step 4: Access Custom Endpoint

**URL Pattern:**
```
https://your-instance.acumatica.com/entity/CustomPaymentFiles/24.200.001/PaymentFiles
```

**With Filter:**
```
https://your-instance.acumatica.com/entity/CustomPaymentFiles/24.200.001/PaymentFiles?$filter=PaymentRefNbr eq '000602'
```

**Authentication:**
Same as Option 1 - use Contract-Based API login cookies.

---

## Option 3: Custom Action (Advanced)

For more advanced scenarios, you can create a custom action in a graph extension that returns file IDs.

### Create Graph Extension

```csharp
using PX.Data;
using PX.Objects.AR;
using System;
using System.Collections.Generic;

namespace CustomExtensions
{
    public class ARPaymentEntryExt : PXGraphExtension<ARPaymentEntry>
    {
        [PXButton]
        [PXUIField(DisplayName = "Get Attached Files")]
        public IEnumerable<FileAttachment> GetAttachedFiles()
        {
            var payment = Base.Document.Current;
            if (payment?.NoteID == null)
                yield break;

            // Get file notes
            Guid[] fileIds = PXNoteAttribute.GetFileNotes(
                Base.Document.Cache,
                payment
            );

            // Get file details
            var upload = PXGraph.CreateInstance<UploadFileMaintenance>();
            foreach (Guid fileId in fileIds)
            {
                var fileInfo = upload.GetFile(fileId);
                if (fileInfo != null)
                {
                    yield return new FileAttachment
                    {
                        FileID = fileId,
                        FileName = fileInfo.Name,
                        FileSize = fileInfo.BinData?.Length ?? 0,
                        CreatedDate = fileInfo.CreatedDateTime
                    };
                }
            }
        }
    }

    [Serializable]
    public class FileAttachment
    {
        public Guid FileID { get; set; }
        public string FileName { get; set; }
        public long FileSize { get; set; }
        public DateTime? CreatedDate { get; set; }
    }
}
```

### Expose as REST API Action

Add this action to your custom endpoint definition:
- Action Name: `GetAttachedFiles`
- Return Type: Collection

---

## Comparison of Approaches

| Feature | Generic Inquiry + OData | Custom Endpoint | Custom Action |
|---------|------------------------|-----------------|---------------|
| **Ease of Setup** | ⭐⭐⭐⭐⭐ Easy | ⭐⭐⭐ Moderate | ⭐⭐ Complex |
| **No Code Required** | ✅ Yes | ✅ Yes | ❌ No |
| **Flexibility** | ⭐⭐⭐ Good | ⭐⭐⭐⭐ Great | ⭐⭐⭐⭐⭐ Excellent |
| **Performance** | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Good | ⭐⭐⭐ Fair |
| **Maintenance** | ⭐⭐⭐⭐⭐ Low | ⭐⭐⭐⭐ Low | ⭐⭐⭐ Medium |

**Recommendation**: Start with **Option 1 (Generic Inquiry + OData)** as it requires no code and is easiest to maintain.

---

## Next Steps

After setting up one of these options:

1. **Test the endpoint** with the test credentials
2. **Create Supabase Edge Function** to fetch file IDs
3. **Download files** using GetFile.ashx
4. **Store in Supabase Storage** (optional) or proxy directly to frontend
5. **Update UI** to display check images in the payment dashboard

---

## Troubleshooting

### OData Returns Empty Results
- Verify the Generic Inquiry works in the Acumatica UI first
- Check that "Expose via OData" is enabled
- Verify permissions are set correctly
- Ensure you're using the correct OData URL (based on GI name)

### Authentication Fails
- OData uses the same authentication as Contract-Based API
- Ensure cookies from login are being passed
- Check that the user has access to the Generic Inquiry

### No Files Appear for Payments
- Verify files are actually attached in Acumatica UI
- Check the join conditions in the Generic Inquiry
- Ensure the NoteID values are matching correctly

### GetFile.ashx Returns 401/403
- Verify authentication cookies are valid
- Check that the FileID exists and is valid
- Ensure the user has permission to access the file
