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
  const { stockCodes } = req.body; // stockCodes are now prefixed, e.g., ["tse_2330.tw", "otc_6446.tw"]

  if (!stockCodes || !Array.isArray(stockCodes) || stockCodes.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty stockCodes array' });
  }

  const results = {};
  const apiBaseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

  // Construct the ex_ch parameter for all requested stock codes
  const exChParam = stockCodes.map(code => {
    if (code.startsWith('otc_')) {
      // For OTC stocks, format as otc_CODE.tw
      return `${code}.tw`;
    } else if (code.startsWith('tse_')) {
      // Already correctly formatted TSE stock
      return `${code}.tw`;
    } else {
      // For TSE stocks (or if no prefix), format as tse_CODE.tw
      return `tse_${code}.tw`;
    }
  }).join('|');
  const apiUrl = `${apiBaseUrl}?ex_ch=${exChParam}`;

  let apiData = null; // Declare apiData outside the try block
  let fetchError = false;
  try {
    console.log(`Fetching data from TWSE API: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    apiData = response.data;

    console.log('Received data from TWSE API. Structure:', typeof apiData, Array.isArray(apiData) ? `Array length: ${apiData.length}` : '');
    if (apiData && Array.isArray(apiData.msgArray) && apiData.msgArray.length > 0) {
        console.log('Sample data item from msgArray:', apiData.msgArray[0]);
    } else {
        console.log('No data or unexpected data format received from API.');
    }

    // --- Process data from the new API ---
    if (apiData && Array.isArray(apiData.msgArray)) {
        apiData.msgArray.forEach(stockInfo => {
            const codeWithPrefix = stockInfo.ch; // The API returns the code with prefix, e.g., tse_2330.tw or otc_0050.tw
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
            
            // Determine the key for results object based on original request
            // Find the original code from stockCodes that matches stockInfo.c or stockInfo.ch
            const originalCode = stockCodes.find(sc => sc.includes(code) || codeWithPrefix.includes(sc));

            results[originalCode || code] = { // Use originalCode if found, otherwise fallback to code from API
                Code: code, // Store the code without prefix from API
                Name: name || 'N/A',
                InstantPrice: isNaN(latestPrice) ? 'N/A' : latestPrice.toFixed(2), // Include instant price
                PriceChange: priceChange,
                ChangePercentage: changePercentage,
                YesterdayClose: stockInfo.y ? parseFloat(stockInfo.y).toFixed(2) : 'N/A', // Add yesterday's closing price
                t: stockInfo.t, // Add latest trade time
                v: stockInfo.v, // Add trade volume
                UpperLimit: stockInfo.u ? parseFloat(stockInfo.u).toFixed(2) : 'N/A', // 涨停板价格
                LowerLimit: stockInfo.w ? parseFloat(stockInfo.w).toFixed(2) : 'N/A',  // 跌停板价格
                Market: stockInfo.ex || (codeWithPrefix.startsWith('otc') ? 'otc' : 'tse') // 市场类型：上市/上柜
            };
        });
    } else {
         stockCodes.forEach(code => {
             results[code] = { error: 'API data format unexpected or empty' };
         });
    }

  } catch (error) {
    console.error(`Error fetching data from TWSE API:`, error);
    fetchError = true; // Set error flag
    stockCodes.forEach(code => {
        results[code] = { error: 'Could not fetch data from new API' };
    });
  }

  // Check for fetch errors before attempting to access apiData
  if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch data from API', stockData: results });
  }

  // If no fetch error, proceed with processing and sending the response
  const finalResponse = {
    sysTime: apiData.sysTime || null, // Include sysTime from the API response
    stockData: results // Wrap the stock data in a 'stockData' key
  };

  res.json(finalResponse);
});
/**
 * @swagger
 * /api/user-stocks:
 *   get:
 *     summary: Get user's saved stock data
 *     description: Retrieves the stock data saved by the user from the backend file.
 *     responses:
 *       200:
 *         description: Successfully retrieved user's stock data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   Code:
 *                     type: string
 *                   Name:
 *                     type: string
 *                   InstantPrice:
 *                     type: string
 *                   PriceChange:
 *                     type: string
 *                   ChangePercentage:
 *                     type: string
 *                   YesterdayClose:
 *                     type: string
 *                   t:
 *                     type: string
 *                   v:
 *                     type: string
 *       500:
 *         description: Failed to read user's stock data from file.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *   post:
 *     summary: Save user's stock data
 *     description: Saves the provided stock data to the backend file, overwriting existing data.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: object
 *               properties:
 *                 Code:
 *                   type: string
 *                 Name:
 *                   type: string
 *                 InstantPrice:
 *                   type: string
 *                 PriceChange:
 *                   type: string
 *                 ChangePercentage:
 *                   type: string
 *                 YesterdayClose:
 *                   type: string
 *                 t:
 *                   type: string
 *                 v:
 *                   type: string
 *     responses:
 *       200:
 *         description: Successfully saved user's stock data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Failed to write user's stock data to file.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.get('/api/user-stocks', (req, res) => {
  fs.readFile(dataFilePath, (err, data) => {
    if (err) {
      console.error('Error reading stock data file:', err);
      return res.status(500).json({ error: 'Failed to read stock data' });
    }
    try {
      const stockData = JSON.parse(data);
      res.json(stockData);
    } catch (parseError) {
      console.error('Error parsing stock data file:', parseError);
      res.status(500).json({ error: 'Failed to parse stock data' });
    }
  });
});

app.post('/api/user-stocks', (req, res) => {
  const stockDataToSave = req.body;
  fs.writeFile(dataFilePath, JSON.stringify(stockDataToSave, null, 2), (err) => {
    if (err) {
      console.error('Error writing stock data file:', err);
      return res.status(500).json({ error: 'Failed to save stock data' });
    }
    console.log('Stock data saved to', dataFilePath);
    res.json({ message: 'Stock data saved successfully' });
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


      // Calculate ValueDiff (z - y)
      let valueDiff = 'N/A';
      if (taiexValue && yesterdayClose) {
          const value = parseFloat(taiexValue);
          const close = parseFloat(yesterdayClose);
          if (!isNaN(value) && !isNaN(close)) {
              valueDiff = (value - close).toFixed(2);
          }
      }

      const formattedData = {
        taiexData: {
          Value: taiexValue ? parseFloat(taiexValue).toFixed(2) : 'N/A',
          ChangePercentage: changePercentage,
          ValueDiff: valueDiff // Add the calculated ValueDiff
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

// 添加健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});