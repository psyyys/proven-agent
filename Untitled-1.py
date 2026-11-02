"""
下载攀枝花逐日降水数据，保存为 CSV，用于测试 Agent。

数据来源：Open-Meteo Historical Weather API（免费、无需 API key）
底层数据：ECMWF ERA5 / ERA5-Land 再分析数据（格点数据，不是单个雨量站实测）
位置：攀枝花市区附近（26.58°N, 101.72°E）

用法：
    python get_panzhihua_rain.py
    python get_panzhihua_rain.py 2020-01-01 2025-12-31   # 自定义起止日期

只用 Python 标准库，不需要 pip install 任何东西。
"""

import csv
import json
import sys
import urllib.parse
import urllib.request

LAT, LON = 26.58, 101.72
START = sys.argv[1] if len(sys.argv) > 1 else "2015-01-01"
END = sys.argv[2] if len(sys.argv) > 2 else "2025-12-31"
OUT = f"panzhihua_daily_rain_{START[:4]}_{END[:4]}.csv"

params = {
    "latitude": LAT,
    "longitude": LON,
    "start_date": START,
    "end_date": END,
    "daily": "precipitation_sum,rain_sum,precipitation_hours,temperature_2m_mean",
    "timezone": "Asia/Shanghai",
}
url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(params)

print(f"正在下载 {START} 至 {END} 的数据……")
with urllib.request.urlopen(url, timeout=60) as resp:
    data = json.load(resp)

daily = data["daily"]
rows = zip(
    daily["time"],
    daily["precipitation_sum"],
    daily["rain_sum"],
    daily["precipitation_hours"],
    daily["temperature_2m_mean"],
)

with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["date", "precipitation_mm", "rain_mm", "precipitation_hours", "temp_mean_c"])
    n = 0
    for r in rows:
        w.writerow(r)
        n += 1

print(f"完成：{n} 天的数据已保存到 {OUT}")
print(f"格点海拔：{data.get('elevation')} m（市区实际约 1100–1200 m，存在偏差）")