import fetch from 'node-fetch'; // Node.js < 18 需要安裝 node-fetch

const url = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';

export async function fetchData() {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 簡單檢查資料是否為陣列且非空
    if (Array.isArray(data) && data.length > 0) {
      console.log('成功獲取並解析 JSON 資料。資料筆數:', data.length);
      // 可以在這裡對資料進行進一步處理，但根據任務要求，僅需確認獲取成功
    } else {
      console.log('成功獲取資料，但資料為空或非預期格式。');
    }

  } catch (error) {
    console.error('獲取或解析資料時發生錯誤:', error);
    process.exit(1); // 發生錯誤時退出並返回非零狀態碼
  }
}

fetchData();