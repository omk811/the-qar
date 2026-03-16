/**
 * ═══════════════════════════════════════════════════════════════
 *  Google Apps Script — بوابة مدرسة ذي قار للتعليم الأساسي
 *  الإصدار: 2.0 | ١٤٤٦هـ
 * ═══════════════════════════════════════════════════════════════
 *
 *  طريقة النشر:
 *  1. افتح Google Sheets ← Extensions ← Apps Script
 *  2. الصق هذا الكود كاملاً
 *  3. Deploy ← New Deployment ← Web App
 *  4. Execute as: Me | Who has access: Anyone
 *  5. انسخ رابط الـ Web App وضعه في الموقع
 *
 * ═══════════════════════════════════════════════════════════════
 */

// ── أسماء أوراق العمل ──────────────────────────────────────────
var SHEET_MESSAGES     = 'رسائل أولياء الأمور';
var SHEET_ARCHIVE      = 'الأرشيف';
var SHEET_STATS        = 'الإحصائيات';

// ── إعدادات الإشعارات ──────────────────────────────────────────
var NOTIFY_EMAIL       = '';   // ← ضع بريدك الإلكتروني للإشعارات (اختياري)
var URGENT_NOTIFY      = true; // تفعيل إشعار الرسائل العاجلة فوراً

// ══════════════════════════════════════════════════════════════
//  doGet  — معالجة طلبات GET (قراءة البيانات)
// ══════════════════════════════════════════════════════════════
function doGet(e) {
  var action = e.parameter.action || 'getAll';

  try {
    var result;

    if (action === 'ping') {
      result = { ok: true, message: 'الاتصال يعمل بنجاح', time: new Date().toISOString() };

    } else if (action === 'getAll') {
      result = getAllMessages();

    } else if (action === 'getStats') {
      result = getStats();

    } else if (action === 'getNew') {
      result = getMessagesByStatus('جديدة');

    } else {
      result = { error: 'إجراء غير معروف: ' + action };
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
//  doPost  — معالجة طلبات POST (حفظ / تحديث البيانات)
// ══════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var action = data.action || 'saveMessage';
    var result;

    if (action === 'saveMessage') {
      result = saveMessage(data);

    } else if (action === 'updateStatus') {
      result = updateStatus(data.id, data.status);

    } else if (action === 'deleteMessage') {
      result = deleteMessage(data.id);

    } else if (action === 'archiveMessage') {
      result = archiveMessage(data.id);

    } else {
      result = { error: 'إجراء غير معروف: ' + action };
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ error: err.message, stack: err.stack });
  }
}

// ══════════════════════════════════════════════════════════════
//  حفظ رسالة جديدة
// ══════════════════════════════════════════════════════════════
function saveMessage(data) {
  var sheet = getOrCreateSheet(SHEET_MESSAGES);
  ensureHeaders(sheet);

  var now       = new Date();
  var ticketId  = generateTicketId(sheet);

  var row = [
    ticketId,                           // رقم المتابعة
    data.parent    || '',               // اسم ولي الأمر
    data.phone     || '',               // رقم الهاتف
    data.student   || '',               // اسم الطالب
    data.grade     || '',               // الصف
    data.section   || '',               // الشعبة
    data.type      || '',               // نوع التواصل
    data.priority  || 'عادية',          // الأولوية
    'جديدة',                            // الحالة
    data.msg       || '',               // نص الرسالة
    data.rating    || 0,                // التقييم
    Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),  // التاريخ والوقت
    ''                                  // ملاحظات المعلم
  ];

  sheet.appendRow(row);
  updateStatsSheet();

  // إشعار بريد إلكتروني للرسائل العاجلة
  if (URGENT_NOTIFY && NOTIFY_EMAIL && data.priority === 'عاجلة') {
    sendUrgentNotification(data, ticketId);
  }

  return {
    ok:       true,
    ticketId: ticketId,
    message:  'تم حفظ الرسالة بنجاح'
  };
}

// ══════════════════════════════════════════════════════════════
//  قراءة جميع الرسائل
// ══════════════════════════════════════════════════════════════
function getAllMessages() {
  var sheet = getOrCreateSheet(SHEET_MESSAGES);
  ensureHeaders(sheet);

  var data   = sheet.getDataRange().getValues();
  var rows   = [];

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0]) continue; // تخطي الصفوف الفارغة

    rows.push({
      id:       r[0],
      parent:   r[1],
      phone:    r[2],
      student:  r[3],
      grade:    r[4],
      section:  r[5],
      type:     r[6],
      priority: r[7],
      status:   r[8],
      msg:      r[9],
      rating:   r[10],
      date:     r[11] ? Utilities.formatDate(new Date(r[11]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
      note:     r[12] || '',
      rowIndex: i + 1  // للتحديث لاحقاً
    });
  }

  return {
    ok:    true,
    rows:  rows,
    total: rows.length
  };
}

// ══════════════════════════════════════════════════════════════
//  قراءة رسائل بحالة معينة
// ══════════════════════════════════════════════════════════════
function getMessagesByStatus(status) {
  var all  = getAllMessages();
  var rows = all.rows.filter(function(r) { return r.status === status; });
  return { ok: true, rows: rows, total: rows.length };
}

// ══════════════════════════════════════════════════════════════
//  تحديث حالة رسالة
// ══════════════════════════════════════════════════════════════
function updateStatus(ticketId, newStatus) {
  var sheet = getOrCreateSheet(SHEET_MESSAGES);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(ticketId)) {
      sheet.getRange(i + 1, 9).setValue(newStatus);        // العمود 9 = الحالة
      sheet.getRange(i + 1, 13).setValue(                  // ملاحظة التحديث
        'تم التحديث: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      );
      updateStatsSheet();
      return { ok: true, message: 'تم تحديث الحالة إلى: ' + newStatus };
    }
  }

  return { error: 'لم يتم العثور على رسالة برقم: ' + ticketId };
}

// ══════════════════════════════════════════════════════════════
//  حذف رسالة
// ══════════════════════════════════════════════════════════════
function deleteMessage(ticketId) {
  var sheet = getOrCreateSheet(SHEET_MESSAGES);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(ticketId)) {
      sheet.deleteRow(i + 1);
      updateStatsSheet();
      return { ok: true, message: 'تم حذف الرسالة: ' + ticketId };
    }
  }

  return { error: 'لم يتم العثور على رسالة برقم: ' + ticketId };
}

// ══════════════════════════════════════════════════════════════
//  أرشفة رسالة (نقلها إلى ورقة الأرشيف)
// ══════════════════════════════════════════════════════════════
function archiveMessage(ticketId) {
  var sheet   = getOrCreateSheet(SHEET_MESSAGES);
  var archive = getOrCreateSheet(SHEET_ARCHIVE);
  var data    = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(ticketId)) {
      var row = data[i];
      row.push(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')); // تاريخ الأرشفة
      archive.appendRow(row);
      sheet.deleteRow(i + 1);
      updateStatsSheet();
      return { ok: true, message: 'تم أرشفة الرسالة: ' + ticketId };
    }
  }

  return { error: 'لم يتم العثور على رسالة برقم: ' + ticketId };
}

// ══════════════════════════════════════════════════════════════
//  ورقة الإحصائيات
// ══════════════════════════════════════════════════════════════
function getStats() {
  var sheet = getOrCreateSheet(SHEET_MESSAGES);
  var data  = sheet.getDataRange().getValues();

  var stats = { total:0, new_:0, review:0, done:0, urgent:0, byGrade:{}, byType:{} };

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0]) continue;
    stats.total++;
    if (r[8] === 'جديدة')           stats.new_++;
    if (r[8] === 'قيد المراجعة')    stats.review++;
    if (r[8] === 'مكتملة')          stats.done++;
    if (r[7] === 'عاجلة')           stats.urgent++;
    stats.byGrade[r[4]] = (stats.byGrade[r[4]] || 0) + 1;
    stats.byType[r[6]]  = (stats.byType[r[6]]  || 0) + 1;
  }

  return { ok: true, stats: stats };
}

function updateStatsSheet() {
  try {
    var s     = getStats().stats;
    var sheet = getOrCreateSheet(SHEET_STATS);
    sheet.clearContents();

    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    sheet.getRange('A1:B1').setValues([['آخر تحديث', now]]);
    sheet.getRange('A3:B7').setValues([
      ['إجمالي الرسائل', s.total],
      ['جديدة',          s.new_],
      ['قيد المراجعة',   s.review],
      ['مكتملة',         s.done],
      ['عاجلة',          s.urgent]
    ]);

    // توزيع الصفوف
    var row = 9;
    sheet.getRange(row, 1).setValue('توزيع الصفوف');
    row++;
    for (var grade in s.byGrade) {
      sheet.getRange(row, 1, 1, 2).setValues([[grade, s.byGrade[grade]]]);
      row++;
    }

    // توزيع الأنواع
    row++;
    sheet.getRange(row, 1).setValue('توزيع الأنواع');
    row++;
    for (var type in s.byType) {
      sheet.getRange(row, 1, 1, 2).setValues([[type, s.byType[type]]]);
      row++;
    }
  } catch(e) {
    Logger.log('updateStatsSheet error: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════
//  دوال مساعدة
// ══════════════════════════════════════════════════════════════

function getOrCreateSheet(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0 || !sheet.getRange('A1').getValue()) {
    var headers = [
      'رقم المتابعة', 'اسم ولي الأمر', 'رقم الهاتف', 'اسم الطالب',
      'الصف', 'الشعبة', 'نوع التواصل', 'الأولوية', 'الحالة',
      'نص الرسالة', 'التقييم', 'التاريخ والوقت', 'ملاحظات المعلم'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
         .setBackground('#0F6E56')
         .setFontColor('#ffffff')
         .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 13, 140);
    sheet.getRange('A:A').setNumberFormat('@'); // نص عادي لعمود الرقم
  }
}

function generateTicketId(sheet) {
  var lastRow = sheet.getLastRow();
  var num     = lastRow < 1 ? 1 : lastRow; // أول رقم = 1
  var year    = new Date().getFullYear();
  return '#' + year + '-' + String(num).padStart(4, '0');
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendUrgentNotification(data, ticketId) {
  try {
    var subject = '⚠️ رسالة عاجلة من ولي أمر — ' + ticketId;
    var body =
      'مرحباً،\n\n'
    + 'وردت رسالة عاجلة إلى بوابة مدرسة ذي قار:\n\n'
    + '📌 رقم المتابعة: ' + ticketId + '\n'
    + '👤 ولي الأمر:    ' + data.parent + '\n'
    + '📞 الهاتف:       ' + (data.phone || '—') + '\n'
    + '🎓 الطالب:       ' + data.student + '\n'
    + '🏫 الصف:         الصف ' + data.grade + ' – شعبة ' + data.section + '\n'
    + '📋 النوع:        ' + data.type + '\n\n'
    + '💬 الرسالة:\n' + data.msg + '\n\n'
    + '---\n'
    + 'بوابة مدرسة ذي قار للتعليم الأساسي';

    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch(e) {
    Logger.log('sendUrgentNotification error: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════
//  تهيئة أولية — شغّلها مرة واحدة بعد النشر
// ══════════════════════════════════════════════════════════════
function initialize() {
  var sheet = getOrCreateSheet(SHEET_MESSAGES);
  ensureHeaders(sheet);
  getOrCreateSheet(SHEET_ARCHIVE);
  getOrCreateSheet(SHEET_STATS);
  Logger.log('✅ تمت التهيئة بنجاح — مدرسة ذي قار للتعليم الأساسي');
}
