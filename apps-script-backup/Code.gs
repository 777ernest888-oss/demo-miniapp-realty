var SECRET_COLUMNS = [
  'Контакты собственника (ФИО, Телефон)',
  'Размер комиссии/Условия',
  'Заметки для себя (скрытые)'
];

var NUMERIC_FIELDS = [
  'price_from', 'price_to', 'area_min', 'area_max',
  'price_per_sqm', 'lat', 'lng'
];

function getPinSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange('A1').setValue('pin_hash');
    sheet.getRange('B1').setValue('');
  }
  return sheet;
}

function hashPin(pin) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
  return rawHash.map(function(byte) {
    var v = (byte < 0) ? 256 + byte : byte;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function savePinToSheet(pin) {
  var sheet = getPinSheet();
  sheet.getRange('B1').setValue(hashPin(pin));
}

function isPinCorrect(pin) {
  if (!pin) return false;
  var sheet = getPinSheet();
  var storedHash = sheet.getRange('B1').getValue();
  if (!storedHash || storedHash === '') return false;
  return hashPin(pin) === storedHash;
}

function doGet(e) {
  try {
    var pin = e.parameter.pin;
    var sheet = getPinSheet();
    var storedHash = sheet.getRange('B1').getValue();

    if (!storedHash || storedHash === '') {      return jsonResponse({ needs_setup: true });
    }

    if (!pin) {
      return jsonResponse({ needs_setup: false });
    }

    if (!isPinCorrect(pin)) {
      return jsonResponse({ error: 'Неверный PIN', unauthorized: true });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dataSheet = ss.getSheetByName('Listings');
    if (!dataSheet) {
      return jsonResponse({ error: 'Лист Listings не найден', data: [] });
    }

    var data = dataSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return jsonResponse([data[0] || []]);
    }

    var headers = data[0];
    var rows = data.slice(1);
    var activeIndex = headers.indexOf('active');

    var filteredRows = rows.filter(function(row) {
      var isActive = true;
      if (activeIndex !== -1) {
        var activeValue = row[activeIndex];
        isActive = (activeValue === true || String(activeValue).toUpperCase() === 'TRUE');
      }
      return isActive;
    });

    var secretIndexes = SECRET_COLUMNS.map(function(colName) {
      return headers.indexOf(colName);
    }).filter(function(index) {
      return index !== -1;
    });

    var cleanData = filteredRows.map(function(row) {
      return row.map(function(cell, index) {
        if (secretIndexes.indexOf(index) !== -1) {
          return '';
        }
        return cell;
      });
    });
    var response = [headers].concat(cleanData);
    return jsonResponse(response);

  } catch (error) {
    return jsonResponse({ error: 'Ошибка при чтении данных: ' + error.toString(), data: [] });
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Listings');
    if (!sheet) {
      return jsonResponse({ success: false, error: 'Лист Listings не найден' });
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var data = postData.data || {};

    if (action === 'setup_pin') {
      savePinToSheet(data.pin);
      return jsonResponse({ success: true, message: 'PIN установлен' });
    }

    if (action === 'upload_image') {
      return handleImageUpload(data);
    }

    if (!isPinCorrect(data.pin)) {
      return jsonResponse({ success: false, error: 'Неверный PIN', unauthorized: true });
    }

    if (!action || ['create', 'update', 'delete'].indexOf(action) === -1) {
      return jsonResponse({
        success: false,
        error: 'Недопустимое действие. Разрешены: create, update, delete'
      });
    }

    if (action === 'create') {
      return handleCreate(sheet, headers, data);
    } else if (action === 'update') {
      return handleUpdate(sheet, headers, data);
    } else if (action === 'delete') {
      return handleDelete(sheet, headers, data);
    }

  } catch (error) {    return jsonResponse({
      success: false,
      error: 'Ошибка при обработке запроса: ' + error.toString()
    });
  }
}

function handleImageUpload(data) {
  try {
    var imageData = data.image; // base64 данные
    var fileName = data.fileName || 'image_' + new Date().getTime() + '.jpg';
   
    // Декодируем base64
    var decodedData = Utilities.base64Decode(imageData.split(',')[1]);
    var blob = Utilities.newBlob(decodedData, 'image/jpeg', fileName);
   
    // Создаём папку "Realty Images" в Google Drive
    var folderName = 'Realty Images';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder;
   
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
   
    // Загружаем файл
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
   
    // Получаем URL для скачивания
    var downloadUrl = file.getDownloadUrl();
   
    return jsonResponse({
      success: true,
      url: downloadUrl,
      fileId: file.getId()
    });
   
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Ошибка загрузки изображения: ' + error.toString()
    });
  }
}

function handleCreate(sheet, headers, data) {
  try {    var requiredFields = ['name', 'address', 'image_main'];

    var missingFields = requiredFields.filter(function(field) {
      return !data.hasOwnProperty(field) || data[field] === '' || data[field] === null;
    });

    if (missingFields.length > 0) {
      return jsonResponse({
        success: false,
        error: 'Заполните обязательные поля: ' + missingFields.join(', ')
      });
    }

    if (!data.id) {
      var timestamp = new Date().getTime();
      data.id = 'obj-' + timestamp;
    }

    var allData = sheet.getDataRange().getValues();
    var idIndex = headers.indexOf('id');
    if (idIndex !== -1) {
      var existingIds = allData.slice(1).map(function(row) {
        return String(row[idIndex]).trim();
      });

      if (existingIds.indexOf(String(data.id).trim()) !== -1) {
        return jsonResponse({
          success: false,
          error: 'Объект с ID "' + data.id + '" уже существует.'
        });
      }
    }

    NUMERIC_FIELDS.forEach(function(field) {
      if (data.hasOwnProperty(field) && data[field] !== '' && data[field] !== null) {
        var numValue = parseFloat(data[field]);
        if (!isNaN(numValue)) {
          data[field] = numValue;
        }
      }
    });

    var newRow = headers.map(function(header) {
      if (header === 'created_at' || header === 'updated_at') {
        return new Date().toISOString();
      }
      return data.hasOwnProperty(header) ? data[header] : '';
    });

    sheet.appendRow(newRow);
    return jsonResponse({
      success: true,
      message: 'Объект успешно создан',
      id: data.id
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Ошибка при создании объекта: ' + error.toString()
    });
  }
}

function handleUpdate(sheet, headers, data) {
  try {
    if (!data.id) {
      return jsonResponse({
        success: false,
        error: 'Не указан ID объекта для обновления'
      });
    }

    var idIndex = headers.indexOf('id');
    if (idIndex === -1) {
      return jsonResponse({
        success: false,
        error: 'Колонка "id" не найдена в таблице'
      });
    }

    var allData = sheet.getDataRange().getValues();
    var rows = allData.slice(1);
    var rowIndex = -1;

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][idIndex]).trim() === String(data.id).trim()) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) {
      return jsonResponse({
        success: false,
        error: 'Объект с ID ' + data.id + ' не найден'
      });
    }
    NUMERIC_FIELDS.forEach(function(field) {
      if (data.hasOwnProperty(field) && data[field] !== '' && data[field] !== null) {
        var numValue = parseFloat(data[field]);
        if (!isNaN(numValue)) {
          data[field] = numValue;
        }
      }
    });

    headers.forEach(function(header, colIndex) {
      if (data.hasOwnProperty(header)) {
        if (header === 'updated_at') {
          sheet.getRange(rowIndex, colIndex + 1).setValue(new Date().toISOString());
        } else {
          sheet.getRange(rowIndex, colIndex + 1).setValue(data[header]);
        }
      }
    });

    var updatedAtIndex = headers.indexOf('updated_at');
    if (updatedAtIndex !== -1 && !data.hasOwnProperty('updated_at')) {
      sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(new Date().toISOString());
    }

    return jsonResponse({
      success: true,
      message: 'Объект успешно обновлен',
      id: data.id
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Ошибка при обновлении объекта: ' + error.toString()
    });
  }
}

function handleDelete(sheet, headers, data) {
  try {
    if (!data.id) {
      return jsonResponse({
        success: false,
        error: 'Не указан ID объекта для удаления'
      });
    }

    var idIndex = headers.indexOf('id');
    if (idIndex === -1) {
      return jsonResponse({        success: false,
        error: 'Колонка "id" не найдена в таблице'
      });
    }

    var allData = sheet.getDataRange().getValues();
    var rows = allData.slice(1);
    var rowIndex = -1;

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][idIndex]).trim() === String(data.id).trim()) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) {
      return jsonResponse({
        success: false,
        error: 'Объект с ID ' + data.id + ' не найден'
      });
    }

    sheet.deleteRow(rowIndex);

    return jsonResponse({
      success: true,
      message: 'Объект успешно удален',
      id: data.id
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Ошибка при удалении объекта: ' + error.toString()
    });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
function testDoGet() {
  var e = {
    parameter: {
      action: 'verify_pin',
      agent_id: '23062026-001',
      pin: '1234',
      admin: '1'
    }
  };
 
  var result = doGet(e);
  Logger.log('Result: ' + result.getContent());
}
function resetPin() {
  var agentId = '23062026-001';
  var newPin = '1234';
 
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var agentsSheet = ss.getSheetByName('Agents');
  var data = agentsSheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf('agent_id');
  var hashIdx = headers.indexOf('pin_hash');
 
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(agentId).trim()) {
      var newHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, newPin)
        .map(function(byte) {
          var v = (byte < 0) ? 256 + byte : byte;
          return ('0' + v.toString(16)).slice(-2);
        }).join('');
     
      agentsSheet.getRange(i + 1, hashIdx + 1).setValue(newHash);
      Logger.log('✅ PIN сброшен на: ' + newPin);
      Logger.log('New hash: ' + newHash);
      return;
    }
  }
 
  Logger.log('❌ Агент не найден');
}
function debugAgents() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Agents');
 
  Logger.log('Sheet exists: ' + !!sheet);
  if (!sheet) return;
 
  Logger.log('Last row: ' + sheet.getLastRow());
 
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
 
  Logger.log('Headers: ' + JSON.stringify(headers));
 
  var idIdx = headers.indexOf('agent_id');
  Logger.log('agent_id column index: ' + idIdx);
 
  for (var i = 1; i < data.length; i++) {
    var rawId = data[i][idIdx];
    Logger.log('Row ' + i + ': raw=[' + rawId + '] type=' + typeof rawId + ' trimmed=[' + String(rawId).trim() + ']');
  }
}
function restoreAgent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Agents');
 
  // Генерирую хеш для PIN 1234
  var pinHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, '1234')
    .map(function(byte) {
      var v = (byte < 0) ? 256 + byte : byte;
      return ('0' + v.toString(16)).slice(-2);
    }).join('');
 
  var brandConfig = JSON.stringify({
    "primaryColor": "#3D5266",
    "accentColor": "#3498DB",
    "logoUrl": "",
    "agentPhotoUrl": "",
    "welcomeTitle": "КАТАЛОГ НОВОСТРОЕК",
    "appName": "Просторы.Новостройки",
    "tagline": "Подберём квартиру под ваш бюджет",
    "buttonText": "НАЧАТЬ ПОДБОР"
  });
 
  sheet.appendRow([
    '23062026-001',           // agent_id
    'Тестовый агент',         // name
    '',                       // email
    '2038206387',             // telegram_user_id
    pinHash,                  // pin_hash
    'active',                 // status
    'lifetime',               // plan_type
    '',                       // trial_end
    '31.12.2099',             // expires_at
    new Date(),               // created_at
    '',                       // custom_domain
    brandConfig,              // brand_config
    '2038206387'              // chat_id
  ]);
 
  Logger.log('✅ Агент восстановлен');
  Logger.log('PIN: 1234');
  Logger.log('Hash: ' + pinHash);
}
function checkAgent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Agents');
  var data = sheet.getDataRange().getValues();
 
  Logger.log('Total rows: ' + data.length);
 
  for (var i = 0; i < data.length; i++) {
    Logger.log('Row ' + i + ': ' + JSON.stringify(data[i]));
  }
}
