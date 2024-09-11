const express = require("express");
const cors = require("cors");
const https = require("https");

const app = express();
const port = 3000;

// 設置忽略憑證驗證的選項
const agent = new https.Agent({ rejectUnauthorized: false });

// 正確地設置 CORS 中間件
app.use(
  cors({
    origin: "http://127.0.0.1:5500", // 根據您的前端開發伺服器地址
    methods: "GET,POST,OPTIONS", // 允許的 HTTP 方法
    allowedHeaders: "Content-Type, Authorization", // 允許的標頭
    credentials: true, // 如果需要傳遞 Cookie，設置此選項為 true
  })
);

app.use(express.json());

// 處理 OPTIONS 預檢請求
app.options("*", cors());

// 定義 API 路由
app.post("/fetch-data", async (req, res) => {
  console.log("Received POST request at /fetch-data");
  console.log("Request body:", req.body);

  const { startDate, endDate, chargerNumber, placeNumber } = req.body; // 從請求中取得日期、充電樁編號和場域編號

  try {
    const yearMonth = startDate.slice(0, 7).replace("-", "");
    const daysDifference = calculateDaysDifference(startDate, endDate); // 計算天數
    const data = await fetchData(
      startDate,
      endDate,
      yearMonth,
      chargerNumber,
      placeNumber
    );
    const totalHours = calculateTotalHours(data);
    const operatingRate = ((totalHours / (24 * daysDifference)) * 100).toFixed(
      2
    ); // 使用計算出的天數

    res.json({
      totalHours: totalHours.toFixed(2),
      operatingRate,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Error fetching data" });
  }
});

// 計算選擇的日期範圍內的天數
function calculateDaysDifference(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const differenceInTime = end.getTime() - start.getTime();
  const differenceInDays = differenceInTime / (1000 * 3600 * 24) + 1; // 計算天數
  console.log("Total days difference:", differenceInDays);
  return differenceInDays;
}

// 從 Elasticsearch 取得資料
async function fetchData(
  startDate,
  endDate,
  yearMonth,
  chargerNumber,
  placeNumber
) {
  console.log(
    `Fetching data with startDate: ${startDate}, endDate: ${endDate}, yearMonth: ${yearMonth}, chargerNumber: ${chargerNumber}, placeNumber: ${placeNumber}`
  );

  const postData = JSON.stringify({
    query: {
      bool: {
        must: [
          {
            term: {
              "keyword_charger_name.keyword": chargerNumber, // 動態插入充電樁編號
            },
          },
          {
            range: {
              datetime_time: {
                gte: `${startDate}T00:00:00`,
                lte: `${endDate}T23:59:59`,
              },
            },
          },
        ],
      },
    },
    size: 1000,
  });

  const options = {
    hostname: "neopower.com.tw",
    port: 9200,
    path: `/np${placeNumber}-charginginfo-${yearMonth}/_search`, // 使用 placeNumber 動態構建路徑
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from("elastic:neopower83515567").toString("base64"),
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData),
    },
    agent: new https.Agent({ rejectUnauthorized: false }),
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        console.log("Response data from Elasticsearch:", data);
        try {
          const parsedData = JSON.parse(data);
          resolve(parsedData);
        } catch (error) {
          console.error("Error parsing response data:", error);
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      console.error("Error during HTTPS request:", error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 計算總時數的函數
function calculateTotalHours(data) {
  const items = data.hits.hits || [];
  const groupedData = {};

  items.forEach((item) => {
    const plate = item._source.keyword_license_plate;
    if (!groupedData[plate]) {
      groupedData[plate] = [];
    }
    groupedData[plate].push(new Date(item._source.datetime_time));
  });

  console.log("Grouped data:", groupedData); // Log grouped data

  let totalMilliseconds = 0;

  for (const plate in groupedData) {
    const times = groupedData[plate];
    times.sort((a, b) => a - b);

    for (let i = 1; i < times.length; i++) {
      totalMilliseconds += times[i] - times[i - 1];
    }
  }

  console.log("Total milliseconds:", totalMilliseconds); // Log total milliseconds

  const totalHours = totalMilliseconds / (1000 * 60 * 60);
  console.log("Total hours:", totalHours); // Log total hours
  return totalHours;
}

// 啟動伺服器
app.listen(port, () => {
  console.log(`伺服器正在 http://localhost:${port} 上運行`);
});
