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
const MAX_ENTRIES = 100; // 每種類型最多保留 100 筆

// 處理 GET 請求（讀取排行榜或新增紀錄）
function doGet(e) {
  try {
    const action = e.parameter.action;

    // 新增紀錄
    if (action === 'add') {
      const params = {
        name: e.parameter.name,
        school: e.parameter.school || '',
        type: e.parameter.type,
        score: parseFloat(e.parameter.score) || 0,
        level: parseInt(e.parameter.level) || 0
      };
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

// 處理 POST 請求（新增紀錄 - 備用）
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
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

  // 跳過標題列
  const entries = data.slice(1).map(row => ({
    timestamp: row[0],
    name: row[1],
    school: row[2],
    type: row[3],
    score: row[4],
    level: row[5] || 0
  }));

  // 依類型分組
  const result = {
    time: [],
    level: [],
    damage: []
  };

  entries.forEach(entry => {
    if (result[entry.type]) {
      result[entry.type].push(entry);
    }
  });

  // 排序
  // time: 分數越高越好（存活秒數）
  result.time.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

  // level: 分數越高越好
  result.level.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

  // damage: 分數越低越好，同分時等級高的優先
  result.damage.sort((a, b) => {
    const dmgDiff = parseFloat(a.score) - parseFloat(b.score);
    if (dmgDiff !== 0) return dmgDiff;
    return parseFloat(b.level) - parseFloat(a.level);
  });

  // 只保留前 100 名
  result.time = result.time.slice(0, MAX_ENTRIES);
  result.level = result.level.slice(0, MAX_ENTRIES);
  result.damage = result.damage.slice(0, MAX_ENTRIES);

  // 如果指定類型，只回傳該類型
  if (type !== 'all' && result[type]) {
    return { [type]: result[type] };
  }

  return result;
}

// 新增排行榜紀錄
function addLeaderboardEntry(params) {
  const { name, school, type, score, level } = params;

  // 驗證必要參數
  if (!name || !type || score === undefined) {
    throw new Error('Missing required parameters');
  }

  // 驗證類型
  if (!['time', 'level', 'damage'].includes(type)) {
    throw new Error('Invalid type');
  }

  // 傷害榜需要 75 級以上
  if (type === 'damage' && (!level || level < 75)) {
    throw new Error('Damage leaderboard requires level 75+');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Leaderboard sheet not found');
  }

  // 新增紀錄
  const timestamp = new Date();
  sheet.appendRow([timestamp, name, school || '', type, score, level || 0]);

  // 計算排名
  const allData = getLeaderboardData(type);
  const entries = allData[type] || [];
  let rank = entries.length; // 預設最後一名

  // 根據類型計算排名
  if (type === 'damage') {
    rank = entries.filter(e => parseFloat(e.score) < parseFloat(score)).length + 1;
  } else {
    rank = entries.filter(e => parseFloat(e.score) > parseFloat(score)).length + 1;
  }

  return { rank: rank };
}

// 清理舊資料（可選，手動執行或設定觸發器）
function cleanupOldEntries() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  // 按類型分組並排序
  const byType = { time: [], level: [], damage: [] };

  for (let i = 1; i < data.length; i++) {
    const type = data[i][3];
    if (byType[type]) {
      byType[type].push({ row: i + 1, data: data[i] });
    }
  }

  // 找出需要刪除的列（超過 100 名的）
  const rowsToDelete = [];

  // time 排序：分數高的保留
  byType.time.sort((a, b) => parseFloat(b.data[4]) - parseFloat(a.data[4]));
  byType.time.slice(MAX_ENTRIES).forEach(e => rowsToDelete.push(e.row));

  // level 排序：分數高的保留
  byType.level.sort((a, b) => parseFloat(b.data[4]) - parseFloat(a.data[4]));
  byType.level.slice(MAX_ENTRIES).forEach(e => rowsToDelete.push(e.row));

  // damage 排序：分數低的保留
  byType.damage.sort((a, b) => parseFloat(a.data[4]) - parseFloat(b.data[4]));
  byType.damage.slice(MAX_ENTRIES).forEach(e => rowsToDelete.push(e.row));

  // 從後往前刪除（避免列號偏移）
  rowsToDelete.sort((a, b) => b - a);
  rowsToDelete.forEach(row => sheet.deleteRow(row));
}
