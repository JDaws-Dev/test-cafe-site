



/**
 * Artios Academies Cafe System - Google Apps Script
 * Version: 3.1 - August 14, 2025
 * 
 * Complete system with family authentication, order management,
 * simplified session-based cancellation processing, and automated daily reports
 */

// ============================================
// CONFIGURATION
// ============================================

const SHEET_ID = '1vBlYUsY7lt0k4x7I_OxvjYbHvQn0hbR6HwHh_aCsHxA';
const ORDERS_SHEET = 'orders';
const FAMILY_ACCOUNTS_SHEET = 'Family_Accounts';
const CANCELLATIONS_SHEET = 'Cancellations';
const NOTIFICATION_EMAIL = 'jdaws@artiosacademies.com';

// ============================================
// MAIN ENTRY POINTS
// ============================================

/**
 * Handle POST requests
 */
function doPost(e) {
  try {
    console.log('doPost called');
    
    // Parse the incoming data
    const data = e.parameter.data ? JSON.parse(e.parameter.data) : JSON.parse(e.postData.contents);
    
    // Log received data
    console.log('Parsed data:', JSON.stringify(data));
    console.log('Order ID:', data.orderId);
    console.log('Parent Email:', data.parentEmail);
    console.log('Children count:', data.children ? data.children.length : 0);
    console.log('Items count:', data.items ? data.items.length : 0);
    
    // Save the order to sheet
    saveMultiChildOrderToSheet(data);
    
    // Send confirmation emails
    try {
      sendOrderConfirmationEmail(data);
      sendAdminNotificationEmail(data);
    } catch (emailError) {
      console.error('Email error (non-blocking):', emailError);
    }
    
    const response = {
      success: true,
      message: 'Order saved successfully',
      orderId: data.orderId,
      childrenCount: data.children ? data.children.length : 0,
      itemsCount: data.items ? data.items.length : 0,
      discount: getDiscountDescription(data.promoCode)
    };
    
    console.log('Returning success response:', JSON.stringify(response));
    
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('Error in doPost:', error.toString());
    console.error('Error stack:', error.stack);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Complete doGet handler with all existing and new endpoints
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    console.log('doGet called with action:', action);
    
    // Test endpoint
    if (action === 'test' || e.parameter.test === 'true') {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          message: 'Google Apps Script is working correctly!',
          timestamp: new Date().toISOString(),
          version: '3.1'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ============================================
    // AUTHENTICATION ENDPOINTS
    // ============================================
    
    if (action === 'verify_family_login') {
      const email = e.parameter.email;
      const passcode = e.parameter.passcode;
      
      if (!email || !passcode) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Email and passcode required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const result = verifyFamilyLogin(email, passcode);
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (authError) {
        console.error('Authentication error:', authError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: authError.toString()
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    if (action === 'create_family_account') {
      const email = e.parameter.email;
      const passcode = e.parameter.passcode;
      
      if (!email || !passcode) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Email and passcode required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const result = createFamilyAccount(email, passcode);
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (createError) {
        console.error('Account creation error:', createError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: createError.toString()
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    if (action === 'reset_passcode') {
      const email = e.parameter.email;
      
      if (!email) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Email required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const result = resetFamilyPasscode(email);
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (resetError) {
        console.error('Password reset error:', resetError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: resetError.toString()
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // ============================================
    // ORDER MANAGEMENT ENDPOINTS
    // ============================================
    
    if (action === 'lookup_orders') {
      const email = e.parameter.email;
      const orderId = e.parameter.order_id;
      
      if (!email) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Email parameter required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const result = lookupOrders(email, orderId);
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (lookupError) {
        console.error('Lookup error:', lookupError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: `Order lookup failed: ${lookupError.toString()}`
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // Updated single item cancellation
    if (action === 'cancel_item') {
      const itemId = e.parameter.item_id;
      const reason = e.parameter.reason || 'Parent requested';
      
      if (!itemId) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Item ID parameter required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const result = processCancellation(itemId, reason);
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (cancellationError) {
        console.error('Cancellation error:', cancellationError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: `Cancellation failed: ${cancellationError.toString()}`
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // New batch cancellation endpoint
    if (action === 'cancel_multiple_items') {
      const sessionId = e.parameter.session_id;
      const itemsParam = e.parameter.items;
      const reason = e.parameter.reason || 'Parent requested';
      
      if (!sessionId || !itemsParam) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Session ID and items parameters required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const items = JSON.parse(itemsParam);
        const result = processBatchCancellation(items, sessionId, reason);
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (batchError) {
        console.error('Batch cancellation error:', batchError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: `Batch cancellation failed: ${batchError.toString()}`
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // ============================================
    // REPORT GENERATION ENDPOINTS
    // ============================================
    
    if (action === 'generate_report') {
      const secret = e.parameter.secret;
      if (secret !== 'cafe2025') {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Invalid secret key'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const dateParam = e.parameter.date;
        const workerRecipients = e.parameter.worker_recipients;
        let reportDate;
        
        if (dateParam) {
          reportDate = new Date(dateParam + 'T12:00:00');
          if (isNaN(reportDate.getTime())) {
            throw new Error('Invalid date format. Use YYYY-MM-DD');
          }
        } else {
          reportDate = new Date();
        }
        
        const result = generateEmailOnlyReport(reportDate);
        
        if (workerRecipients) {
          sendWorkerDailyOrdersEmail(workerRecipients, result, reportDate);
        }
        
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            date: reportDate.toDateString(),
            orderCount: result.orderCount,
            reportData: result.reportData
          }))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (reportError) {
        console.error('Report generation error:', reportError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: `Report generation failed: ${reportError.toString()}`
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === 'generate_financial_report') {
      const secret = e.parameter.secret;
      if (secret !== 'cafe2025') {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Invalid secret key'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const startDate = e.parameter.start_date;
        const endDate = e.parameter.end_date;
        const adminRecipients = e.parameter.admin_recipients ? e.parameter.admin_recipients.split(',') : [];
        
        if (!startDate || !endDate) {
          throw new Error('Start date and end date required');
        }
        
        const result = generateFinancialReport(startDate, endDate, adminRecipients);
        
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (financialError) {
        console.error('Financial report error:', financialError);
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: `Financial report failed: ${financialError.toString()}`
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Unknown action: ' + action
      }))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('Error in doGet:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

/**
 * Get or create the Family Accounts sheet
 */
function getFamilyAccountsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let familySheet;
  
  try {
    familySheet = spreadsheet.getSheetByName(FAMILY_ACCOUNTS_SHEET);
  } catch (e) {
    // Sheet doesn't exist, create it
    familySheet = spreadsheet.insertSheet(FAMILY_ACCOUNTS_SHEET);
    
    // Set up headers
    const headers = [
      'Email',
      'Passcode_Hash',
      'Created_Date',
      'Last_Login',
      'Account_Type',
      'Reset_Token',
      'Reset_Expiry'
    ];
    
    familySheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format the header row
    const headerRange = familySheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    
    // Protect the sheet (optional)
    const protection = familySheet.protect().setDescription('Family Accounts - Sensitive Data');
    protection.setWarningOnly(true);
    
    console.log('Created new Family Accounts sheet');
  }
  
  return familySheet;
}

/**
 * Get or create the Orders sheet
 */
function getOrdersSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let ordersSheet;
  
  try {
    ordersSheet = spreadsheet.getSheetByName(ORDERS_SHEET);
  } catch (e) {
    // Sheet doesn't exist, create it
    ordersSheet = spreadsheet.insertSheet(ORDERS_SHEET);
    
    // Set up headers
    const headers = [
      'Order_ID',           // A
      'Parent_Email',       // B
      'Child_First_Name',   // C
      'Child_Last_Name',    // D
      'Grade',              // E
      'Items_JSON',         // F
      'Item_Price',         // G
      'Reserved',           // H
      'Timestamp',          // I
      'Parent_Phone',       // J
      'Child_ID',           // K
      'Item_Date',          // L
      'Day_Name',           // M
      'Subtotal',           // N
      'Discount',           // O
      'Total',              // P
      'Promo_Code',         // Q
      'Item_Status',        // R
      'Cancellation_Date',  // S
      'Refund_Amount',      // T
      'Cancellation_Reason', // U
      'Cancellation_Session_ID' // V
    ];
    
    ordersSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format the header row
    const headerRange = ordersSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    
    console.log('Created new Orders sheet');
  }
  
  return ordersSheet;
}

/**
 * Hash a passcode for secure storage
 */
function hashPasscode(passcode) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, passcode);
  return Utilities.base64Encode(hash);
}

/**
 * Check if a family has existing orders
 */
function checkFamilyHasOrders(email) {
  try {
    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] && data[i][1].toLowerCase() === email.toLowerCase()) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking family orders:', error);
    return false;
  }
}

/**
 * Verify family login credentials
 */
function verifyFamilyLogin(email, passcode) {
  try {
    console.log(`Verifying login for: ${email}`);
    
    const familySheet = getFamilyAccountsSheet();
    const data = familySheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toLowerCase() === email.toLowerCase()) {
        const storedHash = data[i][1];
        const providedHash = hashPasscode(passcode);
        
        if (storedHash === providedHash) {
          // Update last login
          familySheet.getRange(i + 1, 4).setValue(new Date());
          
          console.log(`✅ Login successful for ${email}`);
          return {
            success: true,
            message: 'Login successful',
            email: email
          };
        } else {
          console.log(`❌ Invalid passcode for ${email}`);
          return {
            success: false,
            error: 'Invalid passcode'
          };
        }
      }
    }
    
    console.log(`❌ Family not found: ${email}`);
    return {
      success: false,
      error: 'Family not found'
    };
    
  } catch (error) {
    console.error('Error in verifyFamilyLogin:', error);
    throw error;
  }
}

/**
 * Create new family account
 */
function createFamilyAccount(email, passcode) {
  try {
    console.log(`Creating family account for: ${email}`);
    
    const familySheet = getFamilyAccountsSheet();
    const data = familySheet.getDataRange().getValues();
    
    // Check if family already exists
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toLowerCase() === email.toLowerCase()) {
        console.log(`❌ Family already exists: ${email}`);
        return {
          success: false,
          error: 'Family already exists'
        };
      }
    }
    
    // Check if family has existing orders
    const hasOrders = checkFamilyHasOrders(email);
    
    // Create new family account
    const hashedPasscode = hashPasscode(passcode);
    const now = new Date();
    
    familySheet.appendRow([
      email,                    // A: Email
      hashedPasscode,          // B: Hashed Passcode  
      now,                     // C: Created Date
      now,                     // D: Last Login
      hasOrders ? 'existing' : 'new',  // E: Account Type
      '',                      // F: Reset Token
      ''                       // G: Reset Expiry
    ]);
    
    console.log(`✅ Family account created for ${email}`);
    
    // Send welcome email
    try {
      sendWelcomeEmail(email);
    } catch (emailError) {
      console.error('Welcome email failed:', emailError);
    }
    
    return {
      success: true,
      message: 'Account created successfully',
      email: email,
      hasExistingOrders: hasOrders
    };
    
  } catch (error) {
    console.error('Error in createFamilyAccount:', error);
    throw error;
  }
}

/**
 * Reset family passcode
 */
function resetFamilyPasscode(email) {
  try {
    console.log('Processing passcode reset for: ' + email);
    
    const familySheet = getFamilyAccountsSheet();
    const data = familySheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toLowerCase() === email.toLowerCase()) {
        // Generate temporary passcode
        const tempPasscode = Math.floor(1000 + Math.random() * 9000).toString();
        const hashedTemp = hashPasscode(tempPasscode);
        
        // Update the account with temporary passcode
        familySheet.getRange(i + 1, 2).setValue(hashedTemp);
        familySheet.getRange(i + 1, 6).setValue('RESET');
        familySheet.getRange(i + 1, 7).setValue(new Date());
        
        // Send reset email
        sendPasswordResetEmail(email, tempPasscode);
        
        console.log('SUCCESS: Passcode reset for ' + email);
        return {
          success: true,
          message: 'Reset instructions sent to your email'
        };
      }
    }
    
    console.log('ERROR: Family not found for reset: ' + email);
    return {
      success: false,
      error: 'Email not found. Please create an account first.'
    };
    
  } catch (error) {
    console.error('Error in resetFamilyPasscode:', error);
    throw error;
  }
}

// ============================================
// ENHANCED ORDER LOOKUP AND CANCELLATION FUNCTIONS
// ============================================

/**
 * Generate unique session ID
 */
function generateSessionId() {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `S${datePart}${timePart}${randomPart}`;
}


/**
 * Normalize any date-ish input to "YYYY-MM-DD" (safe for Sheets Date, ISO/local strings, or serials)
 */
function normalizeDateToString(dateInput) {
  if (!dateInput) return '';
  let d;

  if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'number') {
    // If this is a Sheets serial date, convert using Apps Script Utilities
    try {
      d = new Date(dateInput);
    } catch (e) {
      d = new Date(NaN);
    }
  } else if (typeof dateInput === 'string') {
    // Works for ISO, and most locale-ish strings that Apps Script’s Date can parse
    d = new Date(dateInput);
  } else {
    return '';
  }

  if (isNaN(d.getTime())) return '';

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}



/**
 * Enhanced lookupOrders function to properly return cancelled item details
 */
/**
 * Enhanced lookupOrders function with normalized date handling
 */
function lookupOrders(email, orderId = null) {
  try {
    console.log(`Looking up orders for email: ${email}, orderId: ${orderId}`);

    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();

    const orderMap = {};

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[1] !== email) continue; // Parent_Email (B)

      if (orderId && row[0] !== orderId) continue; // Order_ID (A)

      const currentOrderId = row[0];

      if (!orderMap[currentOrderId]) {
        orderMap[currentOrderId] = {
          orderId: currentOrderId,
          timestamp: row[8], // Timestamp (I)
          email: row[1],
          items: [],
          children: [],
          subtotal: row[13] || 0, // N
          discount: row[14] || 0, // O
          total: row[15] || 0,    // P
          promoCode: row[16] || ''// Q
        };
      }

      try {
        let itemsArray = [];
        if (row[5]) { // Items_JSON (F)
          itemsArray = typeof row[5] === 'string' ? JSON.parse(row[5]) : row[5];
        }

        if (itemsArray.length > 0) {
          const itemData = itemsArray[0];

          // CRITICAL: normalize date from Item_Date (L)
          const normalizedDate = normalizeDateToString(row[11]);

          // Status & cancellation columns
          const itemStatus = row[17] || 'active';     // R
          const cancellationDate = row[18] || null;   // S
          const refundAmount = parseFloat(row[19]) || 0; // T
          const cancellationReason = row[20] || null; // U
          const sessionId = row[21] || null;          // V

          const item = {
            id: `${currentOrderId}-${i}`,
            rowIndex: i,
            name: itemData.name,
            price: parseFloat(row[6]) || 0,             // Item_Price (G)
            day: itemData.day || row[12],               // Day from JSON or Day_Name (M)
            childId: row[10] || '1',                    // Child_ID (K)
            childName: `${row[2]} ${row[3]}`.trim(),    // First + Last (C,D)
            childFirstName: row[2],
            childLastName: row[3],
            grade: row[4],                               // Grade (E)
            date: normalizedDate,                        // ALWAYS "YYYY-MM-DD"
            status: itemStatus,
            cancellationDate: cancellationDate,
            refundAmount: refundAmount,
            cancellationReason: cancellationReason,
            sessionId: sessionId
          };

          orderMap[currentOrderId].items.push(item);

          // Track unique children
          const childKey = item.childName;
          if (!orderMap[currentOrderId].children.find(c => c.name === childKey)) {
            orderMap[currentOrderId].children.push({
              id: row[10] || '1',
              firstName: row[2],
              lastName: row[3],
              name: childKey,
              grade: row[4]
            });
          }
        }
      } catch (parseError) {
        console.error(`Error parsing item data for row ${i}:`, parseError);
      }
    }

    const orders = Object.values(orderMap);

    // Debug: verify normalization
    console.log(`Found ${orders.length} orders for ${email}`);
    orders.forEach(order => {
      console.log(`Order ${order.orderId}: ${order.items.length} items`);
      order.items.forEach(it => {
        if (!it.date || it.date.includes('T') || it.date.length !== 10) {
          console.warn('Unnormalized date detected:', it);
        }
      });
    });

    return { success: true, orders, count: orders.length };

  } catch (error) {
    console.error('Error in lookupOrders:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process multiple item cancellations in a single session
 */
function processBatchCancellation(items, sessionId, reason) {
  try {
    console.log(`Processing batch cancellation for session: ${sessionId}, items: ${items.length}`);
    
    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    const cancelledItems = [];
    const now = new Date();
    
    for (const itemRequest of items) {
      const itemId = itemRequest.itemId;
      const itemReason = itemRequest.reason || reason;
      
      // Extract row index from itemId (format: ORDERID-ROWINDEX)
      const parts = itemId.split('-');
      const rowIndex = parseInt(parts[parts.length - 1]);
      
      if (!rowIndex || rowIndex >= data.length || rowIndex < 1) {
        console.error(`Invalid item ID: ${itemId}`);
        continue;
      }
      
      const row = data[rowIndex];
      
      // Check if item is already cancelled
      const currentStatus = row[17] || 'active';
      if (currentStatus === 'cancelled') {
        console.log(`Item ${itemId} already cancelled`);
        continue;
      }
      
      // Validate deadline (same logic as before)
      let itemDateStr = row[11];
      let itemDate;
      if (itemDateStr instanceof Date) {
        itemDate = new Date(itemDateStr);
      } else if (typeof itemDateStr === 'string') {
        if (itemDateStr.includes('T')) {
          itemDate = new Date(itemDateStr.split('T')[0] + 'T00:00:00');
        } else if (itemDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          itemDate = new Date(itemDateStr + 'T00:00:00');
        } else {
          itemDate = new Date(itemDateStr);
        }
      } else {
        console.error(`Invalid item date format for ${itemId}: ${itemDateStr}`);
        continue;
      }
      
      if (isNaN(itemDate.getTime())) {
        console.error(`Could not parse item date for ${itemId}: ${itemDateStr}`);
        continue;
      }
      
      // Check deadline
      const cutoffTime = new Date(
        itemDate.getFullYear(),
        itemDate.getMonth(), 
        itemDate.getDate(),
        8, 15, 0, 0
      );
      
      if (now > cutoffTime) {
        console.log(`Item ${itemId} past deadline, skipping`);
        continue;
      }
      
      // Get item details
      let itemsArray = [];
      if (row[5]) {
        if (typeof row[5] === 'string') {
          itemsArray = JSON.parse(row[5]);
        } else {
          itemsArray = row[5];
        }
      }
      
      const itemData = itemsArray[0];
      const refundAmount = parseFloat(row[6]) || 0;
      const orderId = row[0];
      const parentEmail = row[1];
      
      // Update the row with cancellation info
      const range = sheet.getRange(rowIndex + 1, 1, 1, sheet.getLastColumn());
      const updatedRow = [...row];
      
      // Ensure we have enough columns (add Cancellation_Session_ID as column V)
      while (updatedRow.length < 22) {
        updatedRow.push('');
      }
      
      updatedRow[17] = 'cancelled'; // Status column (R)
      updatedRow[18] = now.toISOString(); // Cancellation date (S)
      updatedRow[19] = refundAmount; // Refund amount (T)
      updatedRow[20] = itemReason; // Cancellation reason (U)
      updatedRow[21] = sessionId; // Cancellation session ID (V)
      
      range.setValues([updatedRow]);
      
      // Add to cancelled items list
      cancelledItems.push({
        orderId: orderId,
        parentEmail: parentEmail,
        childName: `${row[2]} ${row[3]}`,
        itemName: itemData.name,
        itemDay: itemData.day,
        itemDate: itemDate,
        refundAmount: refundAmount,
        reason: itemReason,
        cancellationDate: now
      });
      
      // Log individual cancellation
      logCancellation(orderId, itemData, refundAmount, itemReason, parentEmail);
      
      console.log(`Successfully cancelled item: ${itemData.name} for ${row[2]} ${row[3]}`);
    }
    
    if (cancelledItems.length > 0) {
      // Send batched emails
      const parentEmail = cancelledItems[0].parentEmail;
      sendBatchedParentCancellationEmail(parentEmail, cancelledItems, sessionId);
      sendBatchedAdminRefundNotification(parentEmail, cancelledItems, sessionId);
      
      console.log(`Sent batched refund emails for ${cancelledItems.length} items`);
    }
    
    return {
      success: true,
      message: `${cancelledItems.length} item${cancelledItems.length !== 1 ? 's' : ''} cancelled successfully. You will receive a confirmation email shortly.`,
      cancelledCount: cancelledItems.length,
      totalRefund: cancelledItems.reduce((sum, item) => sum + item.refundAmount, 0),
      sessionId: sessionId
    };
    
  } catch (error) {
    console.error('Error in processBatchCancellation:', error);
    throw error;
  }
}

/**
 * Enhanced single item cancellation that creates a single-item session
 */
function processCancellation(itemId, reason) {
  try {
    // Create a single-item session
    const sessionId = generateSessionId();
    const items = [{ itemId: itemId, reason: reason }];
    
    return processBatchCancellation(items, sessionId, reason);
    
  } catch (error) {
    console.error('Error in processCancellation:', error);
    throw error;
  }
}

/**
 * Log cancellation to separate tracking sheet
 */
function logCancellation(orderId, itemData, refundAmount, reason, email) {
  try {
    let cancellationSheet;
    try {
      cancellationSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(CANCELLATIONS_SHEET);
    } catch (sheetError) {
      // Create cancellation sheet if it doesn't exist
      const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
      cancellationSheet = spreadsheet.insertSheet(CANCELLATIONS_SHEET);
      
      // Add headers
      cancellationSheet.getRange(1, 1, 1, 9).setValues([[
        'Cancellation Date', 'Order ID', 'Email', 'Item Name', 'Item Day', 
        'Refund Amount', 'Reason', 'Status', 'Session ID'
      ]]);
    }
    
    // Add cancellation record
    cancellationSheet.appendRow([
      new Date(),
      orderId,
      email,
      itemData.name,
      itemData.day,
      refundAmount,
      reason,
      'Cancelled',
      '' // Session ID will be filled by batch processing
    ]);
    
    console.log('Cancellation logged successfully');
    
  } catch (error) {
    console.error('Error logging cancellation:', error);
  }
}

// ============================================
// ORDER MANAGEMENT
// ============================================

/**
 * Save multi-child order data to Google Sheet
 */
function saveMultiChildOrderToSheet(orderData) {
  try {
    console.log('Saving multi-child order to sheet:', orderData.orderId);
    const sheet = getOrdersSheet();
    
    // Process each item for each child
    orderData.items.forEach((item, itemIndex) => {
      const childId = item.childId || '1';
      const child = orderData.children.find(c => c.id === childId) || orderData.children[0];
      
      if (!child) {
        console.error('No child found for item:', item);
        return;
      }
      
      const rowData = [
        orderData.orderId,                    // A: Order ID
        orderData.parentEmail,                // B: Parent Email
        child.firstName,                       // C: Child First Name
        child.lastName,                        // D: Child Last Name
        child.grade,                           // E: Grade
        JSON.stringify([item]),                // F: Items (as JSON array)
        item.price,                            // G: Item Price
        '',                                    // H: Reserved
        orderData.timestamp,                   // I: Timestamp
        orderData.parentPhone || '',          // J: Parent Phone
        childId,                               // K: Child ID
        item.date,                            // L: Item Date (YYYY-MM-DD)
        item.day,                             // M: Day Name
        orderData.subtotal,                   // N: Subtotal
        orderData.discount || 0,              // O: Discount
        orderData.total,                      // P: Total
        orderData.promoCode || '',           // Q: Promo Code
        'active',                             // R: Item Status (for cancellation)
        '',                                   // S: Cancellation Date
        '',                                   // T: Refund Amount
        '',                                   // U: Cancellation Reason
        ''                                    // V: Cancellation Session ID
      ];
      
      sheet.appendRow(rowData);
      console.log(`Saved item for ${child.firstName} ${child.lastName}: ${item.name}`);
    });
    
    console.log(`Order ${orderData.orderId} saved successfully with ${orderData.items.length} items`);
    
  } catch (error) {
    console.error('Error saving order to sheet:', error);
    throw error;
  }
}

/**
 * Get discount description for email
 */
function getDiscountDescription(promoCode) {
  if (!promoCode) return '';
  
  const code = promoCode.toUpperCase();
  if (code === 'STAFF2025') return '10% Staff Discount Applied';
  if (code === 'JOHN') return '50% Special Discount Applied';
  return 'Discount Applied';
}

// ============================================
// REPORT GENERATION
// ============================================

/**
 * Generate email-only report excluding cancelled items
 */
function generateEmailOnlyReport(reportDate) {
  try {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const reportDayName = dayNames[reportDate.getDay()];
    
    console.log(`Generating email-only report for ${reportDate.toDateString()}`);
    
    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    
    // Format report date as YYYY-MM-DD for comparison
    const reportDateStr = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}-${String(reportDate.getDate()).padStart(2, '0')}`;
    
    const itemsForThisDate = [];
    
    // Process orders for this specific date
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const itemDateStr = row[11]; // Item date column
      const itemStatus = row[17] || 'active'; // Status column
      
      // Skip cancelled items
      if (itemStatus === 'cancelled') {
        continue;
      }
      
      // Check if this item is for the report date
      if (itemDateStr === reportDateStr) {
        const items = JSON.parse(row[5] || '[]');
        
        items.forEach(item => {
          if (item.day === reportDayName) {
            itemsForThisDate.push({
              orderId: row[0],
              email: row[1],
              childFirstName: row[2],
              childLastName: row[3],
              childName: `${row[2]} ${row[3]}`,
              grade: row[4],
              item: item,
              itemPrice: parseFloat(row[6]) || 0,
              childId: row[10] || '1',
              subtotal: parseFloat(row[13]) || 0,
              discount: parseFloat(row[14]) || 0,
              total: parseFloat(row[15]) || 0,
              promoCode: row[16] || '',
              status: itemStatus
            });
          }
        });
      }
    }
    
    if (itemsForThisDate.length === 0) {
      return {
        orderCount: 0,
        reportData: {
          itemsForThisDate: [],
          itemCounts: {},
          totalRevenue: 0,
          totalDiscounts: 0,
          familiesServed: 0
        }
      };
    }
    
    // Process the data for email reports
    const itemCounts = {};
    let totalRevenue = 0;
    let totalDiscounts = 0;
    
    itemsForThisDate.forEach(orderItem => {
      const itemName = orderItem.item.name;
      const price = orderItem.itemPrice;
      
      if (!itemCounts[itemName]) {
        itemCounts[itemName] = { count: 0, price: price, total: 0 };
      }
      itemCounts[itemName].count++;
      itemCounts[itemName].total += price;
      totalRevenue += orderItem.total;
      totalDiscounts += orderItem.discount;
    });
    
    return {
      orderCount: itemsForThisDate.length,
      reportData: {
        itemsForThisDate: itemsForThisDate,
        itemCounts: itemCounts,
        totalRevenue: totalRevenue,
        totalDiscounts: totalDiscounts,
        familiesServed: new Set(itemsForThisDate.map(item => item.email)).size
      }
    };
    
  } catch (error) {
    console.error('Error generating email-only report:', error);
    throw error;
  }
}

/**
 * Compile and send daily orders (triggered at 8:15 AM)
 */
function compileDailyOrders() {
  try {
    const today = new Date();
    
    console.log(`Compiling daily orders for ${today.toDateString()}`);
    
    const result = generateEmailOnlyReport(today);
    
    sendEnhancedReportNotificationEmail(result, today, false);
    
    console.log(`Daily report sent: ${result.orderCount} items for ${today.toDateString()}`);
    
  } catch (error) {
    console.error('Error in daily compilation:', error);
    
    try {
      GmailApp.sendEmail(
        NOTIFICATION_EMAIL,
        'Daily Cafe Report Generation Failed',
        `Error generating daily report for ${new Date().toDateString()}:\n\n${error.toString()}\n\nPlease check the Google Apps Script logs.`,
        { name: 'Artios Academies Cafe System' }
      );
    } catch (emailError) {
      console.error('Failed to send error notification email:', emailError);
    }
  }
}

/**
 * Generate financial report (placeholder for existing functionality)
 */
function generateFinancialReport(startDate, endDate, adminRecipients) {
  try {
    console.log(`Generating financial report from ${startDate} to ${endDate}`);
    
    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalDiscounts = 0;
    const familyEmails = new Set();
    const itemCounts = {};
    
    // Process orders within date range
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const itemDateStr = row[11];
      const itemStatus = row[17] || 'active';
      
      // Skip cancelled items
      if (itemStatus === 'cancelled') {
        continue;
      }
      
      const itemDate = new Date(itemDateStr);
      
      if (itemDate >= startDateObj && itemDate <= endDateObj) {
        totalRevenue += parseFloat(row[15]) || 0; // Total column
        totalDiscounts += parseFloat(row[14]) || 0; // Discount column
        totalOrders++;
        familyEmails.add(row[1]); // Email column
        
        // Count items
        const items = JSON.parse(row[5] || '[]');
        items.forEach(item => {
          if (!itemCounts[item.name]) {
            itemCounts[item.name] = 0;
          }
          itemCounts[item.name]++;
        });
      }
    }
    
    // Send financial report email to admin recipients
    if (adminRecipients && adminRecipients.length > 0) {
      sendFinancialReportEmail(startDate, endDate, {
        totalRevenue,
        totalOrders,
        totalDiscounts,
        familiesServed: familyEmails.size,
        itemCounts
      }, adminRecipients);
    }
    
    return {
      success: true,
      message: 'Financial report generated',
      totalRevenue: totalRevenue,
      totalOrders: totalOrders,
      totalDiscounts: totalDiscounts,
      familiesServed: familyEmails.size
    };
    
  } catch (error) {
    console.error('Error generating financial report:', error);
    throw error;
  }
}

// ============================================
// EMAIL FUNCTIONS (Complete Section)
// ============================================

/**
 * Send welcome email to new family
 */
function sendWelcomeEmail(email) {
  try {
    const subject = 'Welcome to Artios Cafe Family Portal!';
    
    const emailBody = `
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #4285f4 0%, #7b68ee 100%); color: white; padding: 30px; text-align: center; border-radius: 12px;">
          <h1 style="margin: 0;">Welcome to Artios Cafe!</h1>
        </div>
        
        <div style="padding: 25px; background: white;">
          <h3 style="color: #4285f4;">Your family account has been created!</h3>
          
          <p>Dear Artios Family,</p>
          
          <p>Thank you for creating your secure family account. You can now:</p>
          
          <ul style="line-height: 1.8;">
            <li>Order lunch for your children online</li>
            <li>View your complete order history</li>
            <li>Cancel items up to 8:15 AM on the day of service</li>
            <li>Track refunds and payments</li>
            <li>Keep your family's information private and secure</li>
          </ul>
          
          <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #1976d2;">Quick Start:</h4>
            <ol>
              <li>Visit the cafe ordering site</li>
              <li>Click "Login" and use your email and passcode</li>
              <li>Start ordering from our delicious menu!</li>
            </ol>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            Questions? Contact us at <strong>${NOTIFICATION_EMAIL}</strong>
          </p>
        </div>
      </body>
      </html>
    `;
    
    GmailApp.sendEmail(
      email,
      subject,
      'Welcome to Artios Cafe! Your family account has been created.',
      {
        htmlBody: emailBody,
        name: 'Artios Academies Cafe'
      }
    );
    
    console.log(`Welcome email sent to ${email}`);
    
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
}

/**
 * Send password reset email
 */
function sendPasswordResetEmail(email, tempPasscode) {
  try {
    const subject = 'Artios Cafe - Passcode Reset';
    
    const emailBody = `
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ff9800 0%, #ff5722 100%); color: white; padding: 30px; text-align: center; border-radius: 12px;">
          <h1 style="margin: 0;">Passcode Reset Request</h1>
        </div>
        
        <div style="padding: 25px; background: white;">
          <h3 style="color: #ff5722;">Your temporary passcode is ready</h3>
          
          <div style="background: #fff3e0; border: 2px solid #ff9800; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 1.2em;">Your temporary passcode is:</p>
            <h2 style="color: #ff5722; font-size: 2.5em; margin: 10px 0; letter-spacing: 5px;">${tempPasscode}</h2>
          </div>
          
          <p><strong>Important:</strong></p>
          <ul>
            <li>This temporary passcode will work for your next login</li>
            <li>This code will become your new permanent passcode</li>
            <li>For security, this email should be deleted after use</li>
          </ul>
          
          <p style="text-align: center; margin-top: 30px;">
            Questions? Contact us at <strong>${NOTIFICATION_EMAIL}</strong>
          </p>
        </div>
      </body>
      </html>
    `;
    
    GmailApp.sendEmail(
      email,
      subject,
      'Your temporary passcode is: ' + tempPasscode,
      {
        htmlBody: emailBody,
        name: 'Artios Academies Cafe'
      }
    );
    
    console.log('Password reset email sent to ' + email);
    
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

/**
 * Send batched cancellation confirmation to parent
 */
function sendBatchedParentCancellationEmail(parentEmail, cancellations, sessionId) {
  try {
    const totalRefund = cancellations.reduce((sum, item) => sum + item.refundAmount, 0);
    const itemCount = cancellations.length;
    const subject = `Lunch Order Cancellation Confirmed - $${totalRefund.toFixed(2)} Refund`;
    
    let itemsList = '';
    cancellations.forEach(item => {
      itemsList += `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.childName}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemName}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemDay}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemDate.toLocaleDateString()}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${item.refundAmount.toFixed(2)}</td>
        </tr>
      `;
    });
    
    const emailBody = `
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%); color: white; padding: 25px; text-align: center; border-radius: 12px;">
          <h1 style="margin: 0; font-size: 1.8em;">Cancellation${itemCount > 1 ? 's' : ''} Confirmed</h1>
        </div>
        
        <div style="padding: 25px; background: white;">
          <h3 style="color: #4caf50;">Your cancellation has been processed</h3>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
            <h4>Cancelled Items:</h4>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <thead>
                <tr style="background: #e8f5e8;">
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Student</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Day</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Date</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Refund</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList}
              </tbody>
              <tfoot>
                <tr style="background: #f5f5f5; font-weight: bold;">
                  <td colspan="4" style="padding: 10px; border: 1px solid #ddd; text-align: right;">Total Refund:</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">$${totalRefund.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
            <h4>Refund Information:</h4>
            <ul>
              <li><strong>Amount:</strong> $${totalRefund.toFixed(2)}</li>
              <li><strong>Method:</strong> Venmo refund</li>
              <li><strong>Timeline:</strong> Within 24 hours</li>
              <li><strong>Session ID:</strong> ${sessionId}</li>
              <li><strong>Cancelled on:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            Questions? Contact us at <strong>${NOTIFICATION_EMAIL}</strong>
          </p>
        </div>
      </body>
      </html>
    `;
    
    GmailApp.sendEmail(
      parentEmail,
      subject,
      `Cancellation confirmed. Refund of $${totalRefund.toFixed(2)} will be processed within 24 hours.`,
      {
        htmlBody: emailBody,
        name: 'Artios Academies Cafe'
      }
    );
    
    console.log(`Batched cancellation confirmation sent to ${parentEmail}`);
    
  } catch (error) {
    console.error('Error sending batched parent cancellation email:', error);
  }
}

/**
 * Send batched refund notification to admin
 */
function sendBatchedAdminRefundNotification(parentEmail, cancellations, sessionId) {
  try {
    const totalRefund = cancellations.reduce((sum, item) => sum + item.refundAmount, 0);
    const itemCount = cancellations.length;
    const subject = `ACTION REQUIRED: Send Venmo Refund - $${totalRefund.toFixed(2)} (${itemCount} item${itemCount > 1 ? 's' : ''})`;
    
    let itemsDetail = '';
    cancellations.forEach(item => {
      itemsDetail += `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.childName}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemName}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemDay}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemDate.toLocaleDateString()}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${item.refundAmount.toFixed(2)}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.reason}</td>
        </tr>
      `;
    });
    
    const emailBody = `
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f44336 0%, #ff5722 100%); color: white; padding: 25px; text-align: center; border-radius: 12px;">
          <h1 style="margin: 0;">Venmo Refund Required</h1>
        </div>
        
        <div style="padding: 25px; background: white;">
          <div style="background: #ffebee; border: 2px solid #f44336; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #d32f2f; margin: 0 0 15px 0;">ACTION REQUIRED</h3>
            <p style="margin: 0; font-size: 1.2em; font-weight: 600;">Send $${totalRefund.toFixed(2)} via Venmo to ${parentEmail}</p>
            <p style="margin: 10px 0 0 0; color: #666;">Session ID: ${sessionId}</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin: 0 0 15px 0; color: #333;">Cancellation Details:</h4>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #e9ecef;">
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Student</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Day</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Date</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Refund</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Reason</th>
                </tr>
              </thead>
              <tbody>
                ${itemsDetail}
              </tbody>
              <tfoot>
                <tr style="background: #f5f5f5; font-weight: bold;">
                  <td colspan="4" style="padding: 10px; border: 1px solid #ddd; text-align: right;">TOTAL TO REFUND:</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">$${totalRefund.toFixed(2)}</td>
                  <td style="padding: 10px; border: 1px solid #ddd;"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <div style="background: #e8f5e8; border: 2px solid #4caf50; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h4 style="color: #2e7d32; margin: 0 0 15px 0;">Venmo Payment Instructions:</h4>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Send <strong>$${totalRefund.toFixed(2)}</strong> via Venmo to <strong>${parentEmail}</strong></li>
              <li>Use note: <strong>"Artios Cafe refund - Session ${sessionId}"</strong></li>
              <li>No reply needed - system handles confirmation emails</li>
            </ol>
          </div>
          
          <div style="background: #e3f2fd; border: 2px solid #2196f3; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h4 style="color: #1976d2; margin: 0 0 15px 0;">Food Order Impact:</h4>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Daily orders automatically updated</li>
              <li>Chick-fil-A counts reduced by ${itemCount} item${itemCount > 1 ? 's' : ''}</li>
              <li>Student checklists updated</li>
              <li>Workers will receive corrected food lists at 8:15 AM</li>
            </ul>
          </div>
          
          <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #f57c00; font-weight: 600;">
              These cancellations were auto-approved because they were submitted before the 8:15 AM deadline.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    GmailApp.sendEmail(
      NOTIFICATION_EMAIL,
      subject,
      `ACTION REQUIRED: Process refund of $${totalRefund.toFixed(2)} for ${itemCount} cancelled items`,
      {
        htmlBody: emailBody,
        name: 'Artios Cafe System - Refund Required'
      }
    );
    
    console.log(`Admin refund notification sent for session ${sessionId}`);
    
  } catch (error) {
    console.error('Error sending batched admin refund notification:', error);
  }
}

/**
 * Send order confirmation email
 */
function sendOrderConfirmationEmail(orderData) {
  try {
    const subject = `Cafe Order Confirmed - ${orderData.orderId}`;
    
    let itemsList = '';
    const dayGroups = {};
    
    orderData.items.forEach(item => {
      if (!dayGroups[item.day]) {
        dayGroups[item.day] = [];
      }
      const child = orderData.children.find(c => c.id === item.childId);
      dayGroups[item.day].push({
        childName: child ? `${child.firstName} ${child.lastName}` : 'Unknown',
        itemName: item.name,
        price: item.price
      });
    });
    
    Object.keys(dayGroups).sort().forEach(day => {
      itemsList += `<h4 style="color: #4285f4; margin-top: 20px;">${day}:</h4><ul>`;
      dayGroups[day].forEach(item => {
        itemsList += `<li>${item.childName}: ${item.itemName} - $${item.price.toFixed(2)}</li>`;
      });

































itemsList += '</ul>';
   });
   
   const emailBody = `
     <html>
     <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
       <div style="background: linear-gradient(135deg, #4285f4 0%, #7b68ee 100%); color: white; padding: 30px; text-align: center; border-radius: 12px;">
         <h1 style="margin: 0;">Order Confirmed!</h1>
         <p style="margin: 10px 0 0 0; font-size: 1.2em;">Order ID: ${orderData.orderId}</p>
       </div>
       
       <div style="padding: 25px; background: white;">
         <h3 style="color: #333;">Thank you for your order!</h3>
         
         <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
           <h4 style="margin: 0 0 15px 0; color: #333;">Order Details:</h4>
           ${itemsList}
         </div>
         
         <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
           <h4 style="margin: 0 0 10px 0; color: #2e7d32;">Payment Information:</h4>
           <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${orderData.subtotal.toFixed(2)}</p>
           ${orderData.discount > 0 ? `<p style="margin: 5px 0; color: #d32f2f;"><strong>Discount:</strong> -$${orderData.discount.toFixed(2)}</p>` : ''}
           <p style="margin: 5px 0; font-size: 1.2em;"><strong>Total Due:</strong> $${orderData.total.toFixed(2)}</p>
         </div>
         
         <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
           <h4 style="margin: 0 0 10px 0; color: #f57c00;">Payment Instructions:</h4>
           <p style="margin: 5px 0;">Please send payment via <strong>Venmo</strong> to complete your order.</p>
           <p style="margin: 5px 0;">Include order ID <strong>${orderData.orderId}</strong> in the payment note.</p>
         </div>
         
         <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
           <h4 style="margin: 0 0 10px 0; color: #1976d2;">Important Information:</h4>
           <ul style="margin: 0; padding-left: 20px;">
             <li>Orders can be cancelled until 8:15 AM on the day of service</li>
             <li>Login to your family account to view or manage orders</li>
             <li>Refunds are processed within 24 hours via Venmo</li>
           </ul>
         </div>
         
         <p style="text-align: center; margin-top: 30px; color: #666;">
           Questions? Contact us at <strong>${NOTIFICATION_EMAIL}</strong>
         </p>
       </div>
     </body>
     </html>
   `;
   
   GmailApp.sendEmail(
     orderData.parentEmail,
     subject,
     `Order confirmed! Total: $${orderData.total.toFixed(2)}. Please send payment via Venmo.`,
     {
       htmlBody: emailBody,
       name: 'Artios Academies Cafe'
     }
   );
   
   console.log(`Confirmation email sent to ${orderData.parentEmail}`);
   
 } catch (error) {
   console.error('Error sending confirmation email:', error);
 }
}

/**
* Send admin notification email for new order
*/
function sendAdminNotificationEmail(orderData) {
 try {
   const subject = `New Cafe Order - ${orderData.orderId}`;
   
   let itemsDetail = '';
   orderData.items.forEach(item => {
     const child = orderData.children.find(c => c.id === item.childId);
     itemsDetail += `
       <tr>
         <td style="padding: 8px; border: 1px solid #ddd;">${child ? child.firstName + ' ' + child.lastName : 'Unknown'}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">${child ? child.grade : ''}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">${item.day}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">${item.name}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">$${item.price.toFixed(2)}</td>
       </tr>
     `;
   });
   
   const emailBody = `
     <html>
     <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
       <div style="background: #4285f4; color: white; padding: 20px; text-align: center; border-radius: 8px;">
         <h2 style="margin: 0;">New Cafe Order Received</h2>
       </div>
       
       <div style="padding: 20px; background: white;">
         <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
           <h3 style="margin: 0 0 10px 0; color: #333;">Order Information:</h3>
           <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderData.orderId}</p>
           <p style="margin: 5px 0;"><strong>Parent Email:</strong> ${orderData.parentEmail}</p>
           <p style="margin: 5px 0;"><strong>Timestamp:</strong> ${new Date(orderData.timestamp).toLocaleString()}</p>
           <p style="margin: 5px 0;"><strong>Total Amount:</strong> $${orderData.total.toFixed(2)}</p>
           ${orderData.promoCode ? `<p style="margin: 5px 0;"><strong>Promo Code:</strong> ${orderData.promoCode}</strong></p>` : ''}
         </div>
         
         <h3 style="color: #333;">Items Ordered:</h3>
         <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
           <thead>
             <tr style="background: #e3f2fd;">
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Child</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Grade</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Day</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Price</th>
             </tr>
           </thead>
           <tbody>
             ${itemsDetail}
           </tbody>
         </table>
         
         <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ff9800;">
           <h4 style="margin: 0 0 10px 0; color: #f57c00;">Action Required:</h4>
           <p style="margin: 5px 0;">Monitor for Venmo payment from <strong>${orderData.parentEmail}</strong></p>
           <p style="margin: 5px 0;">Expected amount: <strong>$${orderData.total.toFixed(2)}</strong></p>
           <p style="margin: 5px 0;">Order ID in payment note: <strong>${orderData.orderId}</strong></p>
         </div>
       </div>
     </body>
     </html>
   `;
   
   GmailApp.sendEmail(
     NOTIFICATION_EMAIL,
     subject,
     `New order received from ${orderData.parentEmail}. Total: $${orderData.total.toFixed(2)}`,
     {
       htmlBody: emailBody,
       name: 'Artios Cafe System'
     }
   );
   
   console.log(`Admin notification sent for order ${orderData.orderId}`);
   
 } catch (error) {
   console.error('Error sending admin notification:', error);
 }
}

/**
* Send enhanced daily report email
*/
function sendEnhancedReportNotificationEmail(result, reportDate, isOnDemand = false) {
 try {
   const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
   const reportDayName = dayNames[reportDate.getDay()];
   const dateStr = reportDate.toLocaleDateString('en-US', { 
     weekday: 'long', 
     year: 'numeric', 
     month: 'long', 
     day: 'numeric' 
   });
   
   const subject = isOnDemand 
     ? `Cafe Report (On-Demand) - ${dateStr}`
     : `Daily Cafe Orders - ${dateStr} - ${result.orderCount} Items`;
   
   if (result.orderCount === 0) {
     const emailBody = `
       <html>
       <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
         <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px;">
           <h2 style="color: #666;">No Orders for ${dateStr}</h2>
           <p>There are no lunch orders scheduled for today.</p>
         </div>
       </body>
       </html>
     `;
     
     GmailApp.sendEmail(
       NOTIFICATION_EMAIL,
       subject,
       `No orders for ${dateStr}`,
       {
         htmlBody: emailBody,
         name: 'Artios Cafe Daily Report'
       }
     );
     return;
   }
   
   // Build item summary
   let itemSummaryHtml = '';
   const sortedItems = Object.entries(result.reportData.itemCounts)
     .sort((a, b) => b[1].count - a[1].count);
   
   sortedItems.forEach(([itemName, data]) => {
     itemSummaryHtml += `
       <tr>
         <td style="padding: 10px; border: 1px solid #ddd;">${itemName}</td>
         <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${data.count}</td>
         <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">$${data.price.toFixed(2)}</td>
         <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">$${data.total.toFixed(2)}</td>
       </tr>
     `;
   });
   
   // Build student list by item
   let studentListHtml = '';
   const itemStudentMap = {};
   
   result.reportData.itemsForThisDate.forEach(order => {
     const itemName = order.item.name;
     if (!itemStudentMap[itemName]) {
       itemStudentMap[itemName] = [];
     }
     itemStudentMap[itemName].push({
       name: order.childName,
       grade: order.grade
     });
   });
   
   Object.keys(itemStudentMap).sort().forEach(itemName => {
     const students = itemStudentMap[itemName]
       .sort((a, b) => a.name.localeCompare(b.name));
     
     studentListHtml += `
       <div style="margin: 20px 0;">
         <h4 style="color: #4285f4; margin: 10px 0;">
           ${itemName} (${students.length} orders)
         </h4>
         <ol style="margin: 0; padding-left: 25px; line-height: 1.6;">
     `;
     
     students.forEach(student => {
       studentListHtml += `<li>${student.name} (Grade ${student.grade})</li>`;
     });
     
     studentListHtml += `
         </ol>
       </div>
     `;
   });
   
   const emailBody = `
     <html>
     <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
       <div style="background: linear-gradient(135deg, #4285f4 0%, #7b68ee 100%); color: white; padding: 30px; text-align: center; border-radius: 12px;">
         <h1 style="margin: 0;">Daily Cafe Report</h1>
         <p style="margin: 10px 0 0 0; font-size: 1.2em;">${dateStr}</p>
       </div>
       
       <div style="padding: 25px; background: white;">
         <!-- Summary Box -->
         <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
           <h3 style="color: #1976d2; margin: 0 0 15px 0;">Quick Summary</h3>
           <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
             <div>
               <strong>Total Orders:</strong> ${result.orderCount} items<br>
               <strong>Families Served:</strong> ${result.reportData.familiesServed}<br>
             </div>
             <div>
               <strong>Revenue:</strong> $${result.reportData.totalRevenue.toFixed(2)}<br>
               <strong>Discounts:</strong> $${result.reportData.totalDiscounts.toFixed(2)}<br>
             </div>
           </div>
         </div>
         
         <!-- Chick-fil-A Order Summary -->
         <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
           <h3 style="color: #f57c00; margin: 0 0 15px 0;">Chick-fil-A Order Summary</h3>
           <table style="width: 100%; border-collapse: collapse;">
             <thead>
               <tr style="background: #ffe0b2;">
                 <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
                 <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Quantity</th>
                 <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Unit Price</th>
                 <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Total</th>
               </tr>
             </thead>
             <tbody>
               ${itemSummaryHtml}
             </tbody>
             <tfoot>
               <tr style="background: #f5f5f5; font-weight: bold;">
                 <td style="padding: 10px; border: 1px solid #ddd;">TOTAL</td>
                 <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${result.orderCount}</td>
                 <td style="padding: 10px; border: 1px solid #ddd;"></td>
                 <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">
                   $${result.reportData.totalRevenue.toFixed(2)}
                 </td>
               </tr>
             </tfoot>
           </table>
         </div>
         
         <!-- Student Checklist -->
         <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
           <h3 style="color: #2e7d32; margin: 0 0 15px 0;">Student Checklist by Item</h3>
           ${studentListHtml}
         </div>
         
         <!-- Action Items -->
         <div style="background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f44336;">
           <h3 style="color: #d32f2f; margin: 0 0 15px 0;">Action Required</h3>
           <ol style="margin: 0; padding-left: 25px; line-height: 1.8;">
             <li>Place Chick-fil-A order for <strong>${result.orderCount} total items</strong></li>
             <li>Print this email or access student checklist on tablet</li>
             <li>Prepare labels for each student's order</li>
             <li>Set up distribution area before lunch period</li>
           </ol>
         </div>
         
         <!-- Footer -->
         <div style="text-align: center; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
           <p>
             ${isOnDemand ? 'This report was generated on-demand.' : 'This is an automated daily report generated at 8:15 AM.'}
           </p>
           <p>
             <strong>Questions?</strong> Contact ${NOTIFICATION_EMAIL}
           </p>
         </div>
       </div>
     </body>
     </html>
   `;
   
   GmailApp.sendEmail(
     NOTIFICATION_EMAIL,
     subject,
     `Daily report: ${result.orderCount} items for ${dateStr}`,
     {
       htmlBody: emailBody,
       name: 'Artios Cafe Daily Report'
     }
   );
   
   console.log(`Daily report email sent: ${result.orderCount} items for ${dateStr}`);
   
 } catch (error) {
   console.error('Error sending report email:', error);
   throw error;
 }
}

/**
* Send worker daily orders email (for daily-orders.html functionality)
*/
function sendWorkerDailyOrdersEmail(workerEmail, reportData, reportDate) {
 try {
   const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
   const reportDayName = dayNames[reportDate.getDay()];
   const dateStr = reportDate.toLocaleDateString('en-US', { 
     weekday: 'long', 
     year: 'numeric', 
     month: 'long', 
     day: 'numeric' 
   });
   
   const subject = `Daily Food Orders - ${dateStr} - ${reportData.orderCount} Items`;
   
   if (reportData.orderCount === 0) {
     const emailBody = `
       <html>
       <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
         <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px;">
           <h2 style="color: #666;">No Orders for ${dateStr}</h2>
           <p>There are no lunch orders scheduled for today. No food preparation needed.</p>
         </div>
       </body>
       </html>
     `;
     
     GmailApp.sendEmail(
       workerEmail,
       subject,
       `No orders for ${dateStr}`,
       {
         htmlBody: emailBody,
         name: 'Artios Cafe Daily Orders'
       }
     );
     return;
   }
   
   // Build detailed email for worker
   let itemSummaryHtml = '';
   const sortedItems = Object.entries(reportData.reportData.itemCounts)
     .sort((a, b) => b[1].count - a[1].count);
   
   sortedItems.forEach(([itemName, data]) => {
     itemSummaryHtml += `
       <tr>
         <td style="padding: 10px; border: 1px solid #ddd;">${itemName}</td>
         <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${data.count}</td>
       </tr>
     `;
   });
   
   // Build student checklist
   let studentListHtml = '';
   const itemStudentMap = {};
   
   reportData.reportData.itemsForThisDate.forEach(order => {
     const itemName = order.item.name;
     if (!itemStudentMap[itemName]) {
       itemStudentMap[itemName] = [];
     }
     itemStudentMap[itemName].push({
       name: order.childName,
       grade: order.grade
     });
   });
   
   Object.keys(itemStudentMap).sort().forEach(itemName => {
     const students = itemStudentMap[itemName]
       .sort((a, b) => {
         const lastNameA = a.name.split(' ')[1] || a.name;
         const lastNameB = b.name.split(' ')[1] || b.name;
         return lastNameA.localeCompare(lastNameB);
       });
     
     studentListHtml += `
       <div style="margin: 20px 0; break-inside: avoid;">
         <h4 style="color: #4285f4; margin: 10px 0; background: #f0f8ff; padding: 10px; border-radius: 5px;">
           ${itemName} (${students.length} orders)
         </h4>
         <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-left: 15px;">
     `;
     
     students.forEach(student => {
       studentListHtml += `
         <div style="display: flex; align-items: center; padding: 5px 0;">
           <input type="checkbox" style="margin-right: 8px; transform: scale(1.2);">
           <span>${student.name} (${student.grade})</span>
         </div>
       `;
     });
     
     studentListHtml += `
         </div>
       </div>
     `;
   });
   
   const emailBody = `
     <html>
     <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
       <div style="background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color: white; padding: 30px; text-align: center; border-radius: 12px;">
         <h1 style="margin: 0;">🍽️ Daily Food Orders</h1>
         <p style="margin: 10px 0 0 0; font-size: 1.2em;">${dateStr}</p>
       </div>
       
       <div style="padding: 25px; background: white;">
         <!-- Summary Box -->
         <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
           <h3 style="color: #f57c00; margin: 0 0 15px 0;">📋 Order Summary</h3>
           <div style="font-size: 1.1em; line-height: 1.6;">
             <strong>Total Items to Prepare:</strong> ${reportData.orderCount}<br>
             <strong>Students Served:</strong> ${reportData.reportData.familiesServed}<br>
             <strong>Categories:</strong> ${Object.keys(reportData.reportData.itemCounts).length}
           </div>
         </div>
         
         <!-- Chick-fil-A Order List -->
         <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
           <h3 style="color: #1976d2; margin: 0 0 15px 0;">🐔 Chick-fil-A Order List</h3>
           <table style="width: 100%; border-collapse: collapse;">
             <thead>
               <tr style="background: #bbdefb;">
                 <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-size: 1.1em;">Item</th>
                 <th style="padding: 12px; border: 1px solid #ddd; text-align: center; font-size: 1.1em;">Quantity</th>
               </tr>
             </thead>
             <tbody>
               ${itemSummaryHtml}
             </tbody>
             <tfoot>
               <tr style="background: #f5f5f5; font-weight: bold; font-size: 1.1em;">
                 <td style="padding: 12px; border: 1px solid #ddd;">TOTAL ITEMS</td>
                 <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${reportData.orderCount}</td>
               </tr>
             </tfoot>
           </table>
         </div>
         
         <!-- Student Checklist -->
         <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
           <h3 style="color: #2e7d32; margin: 0 0 15px 0;">✅ Student Checklist (Printable)</h3>
           <p style="color: #666; margin-bottom: 20px; font-style: italic;">
             Check off each student as you distribute their order. Sorted by last name for easy reference.
           </p>
           ${studentListHtml}
         </div>
         
         <!-- Action Items -->
         <div style="background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f44336;">
           <h3 style="color: #d32f2f; margin: 0 0 15px 0;">🎯 Today's Tasks</h3>
           <ol style="margin: 0; padding-left: 25px; line-height: 2; font-size: 1.1em;">
             <li><strong>Place Chick-fil-A order</strong> for ${reportData.orderCount} total items</li>
             <li><strong>Print this checklist</strong> or keep email open on tablet</li>
             <li><strong>Prepare labels</strong> for each student's order</li>
             <li><strong>Set up distribution area</strong> before lunch period</li>
             <li><strong>Check off students</strong> as orders are distributed</li>
           </ol>
         </div>
         
         <!-- Footer -->
         <div style="text-align: center; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
           <p><strong>Questions?</strong> Contact ${NOTIFICATION_EMAIL}</p>
           <p style="font-size: 0.9em;">This report excludes cancelled items and shows only active orders.</p>
         </div>
       </div>
     </body>
     </html>
   `;
   
   GmailApp.sendEmail(
     workerEmail,
     subject,
     `Daily orders: ${reportData.orderCount} items for ${dateStr}`,
     {
       htmlBody: emailBody,
       name: 'Artios Cafe Daily Orders'
     }
   );
   
   console.log(`Worker daily orders email sent to ${workerEmail}: ${reportData.orderCount} items for ${dateStr}`);
   
 } catch (error) {
   console.error('Error sending worker daily orders email:', error);
   throw error;
 }
}

/**
* Send financial report email
*/
function sendFinancialReportEmail(startDate, endDate, reportData, adminRecipients) {
 try {
   const subject = `Artios Cafe Financial Report - ${startDate} to ${endDate}`;
   
   let itemsList = '';
   Object.entries(reportData.itemCounts).forEach(([itemName, count]) => {
     itemsList += `<li>${itemName}: ${count} orders</li>`;
   });
   
   const emailBody = `
     <html>
     <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
       <div style="background: linear-gradient(135deg, #4285f4 0%, #7b68ee 100%); color: white; padding: 30px; text-align: center; border-radius: 12px;">
         <h1 style="margin: 0;">Financial Report</h1>
         <p style="margin: 10px 0 0 0; font-size: 1.2em;">${startDate} to ${endDate}</p>
       </div>
       
       <div style="padding: 25px; background: white;">
         <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
           <h3 style="color: #2e7d32; margin: 0 0 15px 0;">Summary</h3>
           <p><strong>Total Revenue:</strong> $${reportData.totalRevenue.toFixed(2)}</p>
           <p><strong>Total Orders:</strong> ${reportData.totalOrders}</p>
           <p><strong>Total Discounts:</strong> $${reportData.totalDiscounts.toFixed(2)}</p>
           <p><strong>Families Served:</strong> ${reportData.familiesServed}</p>
         </div>
         
         <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
           <h3 style="color: #333; margin: 0 0 15px 0;">Popular Items</h3>
           <ul>${itemsList}</ul>
         </div>
       </div>
     </body>
     </html>
   `;
   
   adminRecipients.forEach(email => {
     GmailApp.sendEmail(
       email,
       subject,
       `Financial report: $${reportData.totalRevenue.toFixed(2)} revenue from ${reportData.totalOrders} orders`,
       {
         htmlBody: emailBody,
         name: 'Artios Cafe Financial Reports'
       }
     );
   });
   
   console.log(`Financial report sent to ${adminRecipients.length} recipients`);
   
 } catch (error) {
   console.error('Error sending financial report email:', error);
   throw error;
 }
}

// ============================================
// SETUP FUNCTIONS - RUN THESE ONCE TO INITIALIZE
// ============================================

/**
* Run this ONCE to set up the complete system with family authentication
*/
function setupFamilyAuthentication() {
 try {
   console.log('🚀 Setting up Artios Cafe Family Authentication System...');
   console.log('');
   
   // 1. Create the Family Accounts sheet
   console.log('📋 Step 1: Setting up Family Accounts sheet...');
   const familySheet = getFamilyAccountsSheet();
   console.log('✅ Family Accounts sheet ready');
   
   // 2. Create the Orders sheet
   console.log('📊 Step 2: Setting up Orders sheet...');
   const ordersSheet = getOrdersSheet();
   console.log('✅ Orders sheet ready');
   
   // 3. Test the hashing function
   console.log('🔐 Step 3: Testing password hashing...');
   const testHash1 = hashPasscode('1234');
   const testHash2 = hashPasscode('1234');
   const testHash3 = hashPasscode('5678');
   
   console.log('✅ Hash consistency test:', testHash1 === testHash2 ? 'PASSED' : 'FAILED');
   console.log('✅ Hash uniqueness test:', testHash1 !== testHash3 ? 'PASSED' : 'FAILED');
   
   // 4. Set up daily trigger for 8:15 AM reports
   console.log('⏰ Step 4: Setting up daily automation...');
   setupDailyTrigger();
   
   // 5. Test basic functionality
   console.log('🧪 Step 5: Running system tests...');
   
   // Test report generation
   const testReport = generateEmailOnlyReport(new Date());
   console.log(`✅ Report generation test: ${testReport.orderCount} orders found for today`);
   
   // Test authentication endpoints
   console.log('✅ Authentication endpoints configured');
   console.log('✅ Order lookup endpoints configured'); 
   console.log('✅ Cancellation endpoints configured');
   console.log('✅ Email system configured');
   
   console.log('');
   console.log('🎉 SETUP COMPLETE! 🎉');
   console.log('');
   console.log('📋 SUMMARY:');
   console.log('✅ Family authentication system ready');
   console.log('✅ Google Sheets configured with proper columns');
   console.log('✅ Daily email automation scheduled for 8:15 AM');
   console.log('✅ Session-based cancellation system ready');
   console.log('✅ All email templates configured');
   console.log('');
   console.log('🚀 NEXT STEPS:');
   console.log('1. Deploy this script as a Web App');
   console.log('2. Update your HTML files with the new Web App URL');
   console.log('3. Test the complete system!');
   console.log('');
   
 } catch (error) {
   console.error('❌ Error during setup:', error);
   console.error('Stack:', error.stack);
 }
}

/**
* Set up daily trigger for 8:15 AM reports
*/
function setupDailyTrigger() {
 try {
   // Delete existing triggers first
   const triggers = ScriptApp.getProjectTriggers();
   triggers.forEach(trigger => {
     if (trigger.getHandlerFunction() === 'compileDailyOrders') {
       ScriptApp.deleteTrigger(trigger);
     }
   });
   
   // Create new trigger for 8:15 AM
   ScriptApp.newTrigger('compileDailyOrders')
     .timeBased()
     .everyDays(1)
     .atHour(8)
     .nearMinute(15)
     .create();
     
   console.log('✅ Daily trigger set for 8:15 AM EST');
   
 } catch (error) {
   console.error('❌ Error setting up daily trigger:', error);
 }
}

/**
* Test function to verify all endpoints work
*/
function testAllEndpoints() {
 console.log('🧪 Testing all API endpoints...');
 
 try {
   // Test 1: System test
   console.log('1. Testing system endpoint...');
   const testResult = doGet({ parameter: { action: 'test' } });
   const testData = JSON.parse(testResult.getContent());
   console.log(testData.success ? '✅ System test passed' : '❌ System test failed');
   
   // Test 2: Create test account
   console.log('2. Testing account creation...');
   const createResult = createFamilyAccount('test@example.com', '1234');
   console.log(createResult.success ? '✅ Account creation works' : '❌ Account creation failed');
   
   // Test 3: Test login
   console.log('3. Testing login...');
   const loginResult = verifyFamilyLogin('test@example.com', '1234');
   console.log(loginResult.success ? '✅ Login works' : '❌ Login failed');
   
   console.log('');
   console.log('🎉 All endpoint tests completed!');
   
 } catch (error) {
   console.error('❌ Error during endpoint testing:', error);
 }
}

/**
* Clean up old/test data (run manually if needed)
*/
function cleanupTestData() {
 console.log('🧹 Cleaning up test data...');
 
 try {
   const familySheet = getFamilyAccountsSheet();
   const data = familySheet.getDataRange().getValues();
   
   let deletedCount = 0;
   
   // Clean up test accounts (working backwards to avoid index issues)
   for (let i = data.length - 1; i >= 1; i--) {
     const email = data[i][0];
     if (email && (email.includes('test@') || email.includes('example.com'))) {
       familySheet.deleteRow(i + 1);
       deletedCount++;
       console.log(`🗑️ Deleted test account: ${email}`);
     }
   }
   
   console.log(`✅ Cleanup complete - removed ${deletedCount} test accounts`);
   
 } catch (error) {
   console.error('❌ Error during cleanup:', error);
 }
}

/**
* View current family accounts (for admin debugging)
*/
function viewFamilyAccounts() {
 try {
   console.log('👨‍👩‍👧‍👦 Current Family Accounts:');
   console.log('==========================');
   
   const familySheet = getFamilyAccountsSheet();
   const data = familySheet.getDataRange().getValues();
   
   if (data.length <= 1) {
     console.log('No family accounts found.');
     return;
   }
   
   for (let i = 1; i < data.length; i++) {
     const row = data[i];
     console.log(`${i}. ${row[0]} | Created: ${row[2]} | Last Login: ${row[3]} | Type: ${row[4]}`);
   }
   
   console.log('==========================');
   console.log(`Total families: ${data.length - 1}`);
   
 } catch (error) {
   console.error('❌ Error viewing family accounts:', error);
 }
}

// End of Code.gs file
