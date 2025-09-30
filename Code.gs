/**
 * Artios Academies Cafe System - Google Apps Script
 * Version: 5.1 - WITH BLACKOUT DATES MANAGEMENT
 * 
 * Complete system with family authentication, order management,
 * refund calculations, and blackout dates management
 */

// ============================================
// CONFIGURATION
// ============================================

const SHEET_ID = '1vBlYUsY7lt0k4x7I_OxvjYbHvQn0hbR6HwHh_aCsHxA';
const ORDERS_SHEET = 'orders';
const FAMILY_ACCOUNTS_SHEET = 'Family_Accounts';
const CANCELLATIONS_SHEET = 'Cancellations';
const BLACKOUT_DATES_SHEET = 'Blackout_Dates';
const NOTIFICATION_EMAIL = 'CRivers@artiosacademies.com,jedaws@gmail.com';

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
    
    // Send confirmation emails (parent and admin notification only)
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
 * Complete doGet handler with JSONP support
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const callback = e.parameter.callback; // JSONP callback parameter
    console.log('doGet called with action:', action);
    
    // Helper function to return response (JSON or JSONP)
    function createResponse(data) {
      if (callback) {
        // JSONP response
        return ContentService
          .createTextOutput(`${callback}(${JSON.stringify(data)});`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } else {
        // Regular JSON response
        return ContentService
          .createTextOutput(JSON.stringify(data))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // Test endpoint
    if (action === 'test' || e.parameter.test === 'true') {
      return createResponse({
        success: true,
        message: 'Google Apps Script is working correctly!',
        timestamp: new Date().toISOString(),
        version: '5.1'
      });
    }
    
    // ============================================
    // AUTHENTICATION ENDPOINTS
    // ============================================
    
    if (action === 'verify_family_login') {
      const email = e.parameter.email;
      const passcode = e.parameter.passcode;
      
      if (!email || !passcode) {
        return createResponse({
          success: false,
          error: 'Email and passcode required'
        });
      }
      
      try {
        const result = verifyFamilyLogin(email, passcode);
        return createResponse(result);
      } catch (authError) {
        console.error('Authentication error:', authError);
        return createResponse({
          success: false,
          error: authError.toString()
        });
      }
    }
    
    if (action === 'create_family_account') {
      const email = e.parameter.email;
      const passcode = e.parameter.passcode;
      
      if (!email || !passcode) {
        return createResponse({
          success: false,
          error: 'Email and passcode required'
        });
      }
      
      try {
        const result = createFamilyAccount(email, passcode);
        return createResponse(result);
      } catch (createError) {
        console.error('Account creation error:', createError);
        return createResponse({
          success: false,
          error: createError.toString()
        });
      }
    }
    
    if (action === 'reset_passcode') {
      const email = e.parameter.email;
      
      if (!email) {
        return createResponse({
          success: false,
          error: 'Email required'
        });
      }
      
      try {
        const result = resetFamilyPasscode(email);
        return createResponse(result);
      } catch (resetError) {
        console.error('Password reset error:', resetError);
        return createResponse({
          success: false,
          error: resetError.toString()
        });
      }
    }
    
    // ============================================
    // ORDER MANAGEMENT ENDPOINTS
    // ============================================
    
    if (action === 'lookup_orders') {
      const email = e.parameter.email;
      const studentName = e.parameter.student_name;
      const orderId = e.parameter.order_id;

      if (!email && !studentName) {
        return createResponse({
          success: false,
          error: 'Email or student_name parameter required'
        });
      }

      try {
        let result;
        if (studentName) {
          // Search by student name - returns all matching orders
          result = lookupOrdersByStudentName(studentName);
        } else {
          // Search by email
          result = lookupOrders(email, orderId);
        }
        return createResponse(result);
      } catch (lookupError) {
        console.error('Lookup error:', lookupError);
        return createResponse({
          success: false,
          error: `Order lookup failed: ${lookupError.toString()}`
        });
      }
    }
    
    // Single item cancellation
    if (action === 'cancel_item') {
      const itemId = e.parameter.item_id;
      const reason = e.parameter.reason || 'Parent requested';
      
      if (!itemId) {
        return createResponse({
          success: false,
          error: 'Item ID parameter required'
        });
      }
      
      try {
        const result = processCancellation(itemId, reason);
        return createResponse(result);
      } catch (cancellationError) {
        console.error('Cancellation error:', cancellationError);
        return createResponse({
          success: false,
          error: `Cancellation failed: ${cancellationError.toString()}`
        });
      }
    }
    
    // Batch cancellation endpoint
    if (action === 'cancel_multiple_items') {
      const sessionId = e.parameter.session_id;
      const itemsParam = e.parameter.items;
      const reason = e.parameter.reason || 'Parent requested';
      const adminOverride = e.parameter.admin_override === 'true'; // Admin bypass parameter

      if (!sessionId || !itemsParam) {
        return createResponse({
          success: false,
          error: 'Session ID and items parameters required'
        });
      }

      try {
        const items = JSON.parse(itemsParam);
        const result = processBatchCancellation(items, sessionId, reason, adminOverride);
        return createResponse(result);
      } catch (batchError) {
        console.error('Batch cancellation error:', batchError);
        return createResponse({
          success: false,
          error: `Batch cancellation failed: ${batchError.toString()}`
        });
      }
    }
    
    // Migration endpoint for existing data
    if (action === 'migrate_paid_prices' && e.parameter.secret === 'cafe2025') {
      try {
        const result = migrateExistingOrdersWithPaidPrices();
        return createResponse(result);
      } catch (migrationError) {
        console.error('Migration error:', migrationError);
        return createResponse({
          success: false,
          error: `Migration failed: ${migrationError.toString()}`
        });
      }
    }
    
    // ============================================
    // DAILY CHECKLIST ENDPOINTS
    // ============================================
    
    if (action === 'get_daily_orders') {
      const date = e.parameter.date || new Date().toISOString().split('T')[0];
      
      try {
        const result = getDailyOrders(date);
        return createResponse(result);
      } catch (error) {
        console.error('Error getting daily orders:', error);
        return createResponse({
          success: false,
          error: `Failed to get daily orders: ${error.toString()}`
        });
      }
    }
    

if (action === 'update_distribution') {
  const orderId = e.parameter.order_id;
  const childId = e.parameter.child_id;
  const date = e.parameter.date; // ADD THIS LINE
  const distributed = e.parameter.distributed === 'true';
  
  try {
    const result = updateDistributionStatus(orderId, childId, date, distributed); // ADD DATE PARAMETER





        
        return createResponse(result);
      } catch (error) {
        console.error('Error updating distribution:', error);
        return createResponse({
          success: false,
          error: `Failed to update distribution: ${error.toString()}`
        });
      }
    }
    
    // ============================================
    // BLACKOUT DATES ENDPOINTS (NEW)
    // ============================================
    
    if (action === 'get_blackout_dates') {
      try {
        const result = getBlackoutDates();
        return createResponse(result);
      } catch (error) {
        console.error('Error getting blackout dates:', error);
        return createResponse({
          success: false,
          error: `Failed to get blackout dates: ${error.toString()}`
        });
      }
    }
    
    if (action === 'add_blackout_date') {
      const date = e.parameter.date;
      const reason = e.parameter.reason || 'School Closed';
      
      if (!date) {
        return createResponse({
          success: false,
          error: 'Date parameter required'
        });
      }
      
      try {
        const result = addBlackoutDate(date, reason);
        return createResponse(result);
      } catch (error) {
        console.error('Error adding blackout date:', error);
        return createResponse({
          success: false,
          error: `Failed to add blackout date: ${error.toString()}`
        });
      }
    }
    
    if (action === 'add_blackout_range') {
      const startDate = e.parameter.start_date;
      const endDate = e.parameter.end_date;
      const reason = e.parameter.reason || 'Vacation Period';
      
      if (!startDate || !endDate) {
        return createResponse({
          success: false,
          error: 'Start and end date parameters required'
        });
      }
      
      try {
        const result = addBlackoutDateRange(startDate, endDate, reason);
        return createResponse(result);
      } catch (error) {
        console.error('Error adding blackout range:', error);
        return createResponse({
          success: false,
          error: `Failed to add blackout range: ${error.toString()}`
        });
      }
    }
    
    if (action === 'remove_blackout_date') {
      const date = e.parameter.date;

      if (!date) {
        return createResponse({
          success: false,
          error: 'Date parameter required'
        });
      }

      try {
        const result = removeBlackoutDate(date);
        return createResponse(result);
      } catch (error) {
        console.error('Error removing blackout date:', error);
        return createResponse({
          success: false,
          error: `Failed to remove blackout date: ${error.toString()}`
        });
      }
    }

    // ============================================
    // FINANCIAL REPORTING ENDPOINT
    // ============================================

    if (action === 'get_all_orders_financial') {
      try {
        const result = getAllOrdersForFinancials();
        return createResponse(result);
      } catch (error) {
        console.error('Error getting financial data:', error);
        return createResponse({
          success: false,
          error: `Failed to get financial data: ${error.toString()}`
        });
      }
    }

    // Get family accounts for communications
    if (action === 'get_family_accounts') {
      try {
        const result = getFamilyAccounts();
        return createResponse(result);
      } catch (error) {
        console.error('Error getting family accounts:', error);
        return createResponse({
          success: false,
          error: `Failed to get family accounts: ${error.toString()}`
        });
      }
    }

    // ============================================
    // PAYMENT RECONCILIATION ENDPOINTS
    // ============================================

    if (action === 'get_orders_for_payment') {
      try {
        const result = getOrdersForPayment();
        return createResponse(result);
      } catch (error) {
        console.error('Error getting orders for payment:', error);
        return createResponse({
          success: false,
          error: `Failed to get orders for payment: ${error.toString()}`
        });
      }
    }

    if (action === 'update_payment_status') {
      const orderId = e.parameter.order_id;
      const status = e.parameter.status;
      const paymentDate = e.parameter.payment_date;
      const notes = e.parameter.notes;
      const adminEmail = e.parameter.admin_email;

      if (!orderId || !status) {
        return createResponse({
          success: false,
          error: 'order_id and status parameters required'
        });
      }

      try {
        const result = updatePaymentStatus(orderId, status, paymentDate, notes, adminEmail);
        return createResponse(result);
      } catch (error) {
        console.error('Error updating payment status:', error);
        return createResponse({
          success: false,
          error: `Failed to update payment status: ${error.toString()}`
        });
      }
    }

    if (action === 'bulk_update_payment_status') {
      const orderIdsParam = e.parameter.order_ids;
      const status = e.parameter.status;
      const adminEmail = e.parameter.admin_email;

      if (!orderIdsParam || !status) {
        return createResponse({
          success: false,
          error: 'order_ids and status parameters required'
        });
      }

      try {
        const orderIds = JSON.parse(orderIdsParam);
        const result = bulkUpdatePaymentStatus(orderIds, status, adminEmail);
        return createResponse(result);
      } catch (error) {
        console.error('Error bulk updating payment status:', error);
        return createResponse({
          success: false,
          error: `Failed to bulk update payment status: ${error.toString()}`
        });
      }
    }

    return createResponse({
      success: false,
      error: 'Unknown action: ' + action
    });
    
  } catch (error) {
    console.error('Error in doGet:', error);
    const callback = e.parameter.callback;
    const errorResponse = {
      success: false,
      error: error.toString()
    };
    
    if (callback) {
      return ContentService
        .createTextOutput(`${callback}(${JSON.stringify(errorResponse)});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } else {
      return ContentService
        .createTextOutput(JSON.stringify(errorResponse))
        .setMimeType(ContentService.MimeType.JSON);
    }
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
    
    console.log('Created new Family Accounts sheet');
  }
  
  return familySheet;
}

/**
 * Get or create the Orders sheet with updated structure
 */
function getOrdersSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let ordersSheet = spreadsheet.getSheetByName(ORDERS_SHEET);

  if (!ordersSheet) {
    ordersSheet = spreadsheet.insertSheet(ORDERS_SHEET);
    const headers = [
      'Order_ID','Parent_Email','Child_First_Name','Child_Last_Name','Child_Grade',
      'Items_JSON','Item_Price','Item_Paid_Price','Reserved','Timestamp','Parent_Phone','Child_ID',
      'Item_Date','Day_Name','Subtotal','Discount','Total','Promo_Code','Item_Status',
      'Cancellation_Date','Refund_Amount','Cancellation_Reason','Cancellation_Session_ID',
      'Distributed','Payment_Status','Payment_Date','Payment_Notes','Payment_Updated_By'
    ];
    ordersSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = ordersSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4285f4').setFontColor('#ffffff').setFontWeight('bold');
  } else {
    // Check if we need to add columns
    const headers = ordersSheet.getRange(1, 1, 1, ordersSheet.getLastColumn()).getValues()[0];

    // Add Item_Paid_Price if missing
    if (!headers.includes('Item_Paid_Price')) {
      ordersSheet.insertColumnAfter(7);
      ordersSheet.getRange(1, 8).setValue('Item_Paid_Price');
      ordersSheet.getRange(1, 8).setBackground('#4285f4').setFontColor('#ffffff').setFontWeight('bold');
      console.log('Added Item_Paid_Price column to existing sheet');
    }

    // Add Payment Status columns if missing
    const currentLastCol = ordersSheet.getLastColumn();
    const currentHeaders = ordersSheet.getRange(1, 1, 1, currentLastCol).getValues()[0];

    if (!currentHeaders.includes('Payment_Status')) {
      const newHeaders = ['Payment_Status', 'Payment_Date', 'Payment_Notes', 'Payment_Updated_By'];
      const startCol = currentLastCol + 1;

      ordersSheet.getRange(1, startCol, 1, newHeaders.length).setValues([newHeaders]);
      ordersSheet.getRange(1, startCol, 1, newHeaders.length)
        .setBackground('#4285f4')
        .setFontColor('#ffffff')
        .setFontWeight('bold');

      console.log('Added Payment Status columns to existing sheet');

      // Set default value "Pending" for all existing orders
      const lastRow = ordersSheet.getLastRow();
      if (lastRow > 1) {
        const statusCol = startCol; // Payment_Status column
        const statusRange = ordersSheet.getRange(2, statusCol, lastRow - 1, 1);
        const defaultValues = Array(lastRow - 1).fill(['Pending']);
        statusRange.setValues(defaultValues);
        console.log(`Set ${lastRow - 1} existing orders to Pending status`);
      }
    }
  }

  // Force column E (Child_Grade) to Plain text for the whole sheet
  ordersSheet.getRange(1, 5, ordersSheet.getMaxRows(), 1).setNumberFormat('@');

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
// ORDER LOOKUP AND CANCELLATION
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
 * Normalize any date-ish input to "YYYY-MM-DD"
 */
function normalizeDateToString(dateInput) {
  if (!dateInput) return '';
  
  // If it's already a string in YYYY-MM-DD format, return it
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateInput;
  }
  
  let d;

  if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'number') {
    try {
      d = new Date(dateInput);
    } catch (e) {
      d = new Date(NaN);
    }
  } else if (typeof dateInput === 'string') {
    // Handle various string formats
    if (dateInput.includes('T')) {
      // Already has time component
      d = new Date(dateInput);
    } else if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // YYYY-MM-DD format - add noon time to avoid timezone issues
      d = new Date(dateInput + 'T12:00:00');
    } else {
      // Try to parse as-is
      d = new Date(dateInput);
    }
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
 * Enhanced lookupOrders function with paid price handling
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
          timestamp: row[9], // Timestamp (J) - shifted by 1
          email: row[1],
          items: [],
          children: [],
          subtotal: row[14] || 0, // O - shifted by 1
          discount: row[15] || 0, // P - shifted by 1
          total: row[16] || 0,    // Q - shifted by 1
          promoCode: row[17] || '' // R - shifted by 1
        };
      }

      try {
        let itemsArray = [];
        if (row[5]) { // Items_JSON (F)
          itemsArray = typeof row[5] === 'string' ? JSON.parse(row[5]) : row[5];
        }

        if (itemsArray.length > 0) {
          const itemData = itemsArray[0];

          // Normalize date from Item_Date (M) - shifted by 1
          const normalizedDate = normalizeDateToString(row[12]);
          
          // Get original and paid prices
          const originalPrice = parseFloat(row[6]) || 0; // Item_Price (G)
          const paidPrice = (row[7] !== undefined && row[7] !== null && row[7] !== '') ? parseFloat(row[7]) : originalPrice; // Item_Paid_Price (H) with fallback

          // Status & cancellation columns - all shifted by 1
          const itemStatus = row[18] || 'active';     // S - shifted
          const cancellationDate = row[19] || null;   // T - shifted
          const refundAmount = parseFloat(row[20]) || 0; // U - shifted
          const cancellationReason = row[21] || null; // V - shifted
          const sessionId = row[22] || null;          // W - shifted

          const item = {
            id: `${currentOrderId}-${i}`,
            rowIndex: i,
            name: itemData.name,
            price: originalPrice,
            paidPrice: paidPrice,
            hasDiscount: paidPrice < originalPrice,
            day: itemData.day || row[13], // Day_Name (N) - shifted
            childId: row[11] || '1',      // Child_ID (L) - shifted
            childName: `${row[2]} ${row[3]}`.trim(),
            childFirstName: row[2],
            childLastName: row[3],
            grade: row[4],
            date: normalizedDate,
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
              id: row[11] || '1', // Child_ID - shifted
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

    // Add discount percentage to each order
    orders.forEach(order => {
      if (order.discount > 0 && order.subtotal > 0) {
        order.discountPercent = (order.discount / order.subtotal * 100).toFixed(1);
      } else {
        order.discountPercent = 0;
      }
    });

    console.log(`Found ${orders.length} orders for ${email}`);

    return { success: true, orders, count: orders.length };

  } catch (error) {
    console.error('Error in lookupOrders:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Lookup orders by student name (first or last name)
 */
function lookupOrdersByStudentName(studentName) {
  try {
    console.log(`Looking up orders for student name: ${studentName}`);

    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    const searchTerm = studentName.toLowerCase().trim();

    // Find all emails that have matching student names
    const matchedEmails = new Set();
    const orderMap = {};

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const firstName = (row[2] || '').toString().toLowerCase();
      const lastName = (row[3] || '').toString().toLowerCase();

      // Check if search term matches first or last name
      if (firstName.includes(searchTerm) || lastName.includes(searchTerm)) {
        const email = row[1]; // Parent_Email (B)
        matchedEmails.add(email);

        const currentOrderId = row[0];

        if (!orderMap[currentOrderId]) {
          orderMap[currentOrderId] = {
            orderId: currentOrderId,
            timestamp: row[9], // Timestamp (J)
            email: row[1],
            parentEmail: row[1],
            items: [],
            children: [],
            subtotal: row[14] || 0,
            discount: row[15] || 0,
            total: row[16] || 0,
            promoCode: row[17] || ''
          };
        }

        try {
          let itemsArray = [];
          if (row[5]) {
            itemsArray = typeof row[5] === 'string' ? JSON.parse(row[5]) : row[5];
          }

          if (itemsArray.length > 0) {
            const itemData = itemsArray[0];
            const normalizedDate = normalizeDateToString(row[12]);
            const originalPrice = parseFloat(row[6]) || 0;
            const paidPrice = (row[7] !== undefined && row[7] !== null && row[7] !== '') ? parseFloat(row[7]) : originalPrice;
            const itemStatus = row[18] || 'active';
            const cancellationDate = row[19] || null;
            const refundAmount = parseFloat(row[20]) || 0;
            const cancellationReason = row[21] || null;
            const sessionId = row[22] || null;

            const item = {
              id: `${currentOrderId}-${i}`,
              rowIndex: i,
              name: itemData.name,
              price: originalPrice,
              paidPrice: paidPrice,
              hasDiscount: paidPrice < originalPrice,
              category: itemData.category,
              day: itemData.day,
              orderDate: row[8],
              deliveryDate: row[12],
              childName: `${row[2]} ${row[3]}`,
              childFirstName: row[2],
              childLastName: row[3],
              childGrade: row[4],
              date: normalizedDate,
              status: itemStatus,
              cancellationDate: cancellationDate,
              refundAmount: refundAmount,
              cancellationReason: cancellationReason,
              sessionId: sessionId
            };

            orderMap[currentOrderId].items.push(item);

            const childKey = item.childName;
            if (!orderMap[currentOrderId].children.find(c => c.name === childKey)) {
              orderMap[currentOrderId].children.push({
                id: row[11] || '1',
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
    }

    const orders = Object.values(orderMap);

    // Add discount percentage to each order
    orders.forEach(order => {
      if (order.discount > 0 && order.subtotal > 0) {
        order.discountPercent = (order.discount / order.subtotal * 100).toFixed(1);
      } else {
        order.discountPercent = 0;
      }
    });

    console.log(`Found ${orders.length} orders for student name: ${studentName}`);

    return {
      success: true,
      orders,
      count: orders.length,
      matchedEmails: Array.from(matchedEmails)
    };

  } catch (error) {
    console.error('Error in lookupOrdersByStudentName:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process multiple item cancellations with discount-aware refunds
 */
function processBatchCancellation(items, sessionId, reason, adminOverride = false) {
  try {
    console.log(`Processing batch cancellation for session: ${sessionId}, items: ${items.length}, adminOverride: ${adminOverride}`);

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

      // Check if item is already cancelled (column S - shifted to 18)
      const currentStatus = row[18] || 'active';
      if (currentStatus === 'cancelled') {
        console.log(`Item ${itemId} already cancelled`);
        continue;
      }

      // Validate deadline (column M - shifted to 12) - UNLESS admin override
      let itemDateStr = row[12];
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

      // Check deadline at 10:05 AM - Admin override bypasses this check
      if (!adminOverride) {
        const cutoffTime = new Date(
          itemDate.getFullYear(),
          itemDate.getMonth(),
          itemDate.getDate(),
          10, 5, 0, 0
        );

        if (now > cutoffTime) {
          console.log(`Item ${itemId} past deadline, skipping`);
          continue;
        }
      } else {
        console.log(`Item ${itemId} - Admin override enabled, bypassing deadline check`);
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
      
      // IMPORTANT: Use paid price for refund, not original price
      const originalPrice = parseFloat(row[6]) || 0; // Item_Price (G)
      const paidPrice = (row[7] !== undefined && row[7] !== null && row[7] !== '') ? parseFloat(row[7]) : originalPrice; // Item_Paid_Price (H) with fallback
      const refundAmount = paidPrice; // Refund what they actually paid
      
      const orderId = row[0];
      const parentEmail = row[1];
      
      // Update the row with cancellation info
      const range = sheet.getRange(rowIndex + 1, 1, 1, sheet.getLastColumn());
      const updatedRow = [...row];
      
      // Ensure we have enough columns (24 with new structure)
      while (updatedRow.length < 24) {
        updatedRow.push('');
      }
      
      updatedRow[18] = 'cancelled'; // Status column (S) - shifted
      updatedRow[19] = now.toISOString(); // Cancellation date (T) - shifted
      updatedRow[20] = refundAmount; // Refund amount (U) - USING PAID PRICE
      updatedRow[21] = itemReason; // Cancellation reason (V) - shifted
      updatedRow[22] = sessionId; // Cancellation session ID (W) - shifted
      
      range.setValues([updatedRow]);
      
      // Add to cancelled items list
      cancelledItems.push({
        orderId: orderId,
        parentEmail: parentEmail,
        childName: `${row[2]} ${row[3]}`,
        itemName: itemData.name,
        itemDay: itemData.day,
        itemDate: itemDate,
        originalAmount: originalPrice,
        refundAmount: refundAmount,
        hasDiscount: paidPrice < originalPrice,
        reason: itemReason,
        cancellationDate: now
      });
      
      // Log individual cancellation
      logCancellation(orderId, itemData, refundAmount, itemReason, parentEmail);
      
      console.log(`Successfully cancelled item: ${itemData.name} for ${row[2]} ${row[3]} - Refund: $${refundAmount.toFixed(2)}`);
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
 * Save multi-child order data to Google Sheet with paid prices
 */
function saveMultiChildOrderToSheet(orderData) {
  try {
    const sheet = getOrdersSheet();

    // Calculate discount rate if applicable
    const discountRate = orderData.discount && orderData.subtotal > 0 
      ? orderData.discount / orderData.subtotal 
      : 0;

    // Build all rows first
    const rows = [];

    orderData.items.forEach(item => {
      const childId = item.childId || '1';
      const child = orderData.children.find(c => c.id === childId) || orderData.children[0];
      if (!child) return;

      // Calculate the actual paid price for this item
      const itemPaidPrice = item.price * (1 - discountRate);

      // Force grade to be treated as literal text by Sheets
      const gradeText = "'" + String(child.grade ?? '');

      rows.push([
        orderData.orderId,              // A
        orderData.parentEmail,          // B
        child.firstName || '',          // C
        child.lastName  || '',          // D
        gradeText,                      // E - TEXT, cannot be auto-dated
        JSON.stringify([item]),         // F
        item.price,                     // G - Original price
        itemPaidPrice,                  // H - NEW: Actual paid price after discount
        '',                             // I - Reserved
        orderData.timestamp,            // J
        orderData.parentPhone || '',    // K
        childId,                        // L
        item.date,                      // M
        item.day,                       // N
        orderData.subtotal,             // O
        orderData.discount || 0,        // P
        orderData.total,                // Q
        orderData.promoCode || '',      // R
        'active',                       // S - Item_Status
        '', '', '', '',                 // T-W - Cancellation fields
        'FALSE',                        // X - Distributed (default false)
        'Pending',                      // Y - Payment_Status (default pending)
        '',                             // Z - Payment_Date
        '',                             // AA - Payment_Notes
        ''                              // AB - Payment_Updated_By
      ]);
    });

    if (!rows.length) return;

    // Write in one shot
    const startRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(startRow, 1, rows.length, rows[0].length);

    // Ensure the target grade cells are text before the write
    sheet.getRange(startRow, 5, rows.length, 1).setNumberFormat('@');

    range.setValues(rows);

    // And once more after write
    sheet.getRange(startRow, 5, rows.length, 1).setNumberFormat('@');

    console.log(`Order ${orderData.orderId} saved (${rows.length} items) with paid prices and grade as TEXT.`);
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
  if (code === 'JOHN') return '25% Special Discount Applied';
  if (code === 'DAWS') return '100% Complimentary - FREE';
  return 'Discount Applied';
}

/**
 * Migration function to add paid prices to existing orders
 */
function migrateExistingOrdersWithPaidPrices() {
  try {
    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    let updatedCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const originalPrice = parseFloat(row[6]) || 0;  // Column G
      const paidPriceCell = row[7];                    // Column H
      const subtotal = parseFloat(row[14]) || 0;       // Column O (shifted)
      const discount = parseFloat(row[15]) || 0;       // Column P (shifted)
      
      // Calculate paid price and update if missing or incorrect
      if (originalPrice > 0) {
        let correctPaidPrice = originalPrice;

        if (subtotal > 0 && discount > 0) {
          const discountRate = discount / subtotal;
          correctPaidPrice = originalPrice * (1 - discountRate);
          // Round to avoid floating point issues
          correctPaidPrice = Math.round(correctPaidPrice * 100) / 100;
        }

        const currentPaidPrice = parseFloat(paidPriceCell) || 0;

        // Update if empty, or if current value doesn't match calculated value (always update to fix issues)
        if (!paidPriceCell || paidPriceCell === '' || Math.abs(currentPaidPrice - correctPaidPrice) > 0.01) {
          sheet.getRange(i + 1, 8).setValue(correctPaidPrice);
          updatedCount++;
        }
      } else if (originalPrice === 0) {
        // Free items should have 0 paid price
        const currentPaidPrice = parseFloat(paidPriceCell);
        if (currentPaidPrice !== 0) {
          sheet.getRange(i + 1, 8).setValue(0);
          updatedCount++;
        }
      }
    }
    
    console.log(`Migration completed. Updated ${updatedCount} rows with paid prices.`);
    
    return {
      success: true,
      message: `Migration completed successfully`,
      rowsUpdated: updatedCount
    };
    
  } catch (error) {
    console.error('Error in migration:', error);
    throw error;
  }
}

// ============================================
// DAILY CHECKLIST FUNCTIONS
// ============================================

/**
 * Get daily orders for the checklist page
 */
function getDailyOrders(dateStr) {
  try {
    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    
    const orders = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const itemDateStr = row[12]; // Item_Date column (M) - shifted
      const itemStatus = row[18] || 'active'; // Status column (S) - shifted
      
      // Skip cancelled items
      if (itemStatus === 'cancelled') continue;
      
      // Normalize date for comparison
      let normalizedItemDate = normalizeDateToString(itemDateStr);
      
      if (normalizedItemDate === dateStr) {
        const items = JSON.parse(row[5] || '[]');
        
        items.forEach(item => {
          orders.push({
            orderId: row[0],
            parentEmail: row[1],
            childFirstName: row[2],
            childLastName: row[3],
            childName: `${row[2]} ${row[3]}`,
            grade: row[4],
            itemName: item.name,
            itemPrice: parseFloat(row[7]) || parseFloat(row[6]) || 0, // Use paid price
            childId: row[11] || '1', // Child_ID - shifted
            total: parseFloat(row[16]) || 0, // Total - shifted
            distributed: row[23] === 'TRUE' // Column X - shifted
          });
        });
      }
    }
    
    // Sort by last name
    orders.sort((a, b) => a.childLastName.localeCompare(b.childLastName));
    
    return {
      success: true,
      date: dateStr,
      orders: orders,
      count: orders.length
    };
    
  } catch (error) {
    console.error('Error in getDailyOrders:', error);
    throw error;
  }
}

/**
 * Update distribution status for an order item
 * Updates ALL items for a specific child in an order (across all days)
 */
function updateDistributionStatus(orderId, childId, date, distributed) {
  try {
    console.log(`Updating distribution status for Order: ${orderId}, Child: ${childId}, Date: ${date}, Distributed: ${distributed}`);
    
    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    let updated = false;
    let rowsUpdated = 0;
    
    // Normalize the input date to YYYY-MM-DD format
    const normalizedInputDate = normalizeDateToString(date);
    
    // Find ALL rows matching this order, child, and date
    for (let i = 1; i < data.length; i++) {
      // Make sure we're comparing strings to strings
      const rowOrderId = String(data[i][0]);
      const rowChildId = String(data[i][11]); // Child_ID - shifted
      const rowDate = normalizeDateToString(data[i][12]); // Column M contains the date - NORMALIZE IT
      
      if (rowOrderId === String(orderId) && rowChildId === String(childId) && rowDate === normalizedInputDate) {
        // Update column X (24) with distribution status - shifted
        sheet.getRange(i + 1, 24).setValue(distributed ? 'TRUE' : 'FALSE');
        updated = true;
        rowsUpdated++;
        console.log(`Updated row ${i + 1} for ${data[i][2]} ${data[i][3]} on ${rowDate}`);
      }
    }
    
    if (updated) {
      console.log(`Successfully updated ${rowsUpdated} rows`);
      return {
        success: true,
        message: `Distribution status updated for ${rowsUpdated} items`,
        rowsUpdated: rowsUpdated
      };
    } else {
      console.log(`No matching rows found for Order: ${orderId}, Child: ${childId}, Date: ${normalizedInputDate}`);
      console.log(`Available dates for this order/child:`, data.slice(1).filter(row => 
        String(row[0]) === String(orderId) && String(row[11]) === String(childId)
      ).map(row => normalizeDateToString(row[12])));
      return {
        success: false,
        error: 'Order not found for the specified date'
      };
    }
    
  } catch (error) {
    console.error('Error updating distribution status:', error);
    throw error;
  }
}



// ============================================
// BLACKOUT DATES FUNCTIONS (NEW)
// ============================================

/**
 * Get or create the Blackout Dates sheet
 */
function getBlackoutDatesSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let blackoutSheet;
  
  try {
    blackoutSheet = spreadsheet.getSheetByName(BLACKOUT_DATES_SHEET);
  } catch (e) {
    // Create sheet if it doesn't exist
    blackoutSheet = spreadsheet.insertSheet(BLACKOUT_DATES_SHEET);
    blackoutSheet.getRange(1, 1, 1, 3).setValues([['Date', 'Reason', 'Added_By']]);
    
    // Format headers
    const headerRange = blackoutSheet.getRange(1, 1, 1, 3);
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    
    console.log('Created Blackout Dates sheet');
  }
  
  return blackoutSheet;
}

/**
 * Get all blackout dates
 */
function getBlackoutDates() {
  try {
    const blackoutSheet = getBlackoutDatesSheet();
    const data = blackoutSheet.getDataRange().getValues();
    const blackoutDates = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        blackoutDates.push({
          date: normalizeDateToString(data[i][0]),
          reason: data[i][1] || 'School Closed',
          addedBy: data[i][2] || 'Admin'
        });
      }
    }
    
    return {
      success: true,
      blackoutDates: blackoutDates
    };
    
  } catch (error) {
    console.error('Error getting blackout dates:', error);
    throw error;
  }
}

/**
 * Add a single blackout date
 */
function addBlackoutDate(dateStr, reason) {
  try {
    const blackoutSheet = getBlackoutDatesSheet();
    
    // Check if date already exists
    const existingDates = getBlackoutDates().blackoutDates;
    const normalizedDate = normalizeDateToString(dateStr);
    
    if (existingDates.some(bd => bd.date === normalizedDate)) {
      return {
        success: false,
        error: 'This date is already marked as a blackout date'
      };
    }
    
    // Add the new blackout date
    blackoutSheet.appendRow([
      normalizedDate,
      reason || 'School Closed',
      'Admin'
    ]);
    
    console.log(`Added blackout date: ${normalizedDate} - ${reason}`);
    
    return {
      success: true,
      message: 'Blackout date added successfully',
      date: normalizedDate,
      reason: reason
    };
    
  } catch (error) {
    console.error('Error adding blackout date:', error);
    throw error;
  }
}

/**
 * Add a range of blackout dates
 */
function addBlackoutDateRange(startDateStr, endDateStr, reason) {
  try {
    const blackoutSheet = getBlackoutDatesSheet();
    const startDate = new Date(startDateStr + 'T12:00:00');
    const endDate = new Date(endDateStr + 'T12:00:00');
    
    if (startDate > endDate) {
      return {
        success: false,
        error: 'End date must be after start date'
      };
    }
    
    // Get existing dates to check for duplicates
    const existingDates = getBlackoutDates().blackoutDates;
    const existingDateSet = new Set(existingDates.map(bd => bd.date));
    
    const newRows = [];
    let datesAdded = 0;
    
    // Loop through each day in the range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = normalizeDateToString(currentDate);
      
      // Only add if not already a blackout date
      if (!existingDateSet.has(dateStr)) {
        newRows.push([
          dateStr,
          reason || 'Vacation Period',
          'Admin'
        ]);
        datesAdded++;
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Add all new rows at once if any
    if (newRows.length > 0) {
      const lastRow = blackoutSheet.getLastRow();
      blackoutSheet.getRange(lastRow + 1, 1, newRows.length, 3).setValues(newRows);
    }
    
    console.log(`Added ${datesAdded} blackout dates from ${startDateStr} to ${endDateStr}`);
    
    return {
      success: true,
      message: `Added ${datesAdded} blackout dates`,
      datesAdded: datesAdded,
      startDate: startDateStr,
      endDate: endDateStr
    };
    
  } catch (error) {
    console.error('Error adding blackout date range:', error);
    throw error;
  }
}



/**
 * Remove a blackout date
 */
function removeBlackoutDate(dateStr) {
  try {
    const blackoutSheet = getBlackoutDatesSheet();
    const data = blackoutSheet.getDataRange().getValues();
    const normalizedDate = normalizeDateToString(dateStr);
    
    console.log(`Attempting to remove blackout date: ${normalizedDate}`);
    
    let rowToDelete = -1;
    
    // Find the row with this date (be more careful with comparison)
    for (let i = 1; i < data.length; i++) {
      const rowDate = normalizeDateToString(data[i][0]);
      console.log(`Comparing row ${i}: ${rowDate} with ${normalizedDate}`);
      
      if (rowDate === normalizedDate) {
        rowToDelete = i + 1; // Sheet rows are 1-indexed
        console.log(`Found match at row ${rowToDelete}`);
        break;
      }
    }
    
    if (rowToDelete === -1) {
      console.log(`Date not found: ${normalizedDate}`);
      console.log('Available dates:', data.slice(1).map(row => normalizeDateToString(row[0])));
      return {
        success: false,
        error: 'Date not found in blackout dates'
      };
    }
    
    // Delete the row
    blackoutSheet.deleteRow(rowToDelete);
    
    console.log(`Successfully removed blackout date: ${normalizedDate} from row ${rowToDelete}`);
    
    return {
      success: true,
      message: 'Blackout date removed successfully',
      date: normalizedDate
    };
    
  } catch (error) {
    console.error('Error removing blackout date:', error);
    throw error;
  }
}

// ============================================
// FINANCIAL REPORTING FUNCTION
// ============================================

/**
 * Get all orders for financial reporting
 */
function getAllOrdersForFinancials() {
  try {
    console.log('Getting all orders for financial reporting');

    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    const orderMap = {};

    // Process all rows
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const currentOrderId = row[0];

      if (!orderMap[currentOrderId]) {
        orderMap[currentOrderId] = {
          orderId: currentOrderId,
          timestamp: row[9], // Timestamp (J)
          email: row[1],
          parentEmail: row[1],
          items: [],
          children: [],
          subtotal: row[14] || 0,
          discount: row[15] || 0,
          total: row[16] || 0,
          promoCode: row[17] || ''
        };
      }

      try {
        let itemsArray = [];
        if (row[5]) {
          itemsArray = typeof row[5] === 'string' ? JSON.parse(row[5]) : row[5];
        }

        if (itemsArray.length > 0) {
          const itemData = itemsArray[0];
          const normalizedDate = normalizeDateToString(row[12]);
          const originalPrice = parseFloat(row[6]) || 0;
          const paidPrice = parseFloat(row[7]) || originalPrice;
          const itemStatus = row[18] || 'active';
          const refundAmount = parseFloat(row[20]) || 0;

          const item = {
            id: `${currentOrderId}-${i}`,
            name: itemData.name,
            price: originalPrice,
            paidPrice: paidPrice,
            category: itemData.category,
            day: itemData.day,
            date: normalizedDate,
            status: itemStatus,
            refundAmount: refundAmount,
            childName: `${row[2]} ${row[3]}`,
            childGrade: row[4]
          };

          orderMap[currentOrderId].items.push(item);

          const childKey = item.childName;
          if (!orderMap[currentOrderId].children.find(c => c.name === childKey)) {
            orderMap[currentOrderId].children.push({
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

    console.log(`Retrieved ${orders.length} orders for financial reporting`);

    return {
      success: true,
      orders: orders,
      count: orders.length
    };

  } catch (error) {
    console.error('Error in getAllOrdersForFinancials:', error);
    throw error;
  }
}

/**
 * Get all family accounts for communications
 */
function getFamilyAccounts() {
  try {
    console.log('Getting family accounts for communications');

    const familySheet = getFamilyAccountsSheet();
    const data = familySheet.getDataRange().getValues();
    const accounts = [];

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0]) { // Has email
        accounts.push({
          email: row[0],
          createdDate: row[2],
          lastLogin: row[3],
          accountType: row[4] || 'new'
        });
      }
    }

    console.log(`Retrieved ${accounts.length} family accounts`);

    return {
      success: true,
      accounts: accounts,
      count: accounts.length
    };

  } catch (error) {
    console.error('Error in getFamilyAccounts:', error);
    throw error;
  }
}

// ============================================
// PAYMENT RECONCILIATION FUNCTIONS
// ============================================

/**
 * Get all orders grouped by Order ID for payment reconciliation
 */
function getOrdersForPayment() {
  try {
    console.log('Getting orders for payment reconciliation');

    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find column indices (payment columns are at the end)
    const paymentStatusIdx = headers.indexOf('Payment_Status');
    const paymentDateIdx = headers.indexOf('Payment_Date');
    const paymentNotesIdx = headers.indexOf('Payment_Notes');

    const orderMap = {};

    // Process all rows
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const orderId = row[0];
      const itemStatus = row[18] || 'active'; // Item_Status column

      // Skip cancelled items
      if (itemStatus === 'cancelled') continue;

      if (!orderMap[orderId]) {
        orderMap[orderId] = {
          orderId: orderId,
          parentEmail: row[1],
          timestamp: row[9],
          subtotal: row[14] || 0,
          discount: row[15] || 0,
          total: row[16] || 0,
          promoCode: row[17] || '',
          paymentStatus: paymentStatusIdx >= 0 ? (row[paymentStatusIdx] || 'Pending') : 'Pending',
          paymentDate: paymentDateIdx >= 0 ? row[paymentDateIdx] : null,
          paymentNotes: paymentNotesIdx >= 0 ? row[paymentNotesIdx] : '',
          children: [],
          items: [],
          itemCount: 0,
          studentCount: 0
        };
      }

      const order = orderMap[orderId];

      // Parse items
      try {
        let itemsArray = [];
        if (row[5]) {
          itemsArray = typeof row[5] === 'string' ? JSON.parse(row[5]) : row[5];
        }

        if (itemsArray.length > 0) {
          const itemData = itemsArray[0];
          order.items.push({
            name: itemData.name,
            day: itemData.day,
            date: row[12],
            childName: `${row[2]} ${row[3]}`
          });
          order.itemCount++;

          // Track unique children
          const childKey = `${row[2]} ${row[3]}`;
          if (!order.children.find(c => c.name === childKey)) {
            order.children.push({
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

    // Convert to array and add derived fields
    const orders = Object.values(orderMap).map(order => {
      // Extract last name from first child
      let lastName = '';
      if (order.children.length > 0) {
        const nameParts = order.children[0].name.trim().split(' ');
        lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
      }

      return {
        ...order,
        lastName: lastName,
        studentCount: order.children.length,
        itemsSummary: `${order.itemCount} item${order.itemCount !== 1 ? 's' : ''} for ${order.children.length} student${order.children.length !== 1 ? 's' : ''}`
      };
    });

    console.log(`Retrieved ${orders.length} orders for payment reconciliation`);

    return {
      success: true,
      orders: orders,
      count: orders.length
    };

  } catch (error) {
    console.error('Error in getOrdersForPayment:', error);
    throw error;
  }
}

/**
 * Update payment status for a single order
 */
function updatePaymentStatus(orderId, status, paymentDate, notes, adminEmail) {
  try {
    console.log(`Updating payment status for order ${orderId} to ${status}`);

    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find column indices
    const paymentStatusIdx = headers.indexOf('Payment_Status');
    const paymentDateIdx = headers.indexOf('Payment_Date');
    const paymentNotesIdx = headers.indexOf('Payment_Notes');
    const paymentUpdatedByIdx = headers.indexOf('Payment_Updated_By');

    if (paymentStatusIdx < 0) {
      throw new Error('Payment columns not found in sheet');
    }

    let rowsUpdated = 0;

    // Update all rows for this order
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === orderId) { // Match Order_ID
        const row = i + 1; // Sheet rows are 1-indexed

        sheet.getRange(row, paymentStatusIdx + 1).setValue(status);
        sheet.getRange(row, paymentDateIdx + 1).setValue(paymentDate || new Date());
        sheet.getRange(row, paymentNotesIdx + 1).setValue(notes || '');
        sheet.getRange(row, paymentUpdatedByIdx + 1).setValue(adminEmail || 'Admin');

        rowsUpdated++;
      }
    }

    console.log(`Updated ${rowsUpdated} rows for order ${orderId}`);

    return {
      success: true,
      message: `Payment status updated for order ${orderId}`,
      rowsUpdated: rowsUpdated,
      orderId: orderId,
      status: status
    };

  } catch (error) {
    console.error('Error in updatePaymentStatus:', error);
    throw error;
  }
}

/**
 * Bulk update payment status for multiple orders
 */
function bulkUpdatePaymentStatus(orderIds, status, adminEmail) {
  try {
    console.log(`Bulk updating payment status for ${orderIds.length} orders to ${status}`);

    const sheet = getOrdersSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find column indices
    const paymentStatusIdx = headers.indexOf('Payment_Status');
    const paymentDateIdx = headers.indexOf('Payment_Date');
    const paymentNotesIdx = headers.indexOf('Payment_Notes');
    const paymentUpdatedByIdx = headers.indexOf('Payment_Updated_By');

    if (paymentStatusIdx < 0) {
      throw new Error('Payment columns not found in sheet');
    }

    const paymentDate = new Date();
    let rowsUpdated = 0;
    const orderIdsSet = new Set(orderIds);

    // Update all matching rows
    for (let i = 1; i < data.length; i++) {
      if (orderIdsSet.has(data[i][0])) { // Match Order_ID
        const row = i + 1; // Sheet rows are 1-indexed

        sheet.getRange(row, paymentStatusIdx + 1).setValue(status);
        sheet.getRange(row, paymentDateIdx + 1).setValue(paymentDate);
        sheet.getRange(row, paymentNotesIdx + 1).setValue('Bulk update');
        sheet.getRange(row, paymentUpdatedByIdx + 1).setValue(adminEmail || 'Admin');

        rowsUpdated++;
      }
    }

    console.log(`Bulk updated ${rowsUpdated} rows for ${orderIds.length} orders`);

    return {
      success: true,
      message: `Payment status updated for ${orderIds.length} orders`,
      rowsUpdated: rowsUpdated,
      ordersUpdated: orderIds.length,
      status: status
    };

  } catch (error) {
    console.error('Error in bulkUpdatePaymentStatus:', error);
    throw error;
  }
}


// ============================================
// EMAIL FUNCTIONS WITH DISCOUNT AWARENESS
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
            <li>Cancel items up to 10:00 AM on the day of service</li>
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
 * Send batched cancellation confirmation to parent with discount awareness
 */
function sendBatchedParentCancellationEmail(parentEmail, cancellations, sessionId) {
  try {
    const totalRefund = cancellations.reduce((sum, item) => sum + item.refundAmount, 0);
    const itemCount = cancellations.length;
    const subject = `Lunch Order Cancellation Confirmed - $${totalRefund.toFixed(2)} Refund`;
    
    let itemsList = '';
    cancellations.forEach(item => {
      const showDiscount = item.hasDiscount;
      
      itemsList += `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.childName}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemName}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemDay}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.itemDate.toLocaleDateString()}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">
            ${showDiscount ? 
              `<span style="text-decoration: line-through; color: #999; font-size: 0.9em;">$${item.originalAmount.toFixed(2)}</span><br>` 
              : ''}
            <strong>$${item.refundAmount.toFixed(2)}</strong>
            ${showDiscount ? '<br><span style="font-size: 0.8em; color: #4caf50;">(after discount)</span>' : ''}
          </td>
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
            <p style="margin-top: 10px; font-style: italic; color: #666;">
              Note: Refund amounts reflect the actual price paid after any discounts that were applied to your original order.
            </p>
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
 * Send batched refund notification to admin with discount details
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
         <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">
           ${item.hasDiscount ? `<strike>$${item.originalAmount.toFixed(2)}</strike><br>` : ''}
           $${item.refundAmount.toFixed(2)}
         </td>
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
           <p style="margin-top: 10px; color: #666; font-style: italic;">
             Note: Refund amounts reflect actual paid prices after any discounts.
           </p>
         </div>
         
         <div style="background: #e8f5e8; border: 2px solid #4caf50; border-radius: 8px; padding: 20px; margin: 20px 0;">
           <h4 style="color: #2e7d32; margin: 0 0 15px 0;">Venmo Payment Instructions:</h4>
           <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
             <li>Send <strong>$${totalRefund.toFixed(2)}</strong> via Venmo to <strong>${parentEmail}</strong></li>
             <li>Use note: <strong>"Artios Cafe refund - Session ${sessionId}"</strong></li>
             <li>No reply needed - system handles confirmation emails</li>
           </ol>
         </div>
         
         <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0;">
           <p style="margin: 0; color: #f57c00; font-weight: 600;">
             These cancellations were auto-approved because they were submitted before the 10:00 AM deadline.
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
* Send order confirmation email with discount details
*/
function sendOrderConfirmationEmail(orderData) {
 try {
   const subject = `Cafe Order Confirmed - ${orderData.orderId}`;
   
   // Calculate discount rate for display
   const discountRate = orderData.discount && orderData.subtotal > 0 
     ? orderData.discount / orderData.subtotal 
     : 0;
   
   let itemsList = '';
   const dayGroups = {};
   
   orderData.items.forEach(item => {
     if (!dayGroups[item.day]) {
       dayGroups[item.day] = [];
     }
     const child = orderData.children.find(c => c.id === item.childId);
     const discountedPrice = item.price * (1 - discountRate);
     dayGroups[item.day].push({
       childName: child ? `${child.firstName} ${child.lastName}` : 'Unknown',
       itemName: item.name,
       originalPrice: item.price,
       discountedPrice: discountedPrice,
       hasDiscount: discountRate > 0
     });
   });
   
   Object.keys(dayGroups).sort().forEach(day => {
     itemsList += `<h4 style="color: #4285f4; margin-top: 20px;">${day}:</h4><ul>`;
     dayGroups[day].forEach(item => {
       itemsList += `<li>${item.childName}: ${item.itemName} - `;
       if (item.hasDiscount) {
         itemsList += `<strike style="color: #999;">$${item.originalPrice.toFixed(2)}</strike> $${item.discountedPrice.toFixed(2)}`;
       } else {
         itemsList += `$${item.originalPrice.toFixed(2)}`;
       }
       itemsList += '</li>';
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
           ${orderData.discount > 0 ? `
             <p style="margin: 5px 0; color: #d32f2f;"><strong>Discount (${orderData.promoCode}):</strong> -$${orderData.discount.toFixed(2)}</p>
             <p style="margin: 5px 0; color: #666; font-style: italic; font-size: 0.9em;">
               ${getDiscountDescription(orderData.promoCode)}
             </p>
           ` : ''}
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
             <li>Orders can be cancelled until 10:00 AM on the day of service</li>
             ${orderData.discount > 0 ? '<li><strong>Refunds will be based on the discounted price you paid</strong></li>' : ''}
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
   
   const discountRate = orderData.discount && orderData.subtotal > 0 
     ? orderData.discount / orderData.subtotal 
     : 0;
   
   let itemsDetail = '';
   orderData.items.forEach(item => {
     const child = orderData.children.find(c => c.id === item.childId);
     const paidPrice = item.price * (1 - discountRate);
     itemsDetail += `
       <tr>
         <td style="padding: 8px; border: 1px solid #ddd;">${child ? child.firstName + ' ' + child.lastName : 'Unknown'}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">${child ? child.grade : ''}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">${item.day}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">${item.name}</td>
         <td style="padding: 8px; border: 1px solid #ddd;">
           ${discountRate > 0 ? `<strike>$${item.price.toFixed(2)}</strike><br>` : ''}
           $${paidPrice.toFixed(2)}
         </td>
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
           <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${orderData.subtotal.toFixed(2)}</p>
           ${orderData.discount > 0 ? `
             <p style="margin: 5px 0;"><strong>Discount (${orderData.promoCode}):</strong> -$${orderData.discount.toFixed(2)}</p>
           ` : ''}
           <p style="margin: 5px 0; font-size: 1.2em;"><strong>Total Amount:</strong> $${orderData.total.toFixed(2)}</p>
         </div>
         
         <h3 style="color: #333;">Items Ordered:</h3>
         <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
           <thead>
             <tr style="background: #e3f2fd;">
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Child</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Grade</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Day</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
               <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Price Paid</th>
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














