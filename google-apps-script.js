/**
 * DDT Web Game - Google Sheets Leaderboard API
 *
 * 設定步驟：
 * 1. 在 Google Sheet 建立工作表 "leaderboard"
 * 2. 第一列標題：時間戳記 | 暱稱 | 陣營 | 類型 | 分數 | 等級
 * 3. 擴充功能 > Apps Script > 貼上此程式碼
 * 4. 部署 > 新增部署 > 網頁應用程式
 *    - 執行身分：我自己
 *    - 誰可以存取：所有人
 * 5. 複製網址貼到遊戲的 SHEET_API_URL
 */

const SHEET_NAME = 'leaderboard';
const MAX_ENTRIES = 100;
const GAME_SALT = 'DDT_2024_HWUDI'; // 必須與前端一致

// 分數合理範圍
const SCORE_LIMITS = {
  time: { min: 0, max: 5999 },    // 0~99:59 秒
  level: { min: 0, max: 999.99 }, // 0~999.99 級（含經驗百分比）
  damage: { min: 0, max: 999999 } // 0~999999 傷害
};

// 驗證 checksum
function verifyChecksum(type, name, score, level, timestamp, checksum) {
  // 直接使用傳入的值（前端已確保格式一致）
  const data = `${type}|${name}|${score}|${level}|${timestamp}|${GAME_SALT}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const lenCheck = (data.length % 256).toString(16).padStart(2, '0');
  const expected = hex + lenCheck;
  return checksum === expected;
}

// 驗證時間戳（5分鐘內有效）
function verifyTimestamp(timestamp) {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff < 5 * 60 * 1000; // 5 分鐘
}

// 驗證分數範圍
function verifyScore(type, score) {
  const limits = SCORE_LIMITS[type];
  if (!limits) return false;
  return score >= limits.min && score <= limits.max;
}

// 處理 GET 請求
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'add') {
      // 保留原始字串用於 checksum 驗證
      const scoreRaw = e.parameter.score || '0';
      const levelRaw = e.parameter.level || '0';
      const tsRaw = e.parameter.ts || '0';

      const params = {
        name: e.parameter.name,
        school: e.parameter.school || '',
        type: e.parameter.type,
        score: parseFloat(scoreRaw) || 0,
        level: parseFloat(levelRaw) || 0,
        timestamp: parseInt(tsRaw) || 0,
        checksum: e.parameter.cs || ''
      };

      // 驗證 checksum（使用原始字串）
      if (!verifyChecksum(params.type, params.name, scoreRaw, levelRaw, tsRaw, params.checksum)) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'Invalid checksum' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 驗證時間戳
      if (!verifyTimestamp(params.timestamp)) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'Request expired' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 驗證分數範圍
      if (!verifyScore(params.type, params.score)) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'Invalid score range' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const result = addLeaderboardEntry(params);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, rank: result.rank }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 讀取排行榜
    const type = e.parameter.type || 'all';
    const data = getLeaderboardData(type);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 處理 POST 請求（備用）
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);

    // 同樣需要驗證
    if (!verifyChecksum(params.type, params.name, params.score, params.level, params.timestamp, params.checksum)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Invalid checksum' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const result = addLeaderboardEntry(params);
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, rank: result.rank }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 讀取排行榜資料
function getLeaderboardData(type) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return { time: [], level: [], damage: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { time: [], level: [], damage: [] };

  const entries = data.slice(1).map(row => ({
    timestamp: row[0],
    name: row[1],
    school: row[2],
    type: row[3],
    score: row[4],
    level: row[5] || 0
  }));

  const result = { time: [], level: [], damage: [] };

  entries.forEach(entry => {
    if (result[entry.type]) {
      result[entry.type].push(entry);
    }
  });

  // 排序
  result.time.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  result.level.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  result.damage.sort((a, b) => {
    const dmgDiff = parseFloat(a.score) - parseFloat(b.score);
    if (dmgDiff !== 0) return dmgDiff;
    return parseFloat(b.level) - parseFloat(a.level);
  });

  result.time = result.time.slice(0, MAX_ENTRIES);
  result.level = result.level.slice(0, MAX_ENTRIES);
  result.damage = result.damage.slice(0, MAX_ENTRIES);

  if (type !== 'all' && result[type]) {
    return { [type]: result[type] };
  }

  return result;
}

// 新增排行榜紀錄
function addLeaderboardEntry(params) {
  const { name, school, type, score, level } = params;

  if (!name || !type || score === undefined) {
    throw new Error('Missing required parameters');
  }

  if (!['time', 'level', 'damage'].includes(type)) {
    throw new Error('Invalid type');
  }

  if (type === 'damage' && (!level || level < 75)) {
    throw new Error('Damage leaderboard requires level 75+');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Leaderboard sheet not found');
  }

  const timestamp = new Date();
  sheet.appendRow([timestamp, name, school || '', type, score, level || 0]);

  const allData = getLeaderboardData(type);
  const entries = allData[type] || [];
  let rank = entries.length;

  if (type === 'damage') {
    rank = entries.filter(e => parseFloat(e.score) < parseFloat(score)).length + 1;
  } else {
    rank = entries.filter(e => parseFloat(e.score) > parseFloat(score)).length + 1;
  }

  return { rank: rank };
}

// 清理舊資料
function cleanupOldEntries() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const byType = { time: [], level: [], damage: [] };

  for (let i = 1; i < data.length; i++) {
    const type = data[i][3];
    if (byType[type]) {
      byType[type].push({ row: i + 1, data: data[i] });
    }
  }

  const rowsToDelete = [];

  byType.time.sort((a, b) => parseFloat(b.data[4]) - parseFloat(a.data[4]));
  byType.time.slice(MAX_ENTRIES).forEach(e => rowsToDelete.push(e.row));

  byType.level.sort((a, b) => parseFloat(b.data[4]) - parseFloat(a.data[4]));
  byType.level.slice(MAX_ENTRIES).forEach(e => rowsToDelete.push(e.row));

  byType.damage.sort((a, b) => parseFloat(a.data[4]) - parseFloat(b.data[4]));
  byType.damage.slice(MAX_ENTRIES).forEach(e => rowsToDelete.push(e.row));

  rowsToDelete.sort((a, b) => b - a);
  rowsToDelete.forEach(row => sheet.deleteRow(row));
}
