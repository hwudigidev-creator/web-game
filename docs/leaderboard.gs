/**
 * DDT 排行榜 Google Apps Script
 * 支援多難度分頁：日常、噩夢、煉獄
 *
 * 部署步驟：
 * 1. 在 Google Sheets 中開啟 Apps Script（擴充功能 → Apps Script）
 * 2. 貼上此程式碼
 * 3. 部署 → 新增部署作業 → 網頁應用程式
 * 4. 執行身分：自己 / 誰可以存取：所有人
 * 5. 複製部署 URL 到 index.html 的 SHEET_API_URL
 */

// 工作表名稱對應
const SHEET_NAMES = {
  'daily': '日常',
  'nightmare': '噩夢',
  'inferno': '煉獄'
};

// 驗證用的 salt（需與前端一致）
const GAME_SALT = 'DDT_2024_HWUDI';

// 簡易 hash 函數（與前端一致：hex + lenCheck）
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // 轉為16進制並加上長度校驗（與前端一致）
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const lenCheck = (str.length % 256).toString(16).padStart(2, '0');
  return hex + lenCheck;
}

// 驗證 checksum
function verifyChecksum(type, name, score, level, timestamp, checksum) {
  const data = `${type}|${name}|${score}|${level}|${timestamp}|${GAME_SALT}`;
  const expected = simpleHash(data);
  return expected === checksum;
}

// 根據難度取得對應的工作表
function getSheet(difficulty) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = SHEET_NAMES[difficulty] || SHEET_NAMES['daily'];
  let sheet = ss.getSheetByName(sheetName);

  // 如果工作表不存在，建立它
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // 設定標題列
    sheet.getRange('A1:F1').setValues([['名稱', '學校', '時間', '等級', '傷害', '時間戳記']]);
  }

  return sheet;
}

// 處理提交紀錄
function handleSubmit(e) {
  const difficulty = e.parameter.difficulty || 'daily';
  const type = e.parameter.type;
  const name = e.parameter.name;
  const score = e.parameter.score;
  const school = e.parameter.school || '';
  const level = e.parameter.level || '';
  const timestamp = e.parameter.timestamp;
  const checksum = e.parameter.checksum;

  // 驗證必要參數
  if (!type || !name || score === undefined || !timestamp || !checksum) {
    return { success: false, error: 'Missing parameters' };
  }

  // 驗證 checksum
  if (!verifyChecksum(type, name, score, level, timestamp, checksum)) {
    return { success: false, error: 'Invalid checksum' };
  }

  try {
    const sheet = getSheet(difficulty);
    const data = sheet.getDataRange().getValues();

    // 尋找是否已有此玩家的紀錄
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === name && data[i][1] === school) {
        rowIndex = i + 1; // Sheet 的列索引從 1 開始
        break;
      }
    }

    // 決定要更新的欄位
    let colIndex;
    switch (type) {
      case 'time': colIndex = 3; break;   // C 欄
      case 'level': colIndex = 4; break;  // D 欄
      case 'damage': colIndex = 5; break; // E 欄
      default: return { success: false, error: 'Invalid type' };
    }

    const numScore = parseFloat(score) || 0;

    if (rowIndex > 0) {
      // 更新現有紀錄
      const currentValue = sheet.getRange(rowIndex, colIndex).getValue();
      let shouldUpdate = false;

      if (type === 'time' || type === 'level') {
        // 時間和等級：越大越好
        shouldUpdate = numScore > (parseFloat(currentValue) || 0);
      } else if (type === 'damage') {
        // 傷害：越小越好（0 不算）
        const currentDmg = parseFloat(currentValue) || Infinity;
        shouldUpdate = numScore > 0 && numScore < currentDmg;
      }

      if (shouldUpdate) {
        sheet.getRange(rowIndex, colIndex).setValue(numScore);
        sheet.getRange(rowIndex, 6).setValue(new Date(parseInt(timestamp))); // 時間戳記
        if (type === 'damage') {
          sheet.getRange(rowIndex, 4).setValue(parseFloat(level) || 0); // 同時更新等級
        }
      }
    } else {
      // 新增紀錄
      const newRow = [name, school, '', '', '', new Date(parseInt(timestamp))];
      if (type === 'time') newRow[2] = numScore;
      if (type === 'level') newRow[3] = numScore;
      if (type === 'damage') {
        newRow[4] = numScore;
        newRow[3] = parseFloat(level) || 0;
      }
      sheet.appendRow(newRow);
    }

    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 統一入口：GET 請求處理
function doGet(e) {
  // 設定 CORS 標頭
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  // 如果有 name 參數，表示是提交紀錄
  if (e.parameter.name) {
    const result = handleSubmit(e);
    return output.setContent(JSON.stringify(result));
  }

  // 否則是讀取排行榜
  const difficulty = e.parameter.difficulty || 'daily';
  const type = e.parameter.type || 'all';

  try {
    const sheet = getSheet(difficulty);
    const data = sheet.getDataRange().getValues();

    // 跳過標題列
    const rows = data.slice(1);

    const result = {
      success: true,
      difficulty: difficulty,
      data: {}
    };

    if (type === 'all' || type === 'time') {
      result.data.time = rows
        .filter(row => row[2] !== '' && row[2] !== undefined && row[2] !== null)
        .map(row => ({ name: String(row[0]), school: String(row[1] || ''), score: Number(row[2]) || 0 }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
    }

    if (type === 'all' || type === 'level') {
      result.data.level = rows
        .filter(row => row[3] !== '' && row[3] !== undefined && row[3] !== null)
        .map(row => ({ name: String(row[0]), school: String(row[1] || ''), score: Number(row[3]) || 0 }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
    }

    if (type === 'all' || type === 'damage') {
      result.data.damage = rows
        .filter(row => row[4] !== '' && row[4] !== undefined && row[4] !== null)
        .map(row => ({ name: String(row[0]), school: String(row[1] || ''), score: Number(row[4]) || 0, level: Number(row[3]) || 0 }))
        .sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          return b.level - a.level;
        })
        .slice(0, 50);
    }

    return output.setContent(JSON.stringify(result));

  } catch (error) {
    return output.setContent(JSON.stringify({ success: false, error: error.message }));
  }
}

// POST 請求也用同樣邏輯處理
function doPost(e) {
  return doGet(e);
}
