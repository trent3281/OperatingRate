const https = require('https');
const { URL } = require('url');

// 設置忽略憑證驗證的選項
const agent = new https.Agent({ rejectUnauthorized: false });

function fetchData() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      "query": {
        "bool": {
          "must": [
            {
              "term": {
                "keyword_charger_name.keyword": "13-1"
              }
            },
            {
              "term": {
                "datetime_time": "2024-09-11"
              }
            }
          ]
        }
      },
      "size": 1000
    });

    const options = {
      hostname: 'neopower.com.tw',
      port: 9200,
      path: '/np01-charginginfo-202409/_search',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from('elastic:neopower83515567').toString('base64'),
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      },
      agent: agent // 使用忽略憑證驗證的代理
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve(parsedData);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    // 發送請求數據
    req.write(postData);
    req.end();
  });
}

// 計算總時數的函數
function calculateTotalHours(data) {
  const items = data.hits.hits;

  // 將資料依據 keyword_license_plate 分組
  const groupedData = {};
  items.forEach(item => {
    const plate = item._source.keyword_license_plate;
    if (!groupedData[plate]) {
      groupedData[plate] = [];
    }
    groupedData[plate].push(new Date(item._source.datetime_time));
  });

  let totalMilliseconds = 0;

  // 遍歷每個車牌組
  for (const plate in groupedData) {
    const times = groupedData[plate];

    // 排序日期
    times.sort((a, b) => a - b);

    // 計算每個車牌組的總時數
    for (let i = 1; i < times.length; i++) {
      totalMilliseconds += times[i] - times[i - 1];
    }
  }

  // 計算總時數，扣除車牌更換期間的時間
  const totalHours = totalMilliseconds / (1000 * 60 * 60);

  return totalHours;
}

// 主函數
async function main() {
  try {
    const data = await fetchData();
    const totalHours = calculateTotalHours(data);
    console.log(`Total times: ${(totalHours).toFixed(2)} hr`);
    console.log(`Operating Rate: ${(((totalHours ) / (24*30)) * 100).toFixed(2)} %`);

    // 檢查資料內容
    // console.log(JSON.stringify(data, null, 2));


  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

// 執行主函數
main();
