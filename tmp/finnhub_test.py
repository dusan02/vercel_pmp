import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://finnhub.io/api/v1/stock/financials-reported?symbol=LLY&freq=annual&token=d28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0"
req = urllib.request.Request(url)
with urllib.request.urlopen(req, context=ctx) as response:
    data = json.loads(response.read().decode())
    report = data['data'][0]['report'] if data.get('data') else None
    if report and 'bs' in report:
        keys = [item['concept'] for item in report['bs']]
        cash_keys = [k for k in keys if 'cash' in k.lower()]
        print("BS Cash Keys:", cash_keys)
    else:
        print("no data")
