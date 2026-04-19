import urllib.request
import json
import ssl
import sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://finnhub.io/api/v1/stock/financials-reported?symbol=LLY&freq=annual&token=d28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0"
req = urllib.request.Request(url)
with urllib.request.urlopen(req, context=ctx) as response:
    data = json.loads(response.read().decode())
    
if not data.get('data'):
    print("No data")
    sys.exit()

report = data['data'][0]
print(f"Period: {report['year']} {report['quarter']}")
print(f"End Date: {report['endDate']}")
print("---")

def list_concepts(section_key, section_name):
    print(f"\n{section_name}:")
    for item in report['report'].get(section_key, []):
        if 'concept' in item:
            print(f"  {item['concept']} = {item.get('value', 'N/A')}")

list_concepts('ic', 'Income Statement (ic)')
list_concepts('bs', 'Balance Sheet (bs)')
list_concepts('cf', 'Cash Flow (cf)')
