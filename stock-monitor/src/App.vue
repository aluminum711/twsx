<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'; // 確保 watch 已導入, 引入 nextTick
import Chart from 'chart.js/auto'; // 引入 Chart.js

interface StockData {
  Code: string;
  Name: string;
  t?: string; // Latest data time (from backend sysTime)
  v?: string; // Trade volume (not available from backend API)
  z?: string; // Current price (from backend InstantPrice)
  // Optional fields from backend API response
  InstantPrice?: string;
  PriceChange?: string;
  ChangePercentage?: string;
  YesterdayClose?: string;
}

const trackedStocks = ref<string[]>([]); // trackedStocks will now be managed by the backend
const stockData = ref<{ [key: string]: StockData }>({});
const newStockCode = ref('');
const lastFetchTime = ref<string | null>(null); // 新增響應式屬性來存儲 sysTime
const currentTime = ref(''); // 新增響應式屬性來存儲當前系統時間
const taiexValue = ref<string | null>(null);
const taiexChangePercentage = ref<string | null>(null);

// Modal related state and functions
const isChartModalVisible = ref(false);
const selectedStockCode = ref<string | null>(null);
const selectedStockName = ref<string | null>(null);
const stockChartData = ref<any>(null); // 新增：用於儲存圖表數據
const stockMonthlyData = ref<any>(null); // 新增：用於儲存月度數據
const stockYearlyData = ref<any>(null); // 新增：用於儲存年度數據
const isMonthlyDataIncomplete = ref(false); // 新增：追蹤月度數據是否不完整
let stockChartInstance: Chart | null = null; // 新增：用於儲存圖表實例
const chartDataType = ref<'monthly' | 'yearly'>('monthly'); // 新增：用於記錄圖表數據類型
// Script content will go here
// Function to fetch tracked stocks from backend
const fetchTrackedStocks = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/tracked-stocks');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const trackedStocksData = await response.json();
    trackedStocks.value = trackedStocksData;
    console.log('Fetched tracked stocks from backend:', trackedStocks.value);
  } catch (error) {
    console.error('Error fetching tracked stocks:', error);
    // Handle error, maybe set trackedStocks to empty array or show an error message
    trackedStocks.value = [];
  }
};
// const apiUrl = '/api/v1/exchangeReport/STOCK_DAY_ALL'; // Old API
const backendApiUrl = 'http://localhost:3000/api/stock-data'; // New backend API
const taiexApiUrl = 'http://localhost:3000/api/taiex-data'; // New TAIEX API

const fetchStockData = async () => {
  // Fetch stock data for all tracked stocks from the backend
  try {
    const response = await fetch(backendApiUrl, {
      method: 'POST', // Still using POST as per backend endpoint
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stockCodes: trackedStocks.value }), // Send current tracked stocks from frontend state
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const apiResponse = await response.json();
    console.log('Received data from backend:', apiResponse);

    const processedData: { [key: string]: StockData } = {};
    if (apiResponse && apiResponse.stockData) {
      const sysTime = apiResponse.sysTime; // Get system time from response
      lastFetchTime.value = sysTime; // 將 sysTime 賦給 lastFetchTime

      // Update current time display
      const now = new Date();
      // Format current time to YYYY/MM/DD HH:mm:ss
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
      const day = now.getDate().toString().padStart(2, '0');
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');
      currentTime.value = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    // Check if current time is between 8:30 and 14:00 (exclusive of 14:00)
    const isTradingHours = (currentHours > 8 || (currentHours === 8 && currentMinutes >= 30)) && currentHours < 14;

    for (const code in apiResponse.stockData) {
        // Check if the stock code is still in our tracked list (important after removing stocks)
        if (trackedStocks.value.includes(code)) {
          const item = apiResponse.stockData[code];

          // Apply conditional update based on trading hours and 'N/A' values
          const currentStock = stockData.value[code];
          processedData[code] = {
            Code: item.Code,
            Name: item.Name,
            t: item.t,
            v: item.v,
            // Conditionally update InstantPrice, PriceChange, ChangePercentage during trading hours if not 'N/A'
            z: (isTradingHours && item.InstantPrice === 'N/A' && currentStock?.z !== undefined) ? currentStock.z : item.InstantPrice,
            InstantPrice: (isTradingHours && item.InstantPrice === 'N/A' && currentStock?.InstantPrice !== undefined) ? currentStock.InstantPrice : item.InstantPrice,
            PriceChange: (isTradingHours && item.PriceChange === 'N/A' && currentStock?.PriceChange !== undefined) ? currentStock.PriceChange : item.PriceChange,
            ChangePercentage: (isTradingHours && item.ChangePercentage === 'N/A' && currentStock?.ChangePercentage !== undefined) ? currentStock.ChangePercentage : item.ChangePercentage,
            YesterdayClose: item.YesterdayClose, // Assuming YesterdayClose is not N/A during trading hours
          };
        }
      }
    }

    stockData.value = processedData;
    console.log('Updated stockData:', stockData.value);

  } catch (error: any) { // Explicitly type error as any
    console.error('Error fetching stock data:', error);
    // Optionally clear stockData or mark stocks as errored
    // stockData.value = {}; // Keep existing data on error
  }
};

// Function to fetch TAIEX data
const fetchTaiexData = async () => {
  try {
    const response = await fetch(taiexApiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const apiResponse = await response.json();
    console.log('Received TAIEX data from backend:', apiResponse);

    if (apiResponse && apiResponse.taiexData) {
      const taiexData = apiResponse.taiexData;
      taiexValue.value = taiexData.Value || null; // Extract Value
      taiexChangePercentage.value = taiexData.ChangePercentage || null; // Extract ChangePercentage
    } else {
      taiexValue.value = null;
      taiexChangePercentage.value = null;
    }

  } catch (error) {
    console.error('Error fetching TAIEX data:', error);
    taiexValue.value = null;
    taiexChangePercentage.value = null;
  }
};

// Function to update current time display
const updateCurrentTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  currentTime.value = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
};
// Fetch data on component mount
onMounted(async () => {
  console.log('Component mounted. Fetching initial data...');
  await fetchTrackedStocks(); // Fetch tracked stocks first
  fetchStockData(); // Then fetch data for those stocks
  fetchTaiexData(); // Fetch TAIEX data

  // Set up interval to fetch data periodically (e.g., every 5 seconds)
  const fetchInterval = setInterval(() => {
    console.log('Fetching data...');
    fetchStockData();
    fetchTaiexData();
  }, 5000); // Fetch every 5 seconds

  // Set up interval to update current time every second
  const timeInterval = setInterval(updateCurrentTime, 1000);

  // Clear intervals on component unmount
  onUnmounted(() => {
    clearInterval(fetchInterval);
    clearInterval(timeInterval);
  });

  // Initial call to display current time immediately
  updateCurrentTime();
});

// Auto-fetch data every 5 seconds (changed from 30 seconds)
let refreshInterval: number | null = null;
let currentTimeInterval: number | null = null; // 新增定時器變數

onUnmounted(() => {
  // Clear intervals when component is unmounted
  if (refreshInterval !== null) {
    clearInterval(refreshInterval);
  }
  if (currentTimeInterval !== null) { // Clear the new interval
    clearInterval(currentTimeInterval);
  }
});
// Function to open the chart modal and fetch data
const openChartModal = async (stockCode: string, stockName: string) => {
  selectedStockCode.value = stockCode;
  selectedStockName.value = stockName;
  isChartModalVisible.value = true;
  chartDataType.value = 'monthly'; // Default to monthly when opening
  await nextTick(); // Wait for the modal to be rendered
  fetchStockChartData(stockCode, chartDataType.value);
};

// Function to close the chart modal
const closeChartModal = () => {
  isChartModalVisible.value = false;
  selectedStockCode.value = null;
  selectedStockName.value = null;
  destroyChart(); // Destroy chart instance when closing modal
};

// Function to fetch stock chart data
const fetchStockChartData = async (stockCode: string, type: 'monthly' | 'yearly') => {
  try {
    const endpoint = type === 'monthly' ? 'monthly-data' : 'yearly-data';
    const response = await fetch(`http://localhost:3000/api/stock-history/${stockCode}/${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const apiResponse = await response.json();
    console.log(`Received ${type} data for ${stockCode}:`, apiResponse);

    if (type === 'monthly') {
      stockMonthlyData.value = apiResponse.data;
      isMonthlyDataIncomplete.value = apiResponse.incomplete || false; // Update incomplete status
      renderChart(stockMonthlyData.value, 'stockChartMonthly', type);
    } else {
      stockYearlyData.value = apiResponse.data;
      renderChart(stockYearlyData.value, 'stockChartYearly', type);
    }

  } catch (error) {
    console.error(`Error fetching ${type} chart data for ${stockCode}:`, error);
    if (type === 'monthly') {
      stockMonthlyData.value = null;
      isMonthlyDataIncomplete.value = true; // Assume incomplete on error
      renderChart([], 'stockChartMonthly', type); // Render empty chart on error
    } else {
      stockYearlyData.value = null;
      renderChart([], 'stockChartYearly', type); // Render empty chart on error
    }
  }
};

// Function to render the chart
const renderChart = (data: any[], elementId: string, type: 'monthly' | 'yearly') => {
  destroyChart(); // Destroy existing chart before rendering a new one

  const ctx = document.getElementById(elementId) as HTMLCanvasElement;
  if (!ctx) {
    console.error(`Canvas element with id ${elementId} not found.`);
    return;
  }

  // Prepare data for Chart.js
  const labels = data.map(item => item.Date);
  const prices = data.map(item => parseFloat(item.Close));

  stockChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${selectedStockName.value} (${selectedStockCode.value}) - ${type === 'monthly' ? '月線' : '年線'}`,
        data: prices,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        pointRadius: 2, // Reduce point size
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // Allow chart to fill modal width
      scales: {
        x: {
          title: {
            display: true,
            text: '日期'
          }
        },
        y: {
          title: {
            display: true,
            text: '收盤價'
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: function(context) {
              // Display date in tooltip title
              return context[0].label;
            },
            label: function(context) {
              // Display price in tooltip label
              return `收盤價: ${context.raw}`;
            }
          }
        }
      }
    }
  });
};

// Function to destroy the chart instance
const destroyChart = () => {
  if (stockChartInstance) {
    stockChartInstance.destroy();
    stockChartInstance = null;
  }
};

// Watch for changes in chartDataType and fetch/render the appropriate data
watch(chartDataType, (newType) => {
  if (selectedStockCode.value) {
    fetchStockChartData(selectedStockCode.value, newType);
  }
});

// Function to add a stock
const addStock = async () => { // Make async to await backend call
  const code = newStockCode.value.trim().toUpperCase(); // Convert to uppercase
  if (code) { // No need to check if already tracked on frontend
    try {
      const response = await fetch('http://localhost:3000/api/tracked-stocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stockCode: code }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to add stock: ${errorData.error || response.statusText}`);
      }

      console.log(`Stock ${code} added successfully to backend.`);
      newStockCode.value = ''; // Clear input
      // After adding, fetch the updated list of tracked stocks from the backend
      await fetchTrackedStocks();
      fetchStockData(); // Fetch updated data including the new stock
    } catch (error: any) { // Explicitly type error as any
      console.error(`Error adding stock ${code}:`, error);
      alert(`Failed to add stock: ${error.message}`); // Provide user feedback
    }
  }
};

// Function to remove a stock
const removeStock = async (stockCode: string) => { // Make async to await backend call
  try {
    const response = await fetch(`http://localhost:3000/api/tracked-stocks/${stockCode}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to remove stock: ${errorData.error || response.statusText}`);
    }

    console.log(`Stock ${stockCode} removed successfully from backend.`);
    // Remove the stock from the frontend list and data
    trackedStocks.value = trackedStocks.value.filter(code => code !== stockCode);
    if (stockData.value[stockCode]) {
      delete stockData.value[stockCode];
    }
    fetchStockData(); // Fetch updated data for remaining stocks
  } catch (error: any) { // Explicitly type error as any
    console.error(`Error removing stock ${stockCode}:`, error);
    alert(`Failed to remove stock: ${error.message}`); // Provide user feedback
  }
};
</script>

<template>
  <div id="app">
    <h1>股票即時監控</h1>

    <div class="info-bar">
      <div class="time-info">
        <p>當前系統時間: {{ currentTime }}</p>
      </div>
      <div class="taiex-info">
        <p>
          TAIEX:
          <span :class="{
            'positive': parseFloat(taiexChangePercentage || '0') > 0,
            'negative': parseFloat(taiexChangePercentage || '0') < 0
          }">
            {{ taiexValue || 'N/A' }} ({{ taiexChangePercentage || 'N/A' }})%
          </span>
        </p>
      </div>
    </div>

    <div class="input-area">
      <input v-model="newStockCode" @keyup.enter="addStock" placeholder="輸入股票代碼 (e.g., 2330)" />
      <button @click="addStock">加入股票</button>
    </div>

    <div v-if="trackedStocks.length > 0" class="stock-list">
      <h2>追蹤中的股票</h2>
      <table>
        <thead>
          <tr>
            <th>代碼</th>
            <th>名稱</th>
            <th>成交價</th>
            <th>漲跌</th>
            <th>漲跌幅 (%)</th>
            <th>昨日收盤價</th>
            <th>最後更新時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="stockCode in trackedStocks" :key="stockCode">
            <td>{{ stockCode }}</td>
            <td>{{ stockData[stockCode]?.Name || '載入中...' }}</td>
            <td :class="{
              'positive': parseFloat(stockData[stockCode]?.PriceChange || '0') > 0,
              'negative': parseFloat(stockData[stockCode]?.PriceChange || '0') < 0
            }">
              {{ stockData[stockCode]?.InstantPrice || 'N/A' }}
            </td>
            <td :class="{
              'positive': parseFloat(stockData[stockCode]?.PriceChange || '0') > 0,
              'negative': parseFloat(stockData[stockCode]?.PriceChange || '0') < 0
            }">
              {{ stockData[stockCode]?.PriceChange || 'N/A' }}
            </td>
            <td :class="{
              'positive': parseFloat(stockData[stockCode]?.ChangePercentage || '0') > 0,
              'negative': parseFloat(stockData[stockCode]?.ChangePercentage || '0') < 0
            }">
              {{ stockData[stockCode]?.ChangePercentage || 'N/A' }}
            </td>
            <td>{{ stockData[stockCode]?.YesterdayClose || 'N/A' }}</td>
            <td>{{ stockData[stockCode]?.t || 'N/A' }}</td>
            <td>
              <button @click="openChartModal(stockCode, stockData[stockCode]?.Name || stockCode)">查看圖表</button>
              <button @click="removeStock(stockCode)">移除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else>
      <p>請輸入股票代碼以開始追蹤。</p>
    </div>

    <!-- Chart Modal -->
    <div v-if="isChartModalVisible" class="modal-overlay" @click.self="closeChartModal">
      <div class="modal-content">
        <span class="close" @click="closeChartModal">&times;</span>
        <h2>{{ selectedStockName }} ({{ selectedStockCode }}) - 歷史股價圖</h2>

        <div class="chart-controls">
          <button @click="chartDataType = 'monthly'" :class="{ active: chartDataType === 'monthly' }">月線</button>
          <button @click="chartDataType = 'yearly'" :class="{ active: chartDataType === 'yearly' }">年線</button>
        </div>

        <div v-if="chartDataType === 'monthly'">
          <p v-if="isMonthlyDataIncomplete" class="warning-message">
            注意：月線數據可能不完整，僅顯示最近的可用數據。
          </p>
          <canvas id="stockChartMonthly"></canvas>
        </div>
        <div v-if="chartDataType === 'yearly'">
          <canvas id="stockChartYearly"></canvas>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Style content will go here */
</style>
