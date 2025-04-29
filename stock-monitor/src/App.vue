<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'; // 確保 watch 已導入, 引入 nextTick
import Chart from 'chart.js/auto'; // 引入 Chart.js
const STORAGE_KEY = 'trackedStocks';

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

const trackedStocks = ref<string[]>([]);
const stockData = ref<{ [key: string]: StockData }>({});
const newStockCode = ref('');
const lastFetchTime = ref<string | null>(null); // 新增響應式屬性來存儲 sysTime
const currentTime = ref(''); // 新增響應式屬性來存儲當前系統時間
const taiexValue = ref<string | null>(null);
const taiexPriceChange = ref<string | null>(null); // 新增響應式屬性來存儲 TAIEX 漲跌點數
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

// 新增：監聽 chartDataType 的變化
watch(chartDataType, async (newType, oldType) => {
  console.log(`chartDataType changed from ${oldType} to ${newType}`);
  if (newType === 'yearly') {
    // 如果切換到年度數據，檢查是否已獲取
    if (!stockYearlyData.value) {
      console.log('Fetching yearly data...');
      const stockCode = selectedStockCode.value;
      if (stockCode) {
        try {
          const yearlyResponse = await fetch(`http://localhost:3000/api/stock-yearly/${stockCode}`);
          if (!yearlyResponse.ok) {
            throw new Error(`HTTP error! status: ${yearlyResponse.status}`);
          }
          const yearlyData = await yearlyResponse.json();
          console.log(`Fetched yearly data for ${stockCode}:`, yearlyData);
          stockYearlyData.value = yearlyData; // 儲存獲取到的年度數據
          console.log('原始年度數據:', stockYearlyData.value); // 新增日誌

          // 新增：對年度數據按照日期進行排序 (由小到大) - 與月度數據排序邏輯相同
          if (stockYearlyData.value && stockYearlyData.value.data && stockYearlyData.value.fields) {
            const fields = stockYearlyData.value.fields;
            const dateIndex = fields.indexOf('日期');
            if (dateIndex !== -1) {
              stockYearlyData.value.data.sort((a: string[], b: string[]) => {
                const dateA = a[dateIndex];
                const dateB = b[dateIndex];

                // Convert "YYY/MM/DD" (Minguo) to "YYYY/MM/DD" (Gregorian) for correct sorting
                const convertMinguoToGregorian = (dateStr: string): string => {
                  const parts = dateStr.split('/');
                  if (parts.length === 3) {
                    const year = parseInt(parts[0], 10) + 1911;
                    // Ensure month and day are zero-padded for correct lexicographical comparison
                    const month = parts[1].padStart(2, '0');
                    const day = parts[2].padStart(2, '0');
                    return `${year}/${month}/${day}`;
                  }
                  return dateStr; // Return original if format is unexpected
                };

                const comparableDateA = convertMinguoToGregorian(dateA);
                const comparableDateB = convertMinguoToGregorian(dateB);

                if (comparableDateA < comparableDateB) return -1;
                if (comparableDateA > comparableDateB) return 1;
                return 0;
              });
              console.log('排序後的年度數據:', stockYearlyData.value.data); // 新增日誌
            } else {
              console.error('Date field not found in yearly data fields for sorting.');
            }
          }
          // End of new sorting logic

        } catch (error) {
          console.error(`Error fetching stock yearly data for ${stockCode}:`, error);
          stockYearlyData.value = null; // 清除數據或設置錯誤狀態
        }
      }
    }
  }

  // 無論切換到月度或年度，只要數據準備好，就重新渲染圖表
  // 確保在 DOM 更新後渲染圖表
  await nextTick();
  renderChart();
});

const showChartModal = async (stockCode: string) => {
  selectedStockCode.value = stockCode;
  // Find the stock name based on the code
  const stock = Object.values(stockData.value).find(s => s.Code === stockCode);
  selectedStockName.value = stock ? stock.Name : stockCode; // Use name if found, otherwise use code

  // Reset chart data type to monthly when opening modal for a new stock
  chartDataType.value = 'monthly';

  // Fetch monthly data
  try {
    const monthlyResponse = await fetch(`http://localhost:3000/api/stock-monthly/${stockCode}`);
    if (!monthlyResponse.ok) {
      throw new Error(`HTTP error! status: ${monthlyResponse.status}`);
    }
    const monthlyData = await monthlyResponse.json();
    console.log(`Fetched monthly data for ${stockCode}:`, monthlyData);
    stockMonthlyData.value = monthlyData; // Store fetched monthly data

    // Sort monthly data by date (ascending)
    if (stockMonthlyData.value && stockMonthlyData.value.data && stockMonthlyData.value.fields) {
      const fields = stockMonthlyData.value.fields;
      const dateIndex = fields.indexOf('日期');
      if (dateIndex !== -1) {
        stockMonthlyData.value.data.sort((a: string[], b: string[]) => {
          const dateA = a[dateIndex];
          const dateB = b[dateIndex];

          // Convert "YYY/MM/DD" (Minguo) to "YYYY/MM/DD" (Gregorian) for correct sorting
          const convertMinguoToGregorian = (dateStr: string): string => {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              const year = parseInt(parts[0], 10) + 1911;
              const month = parts[1].padStart(2, '0');
              const day = parts[2].padStart(2, '0');
              return `${year}/${month}/${day}`;
            }
            return dateStr; // Return original if format is unexpected
          };

          const comparableDateA = convertMinguoToGregorian(dateA);
          const comparableDateB = convertMinguoToGregorian(dateB);

          if (comparableDateA < comparableDateB) return -1;
          if (comparableDateA > comparableDateB) return 1;
          return 0;
        });
        console.log('Sorted monthly data:', stockMonthlyData.value.data);
      } else {
        console.error('Date field not found in monthly data fields for sorting.');
      }
    }

    // Check monthly data completeness
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate(); // Get number of days in current month

    // Simple check: if fetched data is less than the number of days in the current month, data might be incomplete
    // Note: This is a simplified check, actual scenarios might require more complex logic (e.g., considering holidays)
    if (stockMonthlyData.value && stockMonthlyData.value.data && stockMonthlyData.value.data.length < lastDayOfMonth) {
      isMonthlyDataIncomplete.value = true;
    } else {
      isMonthlyDataIncomplete.value = false;
    }

  } catch (error) {
    console.error(`Error fetching stock monthly data for ${stockCode}:`, error);
    stockMonthlyData.value = null; // Clear data or set error status
    isMonthlyDataIncomplete.value = false; // Reset incomplete status on error
  }

  // Fetch yearly data (do not await, let it fetch in the background)
  fetch(`http://localhost:3000/api/stock-yearly/${stockCode}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(yearlyData => {
      console.log(`Fetched yearly data for ${stockCode}:`, yearlyData);
      stockYearlyData.value = yearlyData; // Store fetched yearly data

      // Sort yearly data by date (ascending)
      if (stockYearlyData.value && stockYearlyData.value.data && stockYearlyData.value.fields) {
        const fields = stockYearlyData.value.fields;
        const dateIndex = fields.indexOf('日期');
        if (dateIndex !== -1) {
          stockYearlyData.value.data.sort((a: string[], b: string[]) => {
            const dateA = a[dateIndex];
            const dateB = b[dateIndex];

            // Convert "YYY/MM/DD" (Minguo) to "YYYY/MM/DD" (Gregorian) for correct sorting
            const convertMinguoToGregorian = (dateStr: string): string => {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                const year = parseInt(parts[0], 10) + 1911;
                const month = parts[1].padStart(2, '0');
                const day = parts[2].padStart(2, '0');
                return `${year}/${month}/${day}`;
              }
              return dateStr; // Return original if format is unexpected
            };

            const comparableDateA = convertMinguoToGregorian(dateA);
            const comparableDateB = convertMinguoToGregorian(dateB);

            if (comparableDateA < comparableDateB) return -1;
            if (comparableDateA > comparableDateB) return 1;
            return 0;
          });
          console.log('Sorted yearly data:', stockYearlyData.value.data);
        } else {
          console.error('Date field not found in yearly data fields for sorting.');
        }
      }
    })
    .catch(error => {
      console.error(`Error fetching stock yearly data for ${stockCode}:`, error);
      stockYearlyData.value = null; // Clear data or set error status
    });


  isChartModalVisible.value = true;
  await nextTick(); // Ensure DOM is updated before rendering chart
  renderChart(); // Render chart after modal is visible and data fetch is initiated
};

const hideChartModal = () => {
  isChartModalVisible.value = false;
  selectedStockCode.value = null;
  selectedStockName.value = null;
  stockChartData.value = null; // 清除圖表數據
  // 新增：銷毀圖表實例
  if (stockChartInstance) {
    stockChartInstance.destroy();
    stockChartInstance = null;
  }
};

// 新增：渲染圖表的函式
const renderChart = () => {
  const ctx = document.getElementById('stock-daily-change-chart') as HTMLCanvasElement;

  // Determine which data source to use based on chartDataType
  const chartData = chartDataType.value === 'yearly' ? stockYearlyData.value : stockMonthlyData.value;
  const dataTypeLabel = chartDataType.value === 'yearly' ? '年度' : '月度';

  // Check if canvas and selected data source with fields and data properties exist
  if (!ctx || !chartData || !chartData.fields || !chartData.data) {
    console.error(`Chart canvas not found or ${dataTypeLabel} data not available or in unexpected format.`);
    return;
  }

  // Destroy existing chart instance
  if (stockChartInstance) {
    stockChartInstance.destroy();
  }

  // Prepare chart data from raw API response
  const fields = chartData.fields;
  const rawData = chartData.data;

  // Find indices for required fields
  const dateIndex = fields.indexOf('日期');
  const closingPriceIndex = fields.indexOf('收盤價');
  const priceChangeIndex = fields.indexOf('漲跌價差'); // Or '漲跌' depending on the exact field name

  // Validate indices
  if (dateIndex === -1 || closingPriceIndex === -1 || priceChangeIndex === -1) {
    console.error('Required fields (日期, 收盤價, 漲跌價差) not found in data fields.');
    // Optionally display an error message to the user
    return;
  }

  let labels: string[] = [];
  let percentageChangeData: number[] = [];
  let closingPriceData: number[] = [];

  if (chartDataType.value === 'yearly') {
    // Process yearly data to get the last day's data for each month
    const monthlyLastDayData: { [key: string]: string[] } = {};

    rawData.forEach((dayData: string[]) => {
      const date = dayData[dateIndex];

      // Extract month from date (assuming "YYYY/MM/DD" or "YYY/MM/DD" Minguo format)
      const dateParts = date.split('/');
      let year, month;
      if (dateParts.length === 3) {
        // Handle both Gregorian and Minguo years for grouping
        year = parseInt(dateParts[0], 10);
        if (year < 1911) { // Assuming Minguo year if less than 1911
            year += 1911;
        }
        month = dateParts[1].padStart(2, '0');
      } else {
        console.error('Unexpected date format:', date);
        return; // Skip this data point if date format is unexpected
      }
      const monthKey = `${year}/${month}`;

      // Since rawData is sorted by date, the last data point encountered for a month will be the latest day
      monthlyLastDayData[monthKey] = dayData;
    });

    // Extract data for the last day of each month and populate labels and data arrays
    const sortedMonths = Object.keys(monthlyLastDayData).sort(); // Sort months chronologically

    sortedMonths.forEach(monthKey => {
      const lastDayData = monthlyLastDayData[monthKey];

      const closingPriceStr = lastDayData[closingPriceIndex];
      const priceChangeStr = lastDayData[priceChangeIndex];

      const cleanedClosingPriceStr = closingPriceStr.replace(/,/g, ''); // Remove commas
      const closingPrice = parseFloat(cleanedClosingPriceStr);

      const priceChange = parseFloat(priceChangeStr.replace('+', '').replace('-', ''));
      const actualPriceChange = priceChangeStr.includes('-') ? -priceChange : priceChange;

      const yesterdayClose = closingPrice - actualPriceChange;
      let percentageChange = 0;
      if (yesterdayClose !== 0) {
        percentageChange = (actualPriceChange / yesterdayClose) * 100;
      }

      console.log(`Month: ${monthKey}, Raw Closing Price: ${closingPriceStr}, Cleaned Closing Price: ${cleanedClosingPriceStr}, Parsed Closing Price: ${closingPrice}`); // Update logging

      // Format month label (e.g., "YYYY/MM")
      labels.push(monthKey);
      closingPriceData.push(parseFloat(closingPrice.toFixed(2)));
      percentageChangeData.push(parseFloat(percentageChange.toFixed(2)));
    });

  } else {
    // Existing logic for monthly data (daily points)
    rawData.forEach((dayData: string[]) => {
      const date = dayData[dateIndex];
      const closingPriceStr = dayData[closingPriceIndex];
      const priceChangeStr = dayData[priceChangeIndex];

      const closingPrice = parseFloat(closingPriceStr);
      const priceChange = parseFloat(priceChangeStr.replace('+', '').replace('-', ''));
      const actualPriceChange = priceChangeStr.includes('-') ? -priceChange : priceChange;

      const yesterdayClose = closingPrice - actualPriceChange;
      let percentageChange = 0;
      if (yesterdayClose !== 0) {
        percentageChange = (actualPriceChange / yesterdayClose) * 100;
      }

      // Format date as "MM/DD" for monthly chart labels
      const formattedDate = date.substring(date.indexOf('/') + 1); // Keep MM/DD or M/D

      labels.push(formattedDate);
      percentageChangeData.push(parseFloat(percentageChange.toFixed(2)));
      closingPriceData.push(closingPrice);
    });
  }

  console.log('傳入 renderChart 的數據:', { labels, percentageChangeData, closingPriceData });


  // Calculate min/max for closing price data with 10% padding
  let priceMin = 0; // Default if no data
  let priceMax = 100; // Default if no data
  if (closingPriceData.length > 0) {
    const minPrice = Math.min(...closingPriceData);
    const maxPrice = Math.max(...closingPriceData);
    const priceRange = maxPrice - minPrice;
    priceMin = minPrice - priceRange * 0.1;
    priceMax = maxPrice + priceRange * 0.1;
  }

  // Calculate min/max for percentage change data with padding
  let percentageMin = -10; // Default for monthly
  let percentageMax = 10; // Default for monthly

  if (chartDataType.value === 'yearly' && percentageChangeData.length > 0) {
    const minPercentage = Math.min(...percentageChangeData);
    const maxPercentage = Math.max(...percentageChangeData);
    const percentageRange = maxPercentage - minPercentage;
    percentageMin = minPercentage - percentageRange * 0.1;
    percentageMax = maxPercentage + percentageRange * 0.1;

    // Ensure min/max are not the same if all values are identical
    if (percentageMin === percentageMax) {
        percentageMin -= 1;
        percentageMax += 1;
    }
  }


  // Reverse the data and labels to show oldest data first on the chart
  // This might not be necessary if the data is already sorted chronologically
  // labels.reverse();
  // percentageChangeData.reverse();
  // closingPriceData.reverse();


  stockChartInstance = new Chart(ctx, {
    type: 'line', // or 'bar'
    data: {
      labels: labels,
      datasets: [
        {
          label: `${selectedStockName.value} 月度漲跌幅 (%)`, // Always use "月度" for percentage change label
          data: percentageChangeData,
          borderColor: '#007bff',
          tension: 0.1,
          fill: false,
          yAxisID: 'y-percentage',
        },
        {
          label: `${selectedStockName.value} 月度收盤價`, // Always use "月度" for closing price label
          data: closingPriceData,
          borderColor: '#ff7f0e',
          tension: 0.1,
          fill: false,
          yAxisID: 'y-price',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // Allow manual size setting
      scales: {
        x: {
          title: {
            display: true,
            text: chartDataType.value === 'yearly' ? '月份' : '日期' // Keep x-axis title dynamic
          }
        },
        'y-percentage': {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: '漲跌幅 (%)'
          },
          min: percentageMin, // Use dynamic min for yearly, fixed for monthly
          max: percentageMax, // Use dynamic max for yearly, fixed for monthly
          ticks: {
            stepSize: chartDataType.value === 'yearly' ? undefined : 1 // Auto step size for yearly, fixed 1 for monthly
          }
        },
        'y-price': {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: '收盤價'
          },
          grid: {
            drawOnChartArea: false,
          },
          min: priceMin,
          max: priceMax,
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label ? context.dataset.label : '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                // Check the dataset label to determine formatting
                if (context.dataset.label && context.dataset.label.includes('漲跌幅')) {
                  label += context.parsed.y.toFixed(2) + '%';
                } else {
                  label += context.parsed.y.toFixed(2);
                }
              }
              return label;
            }
          }
        }
      }
    }
  });
};


// const apiUrl = '/api/v1/exchangeReport/STOCK_DAY_ALL'; // Old API
const backendApiUrl = 'http://localhost:3000/api/stock-data'; // New backend API
const taiexApiUrl = 'http://localhost:3000/api/taiex-data'; // New TAIEX API

const fetchStockData = async () => {
  if (trackedStocks.value.length === 0) {
    stockData.value = {}; // Clear data if no stocks are tracked
    return;
  }
  try {
    const response = await fetch(backendApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stockCodes: trackedStocks.value }),
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

      // Remove current time update from here, it will be handled by the interval
      // const now = new Date();
      // // Format current time to YYYY/MM/DD HH:mm:ss
      // const year = now.getFullYear();
      // const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
      // const day = now.getDate().toString().padStart(2, '0');
      // const hours = now.getHours().toString().padStart(2, '0');
      // const minutes = now.getMinutes().toString().padStart(2, '0');
      // const seconds = now.getSeconds().toString().padStart(2, '0');
      // currentTime.value = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

    for (const code in apiResponse.stockData) {
        if (trackedStocks.value.includes(code)) {
          const item = apiResponse.stockData[code];
          // Check if current time is between 8:30 and 14:00 (exclusive of 14:00)
          // This check should ideally use the server time or be removed if not strictly necessary for this logic
          // For now, removing the 'now' usage to fix the error.
          // const hours = now.getHours();
          // const minutes = now.getMinutes();
          // const isTradingHours = (hours > 8 || (hours === 8 && minutes >= 30)) && hours < 14;
           const isTradingHours = true; // Assuming trading hours for now to avoid 'now' error

          processedData[code] = {
            Code: item.Code,
            Name: item.Name,
            t: item.t, // Use item.t for 't'
            v: item.v,
            // Apply conditional update for z, InstantPrice, PriceChange, ChangePercentage
            // If within trading hours and new data is 'N/A', keep existing data if available
            z: (isTradingHours && item.InstantPrice === 'N/A' && stockData.value[code]?.z !== undefined) ? stockData.value[code].z : item.InstantPrice,
            InstantPrice: (isTradingHours && item.InstantPrice === 'N/A' && stockData.value[code]?.InstantPrice !== undefined) ? stockData.value[code].InstantPrice : item.InstantPrice,
            PriceChange: (isTradingHours && item.PriceChange === 'N/A' && stockData.value[code]?.PriceChange !== undefined) ? stockData.value[code].PriceChange : item.PriceChange,
            ChangePercentage: (isTradingHours && item.ChangePercentage === 'N/A' && stockData.value[code]?.ChangePercentage !== undefined) ? stockData.value[code].ChangePercentage : item.ChangePercentage,
            YesterdayClose: item.YesterdayClose, // Assuming YesterdayClose is not N/A during trading hours
          };
        }
      }
    }

    stockData.value = processedData;
    console.log('Updated stockData:', stockData.value);

  } catch (error) {
    console.error('Error fetching stock data:', error);
    // Optionally clear stockData or mark stocks as errored
    // stockData.value = {}; // Keep existing data on error
  }
};

// Function to add a stock
const addStock = async () => {
  const code = newStockCode.value.trim().toUpperCase();
  if (code && !trackedStocks.value.includes(code)) {
    trackedStocks.value.push(code);
    newStockCode.value = ''; // Clear input field
    await saveTrackedStocks(); // Save updated list to backend
    fetchStockData(); // Fetch data for the newly added stock
  }
};
// };

// Function to remove a stock
// This function is already present, will modify it in the next diff.
// const removeStock = (stockCode: string) => {
//   trackedStocks.value = trackedStocks.value.filter(code => code !== stockCode);
//   // Optionally remove the stock's data from stockData as well
//   if (stockData.value[stockCode]) {
//     delete stockData.value[stockCode];
//   }
//   fetchStockData(); // Refresh data for remaining stocks
// };

// Load tracked stocks from localStorage when the component is mounted
// This block is already present and correct, no need to re-add.
// Load tracked stocks from localStorage when the component is mounted
onMounted(() => {
 const savedStocks = localStorage.getItem(STORAGE_KEY);
 if (savedStocks) {
   try {
     trackedStocks.value = JSON.parse(savedStocks);
     console.log('Loaded tracked stocks from localStorage on mount:', trackedStocks.value);
   } catch (e) {
     console.error('Error parsing saved stocks from localStorage:', e);
     localStorage.removeItem(STORAGE_KEY); // Clear invalid data
   }
 }

 // Fetch initial stock data
 fetchStockData();
 fetchTaiexData(); // Fetch TAIEX data on mount

 // Start the interval to update current time every second
 currentTimeInterval = setInterval(updateCurrentTime, 1000);
});

// 新增：更新當前時間的函式
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

// 新增：在組件卸載時清除定時器
onUnmounted(() => {
 if (currentTimeInterval !== null) {
   clearInterval(currentTimeInterval);
 }
});
//       console.error('Error parsing saved stocks from localStorage on mount:', e);
//       localStorage.removeItem(STORAGE_KEY); // Clear invalid data
//     }
//   }
//   // Initial data fetch after loading from storage
//   fetchStockData();
//   fetchTaiexData(); // Fetch TAIEX data on mount
// });

// Auto-fetch data every 30 seconds
// This block is already present and correct, no need to re-add.
// let fetchInterval: number | null = null;
// onMounted(() => {
//   fetchInterval = setInterval(() => {
//     fetchStockData();
//     fetchTaiexData(); // Also fetch TAIEX data periodically
//   }, 30000); // Fetch every 30 seconds
// });

// onUnmounted(() => {
//   if (fetchInterval) {
//     clearInterval(fetchInterval);
//   }
// });

const fetchTaiexData = async () => {
  try {
    // Change to taiexApiUrl and use GET method
    const response = await fetch(taiexApiUrl, {
      method: 'GET',
      // Remove headers and body for GET request
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const apiResponse = await response.json();
    console.log('Received TAIEX data from backend:', apiResponse);

    // Adjust data extraction based on the new endpoint's response structure
    if (apiResponse && apiResponse.taiexData) {
      const taiexData = apiResponse.taiexData;
      taiexValue.value = taiexData.Value || null; // Extract Value
      taiexChangePercentage.value = taiexData.ChangePercentage || null; // Extract ChangePercentage
      taiexPriceChange.value = taiexData.ValueDiff || null; // Extract ValueDiff

    } else {
      // Handle case where data is not found or in unexpected format
      taiexValue.value = null;
      taiexChangePercentage.value = null;
      taiexPriceChange.value = null; // Also reset price change
      console.warn('TAIEX data not found or in unexpected format:', apiResponse);
    }

  } catch (error) {
    console.error('Error fetching TAIEX data:', error);
    taiexValue.value = null;
    taiexChangePercentage.value = null;
    taiexPriceChange.value = null; // Also reset price change on error
  }
};

// Function to save tracked stocks to backend
const saveTrackedStocks = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/user-stocks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(trackedStocks.value),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log('Tracked stocks saved to backend successfully.');
  } catch (error) {
    console.error('Error saving tracked stocks to backend:', error);
  }
};
// Function to save tracked stocks to backend


// Function to add a stock
// Function to save tracked stocks to backend



// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
// Function to remove a stock
const removeStock = async (code: string) => {
  trackedStocks.value = trackedStocks.value.filter(stockCode => stockCode !== code);
  // Also remove from stockData
  const updatedStockData = { ...stockData.value };
  delete updatedStockData[code];
  stockData.value = updatedStockData;
  await saveTrackedStocks(); // Save updated list to backend
};


// Initial fetch and set up refresh interval
let refreshInterval: number | null = null;
let currentTimeInterval: number | null = null; // 新增定時器變數


onMounted(async () => {
  // Load tracked stocks from backend
  try {
    const response = await fetch('http://localhost:3000/api/user-stocks');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const savedStocks = await response.json();
    // Assuming the backend returns an array of stock codes
    if (Array.isArray(savedStocks)) {
      trackedStocks.value = savedStocks;
      console.log('Loaded tracked stocks from backend:', trackedStocks.value);
    } else {
        // If backend returns an object (old format), convert keys to array
        trackedStocks.value = Object.keys(savedStocks);
        console.log('Loaded tracked stocks from backend (converted from object):', trackedStocks.value);
    }
  } catch (error) {
    console.error('Error loading tracked stocks from backend:', error);
    // If loading fails, initialize with an empty array
    trackedStocks.value = [];
  }


  fetchStockData(); // Initial fetch
  fetchTaiexData(); // Fetch TAIEX data on mount
  // Set up interval for fetching data every 5 seconds
  const intervalId = setInterval(fetchStockData, 5000);
  // Set up interval for fetching TAIEX data every 30 seconds
  const taiexIntervalId = setInterval(fetchTaiexData, 30000);

  // Clear interval on component unmount
  onUnmounted(() => {
    clearInterval(intervalId);
    clearInterval(taiexIntervalId);
  });
});

onUnmounted(() => {
  // Clear intervals when component is unmounted
  if (refreshInterval !== null) {
    clearInterval(refreshInterval);
  }
  if (currentTimeInterval !== null) { // Clear the new interval
    clearInterval(currentTimeInterval);
  }
});


// Remove the duplicate onUnmounted block
// onUnmounted(() => {
//   // Clear intervals when component is unmounted
//   if (refreshInterval !== null) {
//     clearInterval(refreshInterval);
//   }
//   if (currentTimeInterval !== null) { // Clear the new interval
//     clearInterval(currentTimeInterval);
//   }
// });
</script>

<template>
  <div class="container">
    <h1>台灣上市個股成交資訊</h1>

    <div class="header-info">
      <div class="current-time">
        當前系統時間：{{ currentTime }}
      </div>
    
      <div class="taiex-info">
        加權指數: {{ taiexValue || '-' }}
        <span :class="{ 'positive': parseFloat(taiexChangePercentage || '0') > 0, 'negative': parseFloat(taiexChangePercentage || '0') < 0 }">
          {{ taiexPriceChange || '-' }} ({{ taiexChangePercentage || '-' }})
        </span>
      </div>
    </div>

    <div class="input-area">
      <input
        type="text"
        v-model="newStockCode"
        placeholder="輸入個股代碼 (例如: 2330)"
        @keyup.enter="addStock"
      />
      <button @click="addStock">新增個股</button>
    </div>


    <div v-if="lastFetchTime" class="fetch-time">
      最新資料獲取時間：{{ lastFetchTime }}
    </div>

    <div class="stock-list">
      <table>
        <thead>
          <tr>
            <th>股票代碼</th>
            <th>股票名稱</th>
            <th>漲跌幅</th>
            <th>漲跌</th>
            <th>現價</th>
            <th>昨日收盤價</th>
            <th>成交量</th>
            <th>最新資料時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="code in trackedStocks" :key="code">
            <template v-if="stockData[code]">
              <td>{{ stockData[code].Code }}</td>
              <td>{{ stockData[code].Name }}</td>
              <td :class="{ 'positive': parseFloat(stockData[code].ChangePercentage || '') > 0, 'negative': parseFloat(stockData[code].ChangePercentage || '') < 0 }">{{ stockData[code].ChangePercentage || '-' }}</td> <!-- Display Change Percentage -->
              <td :class="{ 'positive': parseFloat(stockData[code].PriceChange || '') > 0, 'negative': parseFloat(stockData[code].PriceChange || '') < 0 }">{{ stockData[code].PriceChange || '-' }}</td> <!-- Display Price Change -->
              <td>{{ stockData[code].z || '-' }}</td> <!-- Display current price (z) -->
              <td>{{ stockData[code].YesterdayClose || '-' }}</td> <!-- Display Yesterday Close -->
              <td>{{ stockData[code].v || '-' }}</td> <!-- Display Trade Volume (v) -->
              <td>{{ stockData[code].t || '-' }}</td> <!-- Display latest data time (t) -->
              <td class="stock-actions">
                <button @click="showChartModal(stockData[code].Code)">顯示圖表</button>
                <button @click="removeStock(code)">刪除</button>
              </td>
            </template>
            <template v-else>
              <td colspan="9" style="text-align: center;">載入 {{ code }} 資料中...</td> <!-- Adjusted colspan -->
            </template>
          </tr>
          <tr v-if="trackedStocks.length === 0">
            <td colspan="9" style="text-align: center;">請輸入個股代碼以開始追蹤</td> <!-- Adjusted colspan -->
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Chart Modal -->
  <div v-if="isChartModalVisible" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ selectedStockName }} 當月漲跌幅圖表</h2>
        <button class="close-button" @click="hideChartModal">&times;</button>
      </div>
      <div class="modal-body">
        <!-- Chart will be rendered here -->
        <div id="stock-chart" style="height: 450px;">
          <!-- 圖表將在這裡顯示 -->
          <canvas id="stock-daily-change-chart"></canvas>
          <p v-if="!stockMonthlyData && chartDataType === 'monthly'">正在載入月度圖表數據...</p> <!-- 修改：檢查 stockMonthlyData -->
          <!-- Add loading/error state for yearly data if needed -->
        </div>

        <!-- Warning Message -->
        <p v-if="isMonthlyDataIncomplete && chartDataType === 'monthly'" style="color: orange; text-align: center; margin-top: 10px;">注意：獲取到的月度數據可能不完整。</p>

        <!-- Data Type Switch Buttons -->
        <div class="chart-data-switch">
          <button
            :class="{ active: chartDataType === 'monthly' }"
            @click="chartDataType = 'monthly'"
          >
            月度數據
          </button>
          <button
            :class="{ active: chartDataType === 'yearly' }"
            @click="chartDataType = 'yearly'"
          >
            年度數據
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  background-color: #f8f8f8; /* Added light grey background */
  margin: 0 auto;
  padding: 20px;
  font-family: sans-serif;
}

.header-info {
  margin-bottom: 20px; /* Add some space below this block */
}

h1, h2 {
  text-align: center;
  color: #333;
}

.input-area {
  display: flex;
  margin-bottom: 20px;
  gap: 10px;
}

.input-area input {
  flex-grow: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.input-area button {
  padding: 10px 15px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.input-area button:hover {
  background-color: #0056b3;
}

.stock-list {
  margin-top: 20px;
}

.stock-list table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.stock-list th, .stock-list td {
  border: 1px solid #ddd;
  padding: 10px;
  text-align: left;
  white-space: nowrap; /* 防止內容換行 */
}

.stock-list th {
  background-color: #f2f2f2;
  font-weight: bold;
}

.stock-list tbody tr:nth-child(even) {
  background-color: #f9f9f9;
}

.stock-list tbody tr:hover {
  background-color: #e9e9e9;
}
.positive {
  color: #FF0000; /* Changed to green for positive change */
}

.negative {
  color: #008000; /* Changed to red for negative change */
}

.stock-actions {
  display: flex;
  gap: 5px; /* 調整按鈕間距 */
}
</style>

<style scoped>
/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000; /* Ensure it's on top */
}

.modal-content {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  width: 90%;
  max-width: 600px; /* Adjust max-width as needed */
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5em;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0;
}

.modal-body {
  /* Add padding or specific styles for the body content */
}

.chart-data-switch {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  gap: 10px;
}

.chart-data-switch button {
  padding: 8px 15px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: #f9f9f9;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.chart-data-switch button:hover {
  background-color: #e9e9e9;
}

.chart-data-switch button.active {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
</style>

<style scoped>
.taiex-info {
  /* text-align: center; */ /* Removed center alignment */
  font-size: 1.2em;
  margin-bottom: 20px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: #f9f9f9;
  width: 100%; /* Ensure it takes full width to respect parent's align-items */
  text-align: center; /* Align text to the center within its container */
  box-sizing: border-box; /* Include padding and border in the element's total width */
}

.taiex-info .positive {
  color: #FF0000; /* Changed to green for positive change */
}

.taiex-info .negative {
  color: #008000; /* Changed to red for negative change */
}

.fetch-time {
  /* position: absolute; */ /* Removed absolute positioning */
  /* top: 10px; */
  /* right: 10px; */
  font-size: 0.9em;
  color: #555;
  text-align: right; /* Align text to the right within its container */
  width: 100%; /* Ensure it takes full width to respect text-align */
}

.current-time {
  font-size: 0.9em;
  color: #555;
  /* Ensure no conflicting styles like float or absolute positioning */
  width: 100%; /* Ensure it takes full width to respect parent's align-items */
  text-align: right; /* Align text to the right within its container */
}
</style>
