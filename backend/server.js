const fs = require('fs'); // Import file system module
const path = require('path'); // Import path module
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Stock Monitor API',
      version: '1.0.0',
      description: 'API documentation for the Stock Monitor backend server',
    },
    servers: [
      {
        url: 'http://localhost:3000', // Adjust if your server runs on a different port
        description: 'Local server',
      },
    ],
  },
  apis: [__dirname + '/server.js'], // Point to the file containing your API routes and JSDoc comments
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Import cors

const app = express();
const port = 3000; // Or any other port

app.use(cors()); // Use cors middleware
app.use(express.json()); // To parse JSON request bodies

// Define the path for the data file
const dataFilePath = path.join(__dirname, 'stockData.json');

// Load existing data from file on startup
let stockData = {};
if (fs.existsSync(dataFilePath)) {
  try {
    const rawData = fs.readFileSync(dataFilePath);
    stockData = JSON.parse(rawData);
    console.log('Loaded existing stock data from', dataFilePath);
  } catch (error)
  {
    console.error('Error loading stock data from file:', error);
  }
}

/**
 * @swagger
 * /api/stock-data:
 *   post:
 *     summary: Get stock data for specified stock codes
 *     description: Fetches real-time stock data from the TWSE API for a list of stock codes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stockCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of stock codes (e.g., ["2330", "0050"]).
 *             example:
 *               stockCodes: ["2330", "0050"]
 *     responses:
 *       200:
 *         description: Successfully retrieved stock data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sysTime:
 *                   type: string
 *                   description: System time from the API.
 *                   nullable: true
 *                 stockData:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       Code:
 *                         type: string
 *                         description: Stock code.
 *                       Name:
 *                         type: string
 *                         description: Stock name.
 *                       InstantPrice:
 *                         type: string
 *                         description: Latest trade price.
 *                       PriceChange:
 *                         type: string
 *                         description: Price change from yesterday's close.
 *                       ChangePercentage:
 *                         type: string
 *                         description: Percentage change from yesterday's close.
 *                       YesterdayClose:
 *                         type: string
 *                         description: Yesterday's closing price.
 *                       t:
 *                         type: string
 *                         description: Latest trade time.
 *                   description: An object where keys are stock codes and values are stock data.
 *       400:
 *         description: Invalid request body or empty stockCodes array.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 *       500:
 *         description: Failed to fetch data from the TWSE API.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 *                 stockData:
 *                   type: object
 *                   description: Partially retrieved stock data (if any).
 */
app.post('/api/stock-data', async (req, res) => {
  // Get stock codes from the backend's stockData object
  const stockCodes = Object.keys(stockData);

  if (stockCodes.length === 0) {
    return res.json({ sysTime: null, stockData: {} }); // Return empty data if no stocks are tracked
  }

  const results = {};
  const apiBaseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

  // Construct the ex_ch parameter for all tracked stock codes
  const exChParam = stockCodes.map(code => {
    if (code.startsWith('tse_') && code.endsWith('.tw')) {
      return code;
    } else {
      return `tse_${code}.tw`;
    }
  }).join('|');
  const apiUrl = `${apiBaseUrl}?ex_ch=${exChParam}`;

  let apiData = null; // Declare apiData outside the try block
  let fetchError = false; // Declare error flag
  try {
    console.log(`Fetching data from TWSE API: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    apiData = response.data; // Assuming the response is JSON

    console.log('Received data from TWSE API. Structure:', typeof apiData, Array.isArray(apiData) ? `Array length: ${apiData.length}` : '');
    // Log a sample of the data to understand its structure
    if (apiData && Array.isArray(apiData.msgArray) && apiData.msgArray.length > 0) {
        console.log('Sample data item from msgArray:', apiData.msgArray[0]);
    } else {
        console.log('No data or unexpected data format received from API.');
    }

    // --- Process data from the new API ---
    if (apiData && Array.isArray(apiData.msgArray)) {
        apiData.msgArray.forEach(stockInfo => {
            const code = stockInfo.c; // Stock code is in 'c' field
            const name = stockInfo.n; // Stock name is in 'n' field
            const latestPrice = parseFloat(stockInfo.z); // Latest trade price is in 'z' field
            const yesterdayClose = parseFloat(stockInfo.y); // Yesterday's closing price is in 'y' field

            let priceChange = 'N/A';
            let changePercentage = 'N/A';

            if (!isNaN(latestPrice) && !isNaN(yesterdayClose)) {
                priceChange = (latestPrice - yesterdayClose).toFixed(2);
                if (yesterdayClose !== 0) {
                    changePercentage = (((latestPrice - yesterdayClose) / yesterdayClose) * 100).toFixed(2) + '%';
                } else {
                    changePercentage = 'N/A'; // Avoid division by zero
                }
            }

            results[code] = {
                Code: code,
                Name: name || 'N/A',
                InstantPrice: isNaN(latestPrice) ? 'N/A' : latestPrice.toFixed(2), // Include instant price
                PriceChange: priceChange,
                ChangePercentage: changePercentage,
                YesterdayClose: stockInfo.y ? parseFloat(stockInfo.y).toFixed(2) : 'N/A', // Add yesterday's closing price
                t: stockInfo.t, // Add latest trade time
                v: stockInfo.v // Add trade volume
            };
        });
    } else {
         // If API data is unexpected or empty, retain existing data for tracked stocks
         stockCodes.forEach(code => {
             if (stockData[code]) {
                 results[code] = stockData[code]; // Keep existing data
             } else {
                 results[code] = { error: 'API data format unexpected or empty' };
             }
         });
    }

  } catch (error) {
    console.error(`Error fetching data from TWSE API:`, error);
    fetchError = true; // Set error flag
    // On fetch error, retain existing data for tracked stocks
    stockCodes.forEach(code => {
        if (stockData[code]) {
            results[code] = stockData[code]; // Keep existing data
        } else {
            results[code] = { error: 'Could not fetch data from new API' };
        }
    });
  }

  // Check for fetch errors before attempting to access apiData
  if (fetchError && (!apiData || !Array.isArray(apiData.msgArray))) {
      // If there was a fetch error and no valid data was received,
      // return existing data if available, otherwise return error for each stock.
       const errorResponseData = {};
       stockCodes.forEach(code => {
           errorResponseData[code] = stockData[code] || { error: 'Failed to fetch data from API' };
       });
      return res.status(500).json({ error: 'Failed to fetch data from API', stockData: errorResponseData });
  }


  // If no fetch error, proceed with processing and sending the response
  const finalResponse = {
    sysTime: apiData ? apiData.sysTime : null, // Include sysTime from the API response if available
    stockData: results // Wrap the stock data in a 'stockData' key
  };

  // Save the updated stock data to the file
  // Merge new data with existing data
  Object.assign(stockData, results);
  fs.writeFile(dataFilePath, JSON.stringify(stockData, null, 2), (err) => {
    if (err) {
      console.error('Error writing stock data to file:', err);
    } else {
      console.log('Stock data saved to', dataFilePath);
    }
  });

  res.json(finalResponse);
});

/**
 * @swagger
 * /api/tracked-stocks:
 *   get:
 *     summary: Get the list of tracked stock codes
 *     description: Returns an array of stock codes currently being tracked by the backend.
 *     responses:
 *       200:
 *         description: Successfully retrieved the list of tracked stocks.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["2330", "0050"]
 */
app.get('/api/tracked-stocks', (req, res) => {
  // Return the keys of the stockData object as the list of tracked stocks
  res.json(Object.keys(stockData));
});

/**
 * @swagger
 * /api/tracked-stocks:
 *   post:
 *     summary: Add a stock code to the tracked list
 *     description: Adds a new stock code to the list of stocks tracked by the backend.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stockCode:
 *                 type: string
 *                 description: The stock code to add (e.g., "2330").
 *             example:
 *               stockCode: "2330"
 *     responses:
 *       200:
 *         description: Successfully added the stock code.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Stock code added successfully."
 *       400:
 *         description: Invalid request body or stock code already tracked.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid request body or stock code already tracked."
 */
app.post('/api/tracked-stocks', (req, res) => {
  const { stockCode } = req.body;

  if (!stockCode || typeof stockCode !== 'string') {
    return res.status(400).json({ error: 'Invalid request body. "stockCode" (string) is required.' });
  }

  // Check if the stock is already tracked (case-insensitive check)
  const existingCodes = Object.keys(stockData).map(code => code.toUpperCase());
  if (existingCodes.includes(stockCode.toUpperCase())) {
    return res.status(400).json({ error: `Stock code ${stockCode} is already being tracked.` });
  }

  // Add the new stock code to stockData with initial empty data
  stockData[stockCode] = {}; // Initialize with empty data, actual data will be fetched later

  // Save the updated stock data to the file
  fs.writeFile(dataFilePath, JSON.stringify(stockData, null, 2), (err) => {
    if (err) {
      console.error('Error writing stock data to file after adding stock:', err);
      return res.status(500).json({ error: 'Failed to save updated stock data.' });
    } else {
      console.log(`Stock code ${stockCode} added and data saved to`, dataFilePath);
      res.json({ message: `Stock code ${stockCode} added successfully.` });
    }
  });
});

/**
 * @swagger
 * /api/tracked-stocks/{stockCode}:
 *   delete:
 *     summary: Remove a stock code from the tracked list
 *     description: Removes a stock code from the list of stocks tracked by the backend.
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock code to remove (e.g., "2330").
 *     responses:
 *       200:
 *         description: Successfully removed the stock code.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Stock code removed successfully."
 *       404:
 *         description: Stock code not found in the tracked list.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Stock code not found in the tracked list."
 *       500:
 *         description: Failed to save updated stock data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to save updated stock data."
 */
app.delete('/api/tracked-stocks/:stockCode', (req, res) => {
  const { stockCode } = req.params;

  if (!stockData[stockCode]) {
    return res.status(404).json({ error: `Stock code ${stockCode} not found in the tracked list.` });
  }

  delete stockData[stockCode];

  // Save the updated stock data to the file
  fs.writeFile(dataFilePath, JSON.stringify(stockData, null, 2), (err) => {
    if (err) {
      console.error('Error writing stock data to file after removing stock:', err);
      return res.status(500).json({ error: 'Failed to save updated stock data.' });
    } else {
      console.log(`Stock code ${stockCode} removed and data saved to`, dataFilePath);
      res.json({ message: `Stock code ${stockCode} removed successfully.` });
    }
  });
});

/**
 * @swagger
 * /api/taiex-data:
 *   get:
 *     summary: Get TAIEX index data
 *     description: Fetches real-time TAIEX index data from the TWSE API.
 *     responses:
 *       200:
 *         description: Successfully retrieved TAIEX data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taiexData:
 *                   type: object
 *                   properties:
 *                     Value:
 *                       type: string
 *                       description: Latest TAIEX index value.
 *                     ChangePercentage:
 *                       type: string
 *                       description: Percentage change of the TAIEX index.
 *       500:
 *         description: Failed to fetch TAIEX data from the TWSE API.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 */
// New endpoint for TAIEX data
app.get('/api/taiex-data', async (req, res) => {
  const apiBaseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';
  const taiexCode = 'tse_t00.tw'; // Common code for TAIEX
  const apiUrl = `${apiBaseUrl}?ex_ch=${taiexCode}`;

  try {
    console.log(`Fetching TAIEX data from TWSE API: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    const apiData = response.data;

    console.log('Received TAIEX data from TWSE API. Structure:', typeof apiData, Array.isArray(apiData) ? `Array length: ${apiData.length}` : '');

    if (apiData && Array.isArray(apiData.msgArray) && apiData.msgArray.length > 0) {
      const taiexInfo = apiData.msgArray[0];
      const taiexValue = taiexInfo.z; // Latest trade price
      const yesterdayClose = taiexInfo.y; // Yesterday's closing price

      let changePercentage = 'N/A';
      if (taiexValue && yesterdayClose && parseFloat(yesterdayClose) !== 0) {
        const value = parseFloat(taiexValue);
        const close = parseFloat(yesterdayClose);
        if (!isNaN(value) && !isNaN(close)) {
             changePercentage = (((value - close) / close) * 100).toFixed(2) + '%';
        }
      } else if (taiexInfo.pc) {
          // Fallback: if yesterdayClose is 0 or missing, use 'pc' field if available (percentage change)
          changePercentage = parseFloat(taiexInfo.pc).toFixed(2) + '%';
      }


      const formattedData = {
        taiexData: {
          Value: taiexValue ? parseFloat(taiexValue).toFixed(2) : 'N/A',
          ChangePercentage: changePercentage
        }
      };

      res.json(formattedData);

    } else {
      console.log('No TAIEX data or unexpected data format received from API.');
      res.status(500).json({ error: 'Could not retrieve TAIEX data' });
    }

  } catch (error) {
    console.error(`Error fetching TAIEX data from TWSE API:`, error);
    res.status(500).json({ error: 'Failed to fetch TAIEX data' });
  }
});

/**
 * @swagger
 * /api/stock-history/{stockCode}:
 *   get:
 *     summary: Get historical daily price change data for a stock
 *     description: Returns mock historical daily price change data for a given stock code.
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock code (e.g., "2330").
 *     responses:
 *       200:
 *         description: Successfully retrieved historical data.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     description: The date of the data point (YYYY-MM-DD).
 *                   priceChange:
 *                     type: number
 *                     description: The daily price change.
 *                   changePercentage:
 *                     type: string
 *                     description: The daily percentage change.
 *             example:
 *               - date: "2023-10-26"
 *                 priceChange: 5.00
 *                 changePercentage: "+1.5%"
 *               - date: "2023-10-25"
 *                 priceChange: -2.50
 *                 changePercentage: "-0.75%"
 *       400:
 *         description: Invalid stock code provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 */
app.get('/api/stock-history/:stockCode', async (req, res) => {
  const { stockCode } = req.params;

  if (!stockCode) {
    return res.status(400).json({ error: 'Stock code is required' });
  }

  console.log(`Received request for historical data for stock code: ${stockCode}`);

  const apiBaseUrl = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';
  // For historical data, we typically need data for a specific period.
  // Let's fetch data for the past year as an example.
  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

  // TWSE API requires date in YYYYMMDD format
  const year = oneYearAgo.getFullYear();
  const month = String(oneYearAgo.getMonth() + 1).padStart(2, '0');
  const day = String(oneYearAgo.getDate()).padStart(2, '0');
  const formattedDate = `${year}${month}${day}`;

  const apiUrl = `${apiBaseUrl}?response=json&date=${formattedDate}&stockNo=${stockCode}`;

  try {
    console.log(`Fetching historical data from TWSE API: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    const apiData = response.data;

    console.log('Received historical data from TWSE API.');

    // The API returns data in a structured format.
    // We need to process it to extract date, priceChange, and changePercentage.
    const historyData = [];
    if (apiData && Array.isArray(apiData.data)) {
      apiData.data.forEach(item => {
        // Assuming the data array structure is consistent with TWSE STOCK_DAY API
        // Example structure: ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌價差", "成交筆數"]
        const date = item[0]; // Date string (e.g., "112/10/23")
        const closingPrice = parseFloat(item[6]); // Closing price
        const priceChange = parseFloat(item[7]); // Price change

        let changePercentage = 'N/A';
        if (!isNaN(closingPrice) && !isNaN(priceChange)) {
            const previousClose = closingPrice - priceChange;
             if (previousClose !== 0) {
                changePercentage = ((priceChange / previousClose) * 100).toFixed(2) + '%';
             }
        }

        // Convert date format from "YY/MM/DD" to "YYYY-MM-DD"
        const parts = date.split('/');
        if (parts.length === 3) {
            const westernYear = parseInt(parts[0], 10) + 1911; // Convert ROC year to Western year
            const westernDate = `${westernYear}-${parts[1]}-${parts[2]}`;
             historyData.push({
                date: westernDate,
                priceChange: isNaN(priceChange) ? 'N/A' : priceChange,
                changePercentage: changePercentage
             });
        }
      });
    } else {
        console.log('No historical data or unexpected data format received from API.');
    }

    res.json(historyData);

  } catch (error) {
    console.error(`Error fetching or processing historical data from TWSE API:`, error);
    res.status(500).json({ error: 'Failed to fetch or process historical stock data' });
  }
});


/**
 * @swagger
 * /api/stock-monthly/{stockCode}:
 *   get:
 *     summary: Get monthly stock data for a specified stock code
 *     description: Fetches monthly stock data from the TWSE API for a given stock code and the current date.
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock code (e.g., "2330").
 *     responses:
 *       200:
 *         description: Successfully retrieved monthly stock data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date:
 *                   type: string
 *                   description: The date used for the API request (YYYYMMDD).
 *                 stockCode:
 *                   type: string
 *                   description: The requested stock code.
 *                 data:
 *                   type: object
 *                   description: The raw data received from the TWSE monthly data API.
 *       400:
 *         description: Invalid stock code provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 *       500:
 *         description: Failed to fetch monthly data from the TWSE API.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 */
app.get('/api/stock-monthly/:stockCode', async (req, res) => {
  const { stockCode } = req.params;

  if (!stockCode) {
    return res.status(400).json({ error: 'Stock code is required' });
  }

  // Get current date in YYYYMMDD format
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const day = String(today.getDate()).padStart(2, '0');
  const formattedDate = `${year}${month}${day}`;

  const apiUrl = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${formattedDate}&stockNo=${stockCode}`;

  try {
    console.log(`Fetching monthly data from TWSE API: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    const apiData = response.data;

    console.log('Received monthly data from TWSE API.');

    // Return the raw data
    res.json(apiData);

  } catch (error) {
    console.error(`Error fetching or processing monthly data from TWSE API:`, error);
    res.status(500).json({ error: 'Failed to fetch or process monthly stock data' });
  }
});


/**
 * @swagger
 * /api/stock-yearly/{stockCode}:
 *   get:
 *     summary: Get yearly stock data for a specified stock code (Mock Data)
 *     description: Returns mock yearly stock data for a given stock code, simulating the TWSE STOCK_DAY API format.
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock code (e.g., "2330").
 *     responses:
 *       200:
 *         description: Successfully retrieved mock yearly stock data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date:
 *                   type: string
 *                   description: The date used for the API request (YYYYMMDD).
 *                 fields:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Array of field names.
 *                 data:
 *                   type: array
 *                   items:
 *                     type: array
 *                     items:
 *                       type: string
 *                   description: Array of data rows, each row is an array of strings.
 *                 title:
 *                   type: string
 *                   description: Title of the data.
 *                 notes:
 *                   type: string
 *                   description: Notes about the data.
 *       400:
 *         description: Invalid stock code provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 */
app.get('/api/stock-yearly/:stockCode', async (req, res) => {
  const { stockCode } = req.params;

  if (!stockCode) {
    return res.status(400).json({ error: 'Stock code is required' });
  }

  const apiBaseUrl = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';
  const monthlyDataPromises = [];
  const today = new Date();

  // Calculate dates for the past 12 months
  for (let i = 0; i < 12; i++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth() - i, 1); // Get the 1st day of the month
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0'); // Use the 1st day
    const formattedDate = `${year}${month}${day}`;

    const apiUrl = `${apiBaseUrl}?response=json&date=${formattedDate}&stockNo=${stockCode}`;

    // Push the promise for the API call
    monthlyDataPromises.push(
      axios.get(apiUrl).catch(error => {
        console.error(`Error fetching data for ${formattedDate}:`, error.message);
        return null; // Return null for failed requests
      })
    );
  }

  try {
    // Wait for all monthly requests to complete
    const monthlyResponses = await Promise.all(monthlyDataPromises);

    let combinedData = [];
    let fields = [];
    let title = '';
    let notes = '';
    let firstSuccessfulResponse = null;

    // Process responses and combine data
    monthlyResponses.forEach(response => {
      if (response && response.data && response.data.data) {
        if (!firstSuccessfulResponse) {
            firstSuccessfulResponse = response.data;
            fields = response.data.fields;
            title = response.data.title;
            notes = response.data.notes;
        }
        combinedData = combinedData.concat(response.data.data);
      }
    });

    if (combinedData.length === 0) {
        // If no data was successfully fetched for any month
        return res.status(404).json({ error: 'No data found for the past 12 months' });
    }

    // The TWSE API returns data in reverse chronological order (latest date first).
    // To get chronological order, we should reverse the combined data array.
    combinedData.reverse();

    // Construct the final response object
    const finalResponse = {
      date: new Date().toISOString().slice(0, 10).replace(/-/g, ''), // Use current date or the latest date from data
      fields: fields,
      data: combinedData,
      title: title || `個股日成交資訊 - ${stockCode}`,
      notes: notes || "此為近 12 個月的真實數據。"
    };

    res.json(finalResponse);

  } catch (error) {
    console.error(`Error processing yearly data for ${stockCode}:`, error);
    res.status(500).json({ error: 'Failed to fetch or process yearly stock data' });
  }
}); // Add closing parenthesis and semicolon here


// Serve Swagger UI at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});